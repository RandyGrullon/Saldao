// Corre la migración real en PGlite (Postgres en WASM) con un "auth" mínimo de imitación,
// y prueba las reglas que importan: RLS, que los gastos cuadren, permisos y reclamar un marcador.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

// Todas las migraciones, en orden, como las aplica Supabase.
const dir = new URL('../migrations/', import.meta.url);
const sql = readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(f, dir), 'utf8')).join(';\n');
const db = new PGlite();
const U = { ana: '00000000-0000-0000-0000-00000000000a', beto: '00000000-0000-0000-0000-00000000000b', cris: '00000000-0000-0000-0000-00000000000c', dani: '00000000-0000-0000-0000-00000000000d' };

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('test.uid', '${user ?? ''}', false);`);
  if (user) await db.exec('set role authenticated;');
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const one = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows[0];
const all = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows;
const pid = (u: string) => one<{ id: string }>('select id from profiles where user_id = $1', [u]).then(r => r.id);

beforeAll(async () => {
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', encrypted_password text default '');
    -- PGlite no trae pgcrypto: un crypt de imitación que se usa igual (hash = crypt(clave, hash))
    create schema extensions;
    create function extensions.crypt(p text, salt text) returns text language sql immutable as $$ select 'h:' || p $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant usage on schema public to anon;
    grant execute on function auth.uid() to authenticated;
    -- como en Supabase: cada tabla y función nueva de public queda abierta a anon y authenticated (la migración de
    -- seguridad lo cierra; aquí se prueba que lo cierra de verdad)
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  await db.exec(sql);
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data, encrypted_password) values
    ('${U.ana}', 'ana@ejemplo.do', '{"full_name":"Ana Peña","username":"Ana.Pena"}', 'h:secreto123'), ('${U.beto}', 'beto@ejemplo.do', '{}', ''), ('${U.cris}', 'cris@ejemplo.do', '{}', '');`);
}, 60000);

describe('migración', () => {
  let g: string, ana: string, beto: string, marcador: string, gasto: string;

  it('crea un perfil al registrarse', async () => {
    ana = await pid(U.ana); beto = await pid(U.beto);
    expect((await one('select name from profiles where id = $1', [ana])).name).toBe('Ana Peña');
    expect((await one('select name from profiles where id = $1', [beto])).name).toBe('beto');
  });

  it('crear grupo y agregar a alguien sin cuenta', async () => {
    g = await as(U.ana, async () => (await one<{ g: string }>(`select create_group('Samaná', 'viaje') as g`)).g);
    marcador = await as(U.ana, async () => (await one<{ p: string }>(`select add_placeholder($1, 'Beto') as p`, [g])).p);
    const miembros = await as(U.ana, () => all('select profile_id, role from group_members where group_id = $1', [g]));
    expect(miembros).toHaveLength(2);
  });

  it('los de afuera no ven el grupo ni sus perfiles', async () => {
    expect(await as(U.cris, () => all('select * from groups'))).toHaveLength(0);
    expect(await as(U.cris, () => all('select * from profiles where id = $1', [ana]))).toHaveLength(0);
  });

  it('un gasto que no cuadra se rechaza', async () => {
    const bad = { group_id: g, description: 'Villa', amount: 10000, payers: { [ana]: 10000 }, shares: { [ana]: 5000, [marcador]: 4000 } };
    await expect(as(U.ana, () => one('select save_expense($1)', [JSON.stringify(bad)]))).rejects.toThrow(/No cuadra/);
  });

  it('un gasto con alguien de afuera se rechaza', async () => {
    const bad = { group_id: g, description: 'Villa', amount: 100, payers: { [ana]: 100 }, shares: { [beto]: 100 } };
    await expect(as(U.ana, () => one('select save_expense($1)', [JSON.stringify(bad)]))).rejects.toThrow(/no son del grupo/);
  });

  it('guarda un gasto válido con su actividad', async () => {
    const ok = { group_id: g, description: 'Villa', amount: 10000, split_mode: 'equal', payers: { [ana]: 10000 }, shares: { [ana]: 5000, [marcador]: 5000 } };
    gasto = await as(U.ana, async () => (await one<{ id: string }>('select save_expense($1) as id', [JSON.stringify(ok)])).id);
    const verbs = await as(U.ana, () => all('select verb from activity where group_id = $1 order by id', [g]));
    expect(verbs.map(v => v.verb)).toEqual(['grupo_creado', 'miembro_agregado', 'gasto_creado']);
  });

  it('nadie escribe en las tablas directamente', async () => {
    await expect(as(U.ana, () => db.query(`insert into expenses (group_id, description, amount, created_by) values ($1, 'x', 1, $2)`, [g, ana])))
      .rejects.toThrow();
  });

  it('Beto se une por invitación y reclama su lugar: el gasto pasa a su cuenta', async () => {
    const token = (await one('select invite_token from groups where id = $1', [g])).invite_token;
    const prev = await as(U.beto, () => one('select invite_preview($1) as p', [token]));
    expect(prev.p.placeholders).toEqual([{ id: marcador, name: 'Beto' }]);
    await as(U.beto, () => one('select join_group($1, $2)', [token, marcador]));
    const parte = await as(U.beto, () => one('select amount from expense_shares where expense_id = $1 and profile_id = $2', [gasto, beto]));
    expect(Number(parte.amount)).toBe(5000);
    expect(await one('select count(*)::int as n from profiles where id = $1', [marcador])).toEqual({ n: 0 });
  });

  it('el pago lo confirma solo quien lo recibe', async () => {
    const pago = { group_id: g, description: 'Pago', amount: 5000, is_payment: true, split_mode: 'payment', payers: { [beto]: 5000 }, shares: { [ana]: 5000 } };
    const id = await as(U.beto, async () => (await one<{ id: string }>('select save_expense($1) as id', [JSON.stringify(pago)])).id);
    expect((await one('select payment_status from expenses where id = $1', [id])).payment_status).toBe('pendiente');
    await expect(as(U.beto, () => one('select confirm_payment($1)', [id]))).rejects.toThrow(/Solo quien recibe/);
    await as(U.ana, () => one('select confirm_payment($1)', [id]));
    expect((await one('select payment_status from expenses where id = $1', [id])).payment_status).toBe('confirmado');
  });

  it('borrar y restaurar dejan rastro', async () => {
    await as(U.beto, () => one('select delete_expense($1)', [gasto]));
    expect((await one('select deleted_at from expenses where id = $1', [gasto])).deleted_at).not.toBeNull();
    await as(U.ana, () => one('select restore_expense($1)', [gasto]));
    expect((await one('select deleted_at from expenses where id = $1', [gasto])).deleted_at).toBeNull();
  });

  it('comentar crea actividad', async () => {
    await as(U.beto, () => db.query('insert into comments (expense_id, profile_id, body) values ($1, $2, $3)', [gasto, beto, 'Gracias']));
    const last = await as(U.ana, () => one(`select verb, payload from activity where group_id = $1 order by id desc limit 1`, [g]));
    expect(last).toEqual({ verb: 'comentario', payload: { texto: 'Gracias' } });
  });

  it('agregar a un grupo nuevo solo a gente de tus grupos', async () => {
    const g2 = await as(U.ana, async () => (await one<{ g: string }>(`select create_group('Apto', 'casa') as g`)).g);
    await as(U.ana, () => one('select add_member($1, $2)', [g2, beto]));
    expect(await as(U.beto, () => all('select id from groups where id = $1', [g2]))).toHaveLength(1);
    const cris = await pid(U.cris);
    await expect(as(U.ana, () => one('select add_member($1, $2)', [g2, cris]))).rejects.toThrow(/otros grupos/);
  });

  it('las funciones internas no se pueden llamar desde la API', async () => {
    await expect(as(U.cris, () => one('select merge_profiles($1, $2)', [beto, ana]))).rejects.toThrow(/permission denied/);
    await db.exec(`reset role; set role anon;`);
    await expect(db.query('select invite_preview($1)', ['00000000-0000-0000-0000-000000000000'])).rejects.toThrow(/permission denied/);
    await db.exec('reset role;');
  });

  it('un comentario no se mueve a un gasto de otro grupo', async () => {
    const otro = await as(U.cris, async () => (await one<{ g: string }>(`select create_group('Cris', 'otro') as g`)).g);
    const cris = await pid(U.cris);
    const ajeno = await as(U.cris, async () => (await one<{ id: string }>('select save_expense($1) as id',
      [JSON.stringify({ group_id: otro, description: 'x', amount: 100, payers: { [cris]: 100 }, shares: { [cris]: 100 } })])).id);
    const mio = await as(U.beto, async () => (await one('select id from comments where profile_id = $1 limit 1', [beto])).id);
    const r = await as(U.beto, () => db.query('update comments set expense_id = $1 where id = $2', [ajeno, mio]).then(() => 'ok', e => e.message));
    expect(r).toMatch(/permission denied|row-level security|violates/);
  });

  it('gastos de dos sin grupo usan un grupo directo reutilizable', async () => {
    const d1 = await as(U.ana, async () => (await one<{ g: string }>('select direct_group($1) as g', [beto])).g);
    const d2 = await as(U.beto, async () => (await one<{ g: string }>('select direct_group($1) as g', [ana])).g);
    expect(d1).toBe(d2);
    await expect(as(U.cris, () => one('select direct_group($1)', [ana]))).rejects.toThrow(/personas de tus grupos/);
  });
});

describe('usuario para entrar', () => {
  const anon = async <T>(fn: () => Promise<T>) => {
    await db.exec('reset role; set role anon;');
    try { return await fn(); } finally { await db.exec('reset role;'); }
  };
  const login = (u: string, p: string) => anon(() => one<{ e: string | null }>('select login_email($1, $2) as e', [u, p]).then(r => r.e));

  it('el usuario del registro queda en el perfil, en minúsculas', async () => {
    expect((await one('select username from profiles where user_id = $1', [U.ana])).username).toBe('ana.pena');
    expect((await one('select username from profiles where user_id = $1', [U.beto])).username).toBeNull();
  });

  it('un usuario repetido al registrarse queda vacío en vez de fallar', async () => {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'dani@ejemplo.do', '{"username":"ana.pena"}')`, [U.dani]);
    expect((await one('select username from profiles where user_id = $1', [U.dani])).username).toBeNull();
  });

  it('sin sesión se puede ver si un usuario está libre', async () => {
    expect(await anon(() => one('select username_available($1) as ok', ['ANA.pena']))).toEqual({ ok: false });
    expect(await anon(() => one('select username_available($1) as ok', ['dani_88']))).toEqual({ ok: true });
    expect(await anon(() => one('select username_available($1) as ok', ['ab']))).toEqual({ ok: false });
  });

  it('el correo solo sale con la contraseña correcta', async () => {
    expect(await login('ana.pena', 'otra')).toBeNull();
    expect(await login('nadie', 'secreto123')).toBeNull();
    expect(await login(' Ana.Pena ', 'secreto123')).toBe('ana@ejemplo.do');
  });

  it('5 intentos fallidos bloquean el usuario aunque después acierte', async () => {
    for (let i = 0; i < 5; i++) expect(await login('ana.pena', 'mal')).toBeNull();
    await expect(login('ana.pena', 'secreto123')).rejects.toThrow(/Demasiados intentos/);
  });

  it('nadie lee los intentos por la API', async () => {
    await expect(as(U.ana, () => all('select * from login_attempts'))).rejects.toThrow(/permission denied/);
  });

  it('cada quien cambia su usuario, con formato válido y sin repetir', async () => {
    await expect(as(U.beto, () => db.query(`update profiles set username = 'ana.pena' where user_id = $1`, [U.beto]))).rejects.toThrow(/duplicate key/);
    await expect(as(U.beto, () => db.query(`update profiles set username = 'Beto!' where user_id = $1`, [U.beto]))).rejects.toThrow(/check constraint/);
    await as(U.beto, () => db.query(`update profiles set username = 'beto' where user_id = $1`, [U.beto]));
    expect(await anon(() => one('select username_available($1) as ok', ['beto']))).toEqual({ ok: false });
  });
});

// Lo que se revisa en el catálogo: si mañana alguien agrega una tabla o función y se le olvida cerrarla, falla aquí.
describe('seguridad', () => {
  const anon = async <T>(fn: () => Promise<T>) => {
    await db.exec('reset role; set role anon;');
    try { return await fn(); } finally { await db.exec('reset role;'); }
  };
  const fromIp = (ip: string) => db.query(`select set_config('request.headers', $1, false)`, [ip ? JSON.stringify({ 'x-real-ip': ip }) : '']);
  const names = (rows: { n: string }[]) => rows.map(r => r.n).sort();
  const runnable = (role: string) => all<{ n: string }>(`select p.proname as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname in ('public', 'private') and has_function_privilege($1, p.oid, 'execute')`, [role]).then(names);
  const writable = (role: string, priv: string) => all<{ n: string }>(`select c.relname as n from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname in ('public', 'private') and c.relkind = 'r' and has_any_column_privilege($1, c.oid, $2)`, [role, priv]).then(names);

  it('todas las tablas de public tienen RLS', async () => {
    expect(await all(`select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)).toEqual([]);
  });

  it('cada función con security definer fija su search_path', async () => {
    expect(await all(`select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
      where s.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`)).toEqual([]);
  });

  it('sin sesión solo se puede entrar y ver si un usuario está libre', async () => {
    expect(await runnable('anon')).toEqual(['login_email', 'username_available']);
  });

  it('con sesión, solo las funciones de la app y las que usan las reglas', async () => {
    expect(await runnable('authenticated')).toEqual([
      'add_member', 'add_placeholder', 'can_edit', 'confirm_payment', 'create_group', 'current_profile_id', 'delete_expense',
      'direct_group', 'invite_preview', 'is_admin', 'is_member', 'join_group', 'login_email', 'regenerate_invite', 'restore_expense',
      'save_expense', 'shares_group', 'username_available'].sort());
  });

  it('nadie escribe directo, salvo comentar y editar su perfil', async () => {
    for (const p of ['SELECT', 'INSERT', 'UPDATE']) expect(await writable('anon', p)).toEqual([]);
    expect(await writable('authenticated', 'INSERT')).toEqual(['comments']);
    expect(await writable('authenticated', 'UPDATE')).toEqual(['comments', 'profiles']);
    expect(await all(`select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname in ('public', 'private') and c.relkind = 'r'
        and (has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('authenticated', c.oid, 'truncate'))`)).toEqual([]);
  });

  it('de tu perfil cambias nombre, usuario y dónde te pagan, pero no el correo ni la cuenta dueña', async () => {
    await expect(as(U.beto, () => db.query(`update profiles set email = 'otro@ejemplo.do' where user_id = $1`, [U.beto]))).rejects.toThrow(/permission denied/);
    await expect(as(U.beto, () => db.query(`update profiles set user_id = $1 where user_id = $2`, [U.cris, U.beto]))).rejects.toThrow(/permission denied/);
  });

  it('nombres con caracteres de control y fechas del futuro se rechazan', async () => {
    await expect(as(U.cris, () => one(`select create_group($1, 'otro')`, ['Hola\u0007mundo']))).rejects.toThrow(/groups_name_limpio/);
    const g = await as(U.cris, async () => (await one<{ g: string }>(`select create_group('Fechas', 'otro') as g`)).g);
    const cris = await pid(U.cris);
    const gasto = { group_id: g, description: 'x', amount: 100, date: '2999-01-01', payers: { [cris]: 100 }, shares: { [cris]: 100 } };
    await expect(as(U.cris, () => one('select save_expense($1)', [JSON.stringify(gasto)]))).rejects.toThrow(/futuro/);
  });

  it('ver si un usuario está libre tiene tope por conexión', async () => {
    await fromIp('10.0.0.1');
    for (let i = 0; i < 120; i++) await anon(() => one('select username_available($1)', [`libre_${i}`]));
    await expect(anon(() => one('select username_available($1)', ['otro_mas']))).rejects.toThrow(/muy rápido/);
    await fromIp('10.0.0.2');
    expect(await anon(() => one('select username_available($1) as ok', ['otro_mas']))).toEqual({ ok: true });
  });

  it('probar una contraseña contra muchos usuarios desde una conexión se frena', async () => {
    await fromIp('10.0.0.3');
    const login = (u: string) => anon(() => one<{ e: string | null }>('select login_email($1, $2) as e', [u, 'clave']).then(r => r.e));
    for (let i = 0; i < 30; i++) expect(await login(`persona_${i}`)).toBeNull();
    await expect(login('beto')).rejects.toThrow(/esta conexión/);
    await fromIp('');
  });

  it('probar enlaces de invitación al azar se frena', async () => {
    const random = () => crypto.randomUUID();
    for (let i = 0; i < 20; i++) expect((await as(U.cris, () => one('select invite_preview($1) as p', [random()]))).p).toBeNull();
    await expect(as(U.cris, () => one('select invite_preview($1)', [random()]))).rejects.toThrow(/demasiados enlaces/);
  });

  it('comentar sin parar se frena', async () => {
    const g = await as(U.cris, async () => (await one<{ g: string }>(`select create_group('Chat', 'otro') as g`)).g);
    const cris = await pid(U.cris);
    const e = await as(U.cris, async () => (await one<{ id: string }>('select save_expense($1) as id',
      [JSON.stringify({ group_id: g, description: 'x', amount: 100, payers: { [cris]: 100 }, shares: { [cris]: 100 } })])).id);
    const comment = (n: number) => as(U.cris, () => db.query('insert into comments (expense_id, profile_id, body) values ($1, $2, $3)', [e, cris, `hola ${n}`]));
    for (let i = 0; i < 60; i++) await comment(i);
    await expect(comment(60)).rejects.toThrow(/muy rápido/);
  });
});

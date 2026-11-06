// Corre la migración real en PGlite (Postgres en WASM) con un "auth" mínimo de imitación,
// y prueba las reglas que importan: RLS, que los gastos cuadren, permisos y reclamar un marcador.
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { LEGAL_VERSION } from '../../packages/core/src/legal';
import { migratedDb } from './db';

let db: PGlite;
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
  db = await migratedDb();
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
    expect(await as(U.cris, () => all('select id, name from profiles where id = $1', [ana]))).toHaveLength(0);
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
      'accept_legal', 'add_member', 'add_placeholder', 'apply_op', 'can_edit', 'confirm_payment', 'create_group', 'current_profile_id', 'delete_account',
      'delete_expense', 'direct_group', 'invite_preview', 'is_admin', 'is_member', 'join_group', 'login_email', 'regenerate_invite',
      'restore_expense', 'save_expense', 'shares_group', 'username_available',
      // las 20 mejoras
      'add_item', 'catch_up_recurring', 'create_fund', 'delete_item', 'delete_push_token', 'leave_group', 'save_push_token', 'scan_quota',
      'set_expense_photo', 'set_member_role', 'toggle_item', 'update_group', 'remove_member', 'rename_placeholder'].sort());
  });

  it('a quién avisar solo lo sabe la función de avisos (clave de servicio)', async () => {
    expect(await runnable('service_role')).toContain('push_targets');
    expect(await runnable('authenticated')).not.toContain('push_targets');
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

  it('el correo de un perfil no lo ven los demás del grupo', async () => {
    await expect(as(U.beto, () => all('select email from profiles'))).rejects.toThrow(/permission denied/);
    expect(await as(U.beto, () => all('select name from profiles where user_id = $1', [U.ana]))).toHaveLength(1);
  });
});

describe('términos, privacidad y borrar la cuenta', () => {
  const U2 = { eva: '00000000-0000-0000-0000-0000000000e1', fede: '00000000-0000-0000-0000-0000000000f1' };
  const version = async () => (await one<{ v: string }>('select private.legal_version() as v')).v;

  it('la versión es la misma en la base, la app y las dos páginas', async () => {
    const v = await version();
    expect(LEGAL_VERSION).toBe(v);
    for (const page of ['terminos', 'privacidad'])
      expect(readFileSync(new URL(`../../public/${page}.html`, import.meta.url), 'utf8')).toContain(`Versión ${v}`);
  });

  it('registrarse con correo guarda la aceptación; con Google la pide la app', async () => {
    const v = await version();
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'eva@ejemplo.do', $2), ($3, 'fede@ejemplo.do', '{"full_name":"Fede"}')`,
      [U2.eva, JSON.stringify({ full_name: 'Eva', legal: v }), U2.fede]);
    expect(await as(U2.eva, () => all('select version from legal_acceptances'))).toEqual([{ version: v }]);
    expect(await as(U2.fede, () => all('select version from legal_acceptances'))).toEqual([]);
    await expect(as(U2.fede, () => one(`select accept_legal('2020-01-01')`))).rejects.toThrow(/más nueva/);
    await as(U2.fede, () => one('select accept_legal($1)', [v]));
    expect(await as(U2.fede, () => all('select version from legal_acceptances'))).toEqual([{ version: v }]);
    // cada quien ve solo lo suyo
    expect(await as(U2.eva, () => all('select user_id from legal_acceptances'))).toEqual([{ user_id: U2.eva }]);
  });

  it('borrar la cuenta: se va lo personal, el nombre se queda en lo compartido y lo que era solo suyo se borra', async () => {
    const compartido = await as(U.ana, async () => (await one<{ g: string }>(`select create_group('Con Eva', 'otro') as g`)).g);
    const token = (await one('select invite_token from groups where id = $1', [compartido])).invite_token;
    await as(U2.eva, () => one('select join_group($1)', [token]));
    const solo = await as(U2.eva, async () => (await one<{ g: string }>(`select create_group('Solo Eva', 'otro') as g`)).g);
    const marcador = await as(U2.eva, async () => (await one<{ p: string }>(`select add_placeholder($1, 'Primo de Eva') as p`, [solo])).p);
    const eva = await pid(U2.eva), ana = await pid(U.ana);
    await as(U2.eva, () => db.query(`update profiles set username = 'eva.r', payout = 'Banco · 123' where id = $1`, [eva]));
    await as(U2.eva, () => one('select save_expense($1)',
      [JSON.stringify({ group_id: compartido, description: 'Cena', amount: 2000, payers: { [eva]: 2000 }, shares: { [eva]: 1000, [ana]: 1000 } })]));

    await expect(as(U2.eva, () => one(`select delete_account('borrar')`))).rejects.toThrow(/Escribe BORRAR/);
    await as(U2.eva, () => one(`select delete_account('BORRAR')`));

    expect(await one('select count(*)::int as n from auth.users where id = $1', [U2.eva])).toEqual({ n: 0 });
    expect(await one('select count(*)::int as n from legal_acceptances where user_id = $1', [U2.eva])).toEqual({ n: 0 });
    const p = await one('select name, user_id, email, username, payout, deleted_at from profiles where id = $1', [eva]);
    expect(p).toMatchObject({ name: 'Eva', user_id: null, email: null, username: null, payout: null });
    expect(p.deleted_at).not.toBeNull();
    // lo compartido sigue para Ana; lo que era solo de Eva (y quien ella agregó ahí) ya no existe
    expect(await as(U.ana, () => all('select s.amount from expense_shares s join expenses e on e.id = s.expense_id where e.group_id = $1', [compartido]))).toHaveLength(2);
    expect(await one('select count(*)::int as n from groups where id = $1', [solo])).toEqual({ n: 0 });
    expect(await one('select count(*)::int as n from profiles where id = $1', [marcador])).toEqual({ n: 0 });
    // y nadie puede reclamar su lugar con el enlace
    const prev = await as(U.beto, () => one('select invite_preview($1) as p', [token]));
    expect(prev.p.placeholders).toEqual([]);
    await expect(as(U.beto, () => one('select join_group($1, $2)', [token, eva]))).rejects.toThrow(/ya lo reclamó/);
    // sin cuenta, ya no puede hacer nada
    await expect(as(U2.eva, () => one(`select create_group('Otra', 'otro')`))).rejects.toThrow(/iniciar sesión/);
  });
});

describe('cambios sin conexión: cada uno se aplica una sola vez', () => {
  const U3 = { gia: '00000000-0000-0000-0000-0000000000a1', hugo: '00000000-0000-0000-0000-0000000000b1' };
  let g: string, gia: string, mk: string;
  const apply = (u: string, op: string, kind: string, args: object) => as(u, () => one('select apply_op($1, $2, $3) as r', [op, kind, JSON.stringify(args)]));
  const count = async (q: string, p: unknown[]) => (await one<{ n: number }>(`select count(*)::int as n from ${q}`, p)).n;
  const gasto = (o: object) => ({ group_id: g, description: 'Hielo', amount: 1000, split_mode: 'equal', payers: { [gia]: 1000 }, shares: { [gia]: 500, [mk]: 500 }, ...o });

  beforeAll(async () => {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'gia@ejemplo.do', '{"full_name":"Gia"}'), ($2, 'hugo@ejemplo.do', '{}')`, [U3.gia, U3.hugo]);
    gia = await pid(U3.gia);
    g = await as(U3.gia, async () => (await one<{ g: string }>(`select create_group('Playa', 'viaje') as g`)).g);
    mk = await as(U3.gia, async () => (await one<{ p: string }>(`select add_placeholder($1, 'Mar') as p`, [g])).p);
  });

  it('un gasto nuevo guarda el id que puso la app y, si llega dos veces, queda una sola vez', async () => {
    const op = randomUUID(), id = randomUUID();
    expect((await apply(U3.gia, op, 'save_expense', { p: gasto({ new_id: id }) })).r).toBe(id);
    expect((await apply(U3.gia, op, 'save_expense', { p: gasto({ new_id: id }) })).r).toBe(id);
    expect(await count('expenses where id = $1', [id])).toBe(1);
    expect(await count(`activity where expense_id = $1 and verb = 'gasto_creado'`, [id])).toBe(1);
  });

  it('una edición repetida cuenta una vez; un borrado y su deshacer, en orden', async () => {
    const id = randomUUID();
    await apply(U3.gia, randomUUID(), 'save_expense', { p: gasto({ new_id: id }) });
    const edit = randomUUID();
    await apply(U3.gia, edit, 'save_expense', { p: gasto({ id, description: 'Hielo y carbón', amount: 1200, payers: { [gia]: 1200 }, shares: { [gia]: 600, [mk]: 600 } }) });
    await apply(U3.gia, edit, 'save_expense', { p: gasto({ id, description: 'Hielo y carbón', amount: 1200, payers: { [gia]: 1200 }, shares: { [gia]: 600, [mk]: 600 } }) });
    expect(await count(`activity where expense_id = $1 and verb = 'gasto_editado'`, [id])).toBe(1);
    await apply(U3.gia, randomUUID(), 'delete_expense', { id });
    await apply(U3.gia, randomUUID(), 'restore_expense', { id });
    expect(await one('select description, amount::int, deleted_at from expenses where id = $1', [id])).toEqual({ description: 'Hielo y carbón', amount: 1200, deleted_at: null });
  });

  it('un comentario con su id, dos veces, queda uno', async () => {
    const e = randomUUID(), op = randomUUID(), c = randomUUID();
    await apply(U3.gia, randomUUID(), 'save_expense', { p: gasto({ new_id: e }) });
    expect((await apply(U3.gia, op, 'add_comment', { id: c, expense_id: e, body: 'Lo compré en el colmado' })).r).toBe(c);
    await apply(U3.gia, op, 'add_comment', { id: c, expense_id: e, body: 'Lo compré en el colmado' });
    expect(await count('comments where id = $1', [c])).toBe(1);
    expect(await count(`activity where expense_id = $1 and verb = 'comentario'`, [e])).toBe(1);
  });

  it('si el cambio falla no queda apartado: corregido, el mismo id entra', async () => {
    const op = randomUUID(), id = randomUUID();
    await expect(apply(U3.gia, op, 'save_expense', { p: gasto({ new_id: id, amount: 999 }) })).rejects.toThrow(/No cuadra/);
    expect((await apply(U3.gia, op, 'save_expense', { p: gasto({ new_id: id }) })).r).toBe(id);
  });

  it('el id de un cambio es de cada quien y nadie comenta fuera de sus grupos', async () => {
    const e = randomUUID(), op = randomUUID();
    await apply(U3.gia, randomUUID(), 'save_expense', { p: gasto({ new_id: e }) });
    await apply(U3.gia, op, 'add_comment', { id: randomUUID(), expense_id: e, body: 'Mío' });
    await expect(apply(U3.hugo, op, 'add_comment', { id: randomUUID(), expense_id: e, body: 'Me cuelo' })).rejects.toThrow(/No puedes comentar/);
    await expect(apply(U3.hugo, randomUUID(), 'save_expense', { p: gasto({ new_id: randomUUID() }) })).rejects.toThrow(/No perteneces/);
  });

  it('un cambio desconocido o incompleto se rechaza', async () => {
    await expect(apply(U3.gia, randomUUID(), 'borrar_todo', {})).rejects.toThrow(/no existe/);
    await expect(as(U3.gia, () => one(`select apply_op(null, 'delete_expense', '{}')`))).rejects.toThrow(/incompleto/);
  });
});

describe('las 20 mejoras', () => {
  const U4 = { ivo: '00000000-0000-0000-0000-0000000000c1', jan: '00000000-0000-0000-0000-0000000000c2', kim: '00000000-0000-0000-0000-0000000000c3' };
  let g: string, ivo: string, jan: string;
  const q = (u: string, sql: string, p: unknown[] = []) => as(u, () => one(sql, p));
  const count = async (sql: string, p: unknown[]) => (await one<{ n: number }>(`select count(*)::int as n from ${sql}`, p)).n;
  const gasto = (o: object) => JSON.stringify({ group_id: g, description: 'Luz', amount: 2000, split_mode: 'equal', payers: { [ivo]: 2000 }, shares: { [ivo]: 1000, [jan]: 1000 }, ...o });

  beforeAll(async () => {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ivo@ejemplo.do', '{"full_name":"Ivo"}'), ($2, 'jan@ejemplo.do', '{"full_name":"Jan"}'),
      ($3, 'kim@ejemplo.do', '{"full_name":"Kim"}')`, [U4.ivo, U4.jan, U4.kim]);
    ivo = await pid(U4.ivo); jan = await pid(U4.jan);
    g = (await q(U4.ivo, `select create_group('Casa', 'casa') as g`)).g;
    const tok = (await one('select invite_token from groups where id = $1', [g])).invite_token;
    await q(U4.jan, 'select join_group($1)', [tok]);
  });

  it('solo un admin cambia el grupo: nombre, presupuesto, simplificar y archivar', async () => {
    await expect(q(U4.jan, 'select update_group($1, $2)', [g, JSON.stringify({ name: 'Mía' })])).rejects.toThrow(/Solo un admin/);
    await q(U4.ivo, 'select update_group($1, $2)', [g, JSON.stringify({ name: 'Casa Naco', budget: 4500000, simplify: true })]);
    expect(await one('select name, budget::int, simplify, archived_at from groups where id = $1', [g])).toEqual({ name: 'Casa Naco', budget: 4500000, simplify: true, archived_at: null });
    await q(U4.ivo, 'select update_group($1, $2)', [g, JSON.stringify({ budget: null, archived: true })]);
    const r = await one('select budget, archived_at from groups where id = $1', [g]);
    expect(r.budget).toBeNull(); expect(r.archived_at).not.toBeNull();
    await q(U4.ivo, 'select update_group($1, $2)', [g, JSON.stringify({ archived: false })]);
    expect(await count(`activity where group_id = $1 and verb = 'grupo_editado'`, [g])).toBe(3);
  });

  it('roles: siempre queda un admin', async () => {
    await expect(q(U4.ivo, 'select set_member_role($1, $2, $3)', [g, ivo, 'miembro'])).rejects.toThrow(/al menos un admin/);
    await q(U4.ivo, 'select set_member_role($1, $2, $3)', [g, jan, 'admin']);
    await q(U4.jan, 'select set_member_role($1, $2, $3)', [g, jan, 'miembro']);
    expect((await one('select role from group_members where group_id = $1 and profile_id = $2', [g, jan])).role).toBe('miembro');
  });

  it('salir del grupo solo con las cuentas saldadas', async () => {
    await q(U4.ivo, 'select save_expense($1)', [gasto({})]);
    await expect(q(U4.jan, 'select leave_group($1)', [g])).rejects.toThrow(/Salda tus cuentas/);
    await q(U4.jan, 'select save_expense($1)', [JSON.stringify({ group_id: g, description: 'Pago', amount: 1000, is_payment: true, split_mode: 'payment', payers: { [jan]: 1000 }, shares: { [ivo]: 1000 } })]);
    await q(U4.jan, 'select leave_group($1)', [g]);
    expect(await count('group_members where group_id = $1 and profile_id = $2', [g, jan])).toBe(0);
    expect(await count(`activity where group_id = $1 and verb = 'salio'`, [g])).toBe(1);
    // vuelve para lo demás
    const tok = (await one('select invite_token from groups where id = $1', [g])).invite_token;
    await q(U4.jan, 'select join_group($1)', [tok]);
  });

  it('fondo común: uno por grupo, los aportes no esperan confirmación y no se puede reclamar', async () => {
    const f = (await q(U4.ivo, 'select create_fund($1) as f', [g])).f;
    expect((await q(U4.jan, 'select create_fund($1) as f', [g])).f).toBe(f);
    const id = (await q(U4.jan, 'select save_expense($1) as id', [JSON.stringify({ group_id: g, description: 'Aporte', amount: 5000, is_payment: true,
      split_mode: 'payment', payers: { [jan]: 5000 }, shares: { [f]: 5000 } })])).id;
    expect((await one('select payment_status from expenses where id = $1', [id])).payment_status).toBe('confirmado');
    await q(U4.ivo, 'select save_expense($1)', [JSON.stringify({ group_id: g, description: 'Hielo', amount: 3000, split_mode: 'equal', payers: { [f]: 3000 }, shares: { [ivo]: 1500, [jan]: 1500 } })]);
    const tok = (await one('select invite_token from groups where id = $1', [g])).invite_token;
    expect((await q(U4.kim, 'select invite_preview($1) as p', [tok])).p.placeholders).toEqual([]);
    await expect(q(U4.kim, 'select join_group($1, $2)', [tok, f])).rejects.toThrow(/ya lo reclamó/);
    expect((await as(U4.jan, () => one('select fund_of from profiles where id = $1', [f]))).fund_of).toBe(g);
  });

  it('gastos que se repiten: se ponen al día una sola vez y desde la fecha original', async () => {
    const d = new Date(); d.setMonth(d.getMonth() - 2); d.setDate(Math.min(d.getDate(), 28));
    const day = d.toISOString().slice(0, 10);
    const root = (await q(U4.ivo, 'select save_expense($1) as id', [gasto({ description: 'Internet', date: day, repeat: 'mensual' })])).id;
    expect((await q(U4.jan, 'select catch_up_recurring() as n')).n).toBe(2);
    expect((await q(U4.ivo, 'select catch_up_recurring() as n')).n).toBe(0);
    const copies = await all('select date::text, amount::int, created_by from expenses where repeat_from = $1 order by date', [root]);
    expect(copies).toHaveLength(2);
    expect(copies.every(c => c.amount === 2000 && c.created_by === ivo)).toBe(true);
    expect(await count('expense_shares s join expenses e on e.id = s.expense_id where e.repeat_from = $1', [root])).toBe(4);
    // quien no es del grupo no pone al día nada de este grupo
    expect((await q(U4.kim, 'select catch_up_recurring() as n')).n).toBe(0);
  });

  it('lista de compras: la gente del grupo agrega, marca y borra; los de afuera no', async () => {
    const i = (await q(U4.jan, `select add_item($1, '  Agua  ') as i`, [g])).i;
    expect((await as(U4.ivo, () => one('select name, done_at from group_items where id = $1', [i])))).toEqual({ name: 'Agua', done_at: null });
    await q(U4.ivo, 'select toggle_item($1)', [i]);
    expect((await one('select done_by from group_items where id = $1', [i])).done_by).toBe(ivo);
    await expect(q(U4.kim, `select add_item($1, 'Cerveza')`, [g])).rejects.toThrow(/No perteneces/);
    expect(await as(U4.kim, () => all('select id from group_items where group_id = $1', [g]))).toEqual([]);
    await q(U4.jan, 'select delete_item($1)', [i]);
    expect(await count('group_items where id = $1', [i])).toBe(0);
  });

  it('fotos: solo la gente del grupo sube y ve; la ruta del gasto tiene que ser de su grupo', async () => {
    const e = (await q(U4.ivo, 'select save_expense($1) as id', [gasto({ description: 'Gas' })])).id;
    const path = `gastos/${g}/${e}-a1.jpg`;
    await as(U4.ivo, () => db.query(`insert into storage.objects (bucket_id, name) values ('adjuntos', $1)`, [path]));
    await expect(as(U4.kim, () => db.query(`insert into storage.objects (bucket_id, name) values ('adjuntos', $1)`, [`gastos/${g}/x.jpg`]))).rejects.toThrow();
    await expect(as(U4.kim, () => db.query(`insert into storage.objects (bucket_id, name) values ('adjuntos', 'gastos/no-es-un-grupo/x.jpg')`))).rejects.toThrow();
    expect(await as(U4.jan, () => all(`select name from storage.objects where bucket_id = 'adjuntos'`))).toEqual([{ name: path }]);
    expect(await as(U4.kim, () => all(`select name from storage.objects where bucket_id = 'adjuntos'`))).toEqual([]);
    await q(U4.jan, 'select set_expense_photo($1, $2)', [e, path]);
    expect((await one('select photo_path from expenses where id = $1', [e])).photo_path).toBe(path);
    await expect(q(U4.ivo, 'select set_expense_photo($1, $2)', [e, `gastos/00000000-0000-0000-0000-000000000000/x.jpg`])).rejects.toThrow(/no es de este grupo/);
  });

  it('avisos: cada cuenta guarda sus teléfonos y la función sabe a quién avisar (menos a quien lo hizo)', async () => {
    await q(U4.jan, `select save_push_token('expo', 'ExponentPushToken[jan-telefono]')`);
    await q(U4.ivo, `select save_push_token('web', '{"endpoint":"https://push.ejemplo/ivo"}')`);
    await expect(q(U4.jan, `select save_push_token('fax', 'x')`)).rejects.toThrow(/no es válido/);
    const a = (await one(`select id from activity where group_id = $1 and actor = $2 order by id desc limit 1`, [g, ivo])).id;
    await db.exec('set role service_role');
    try {
      expect(await all('select token, kind from push_targets($1, $2)', [a, U4.ivo])).toEqual([{ token: 'ExponentPushToken[jan-telefono]', kind: 'expo' }]);
      expect(await all('select token from push_targets($1, $2)', [a, U4.jan])).toEqual([]); // jan no hizo ese movimiento
    } finally { await db.exec('reset role'); }
    await expect(q(U4.jan, 'select * from push_targets($1, $2)', [a, U4.jan])).rejects.toThrow(/permission denied/);
  });

  it('recibos: hasta 40 por día', async () => {
    for (let i = 0; i < 40; i++) expect((await q(U4.kim, 'select scan_quota() as ok')).ok).toBe(true);
    expect((await q(U4.kim, 'select scan_quota() as ok')).ok).toBe(false);
  });
});

describe('grupos de fecha a fecha y las personas del grupo', () => {
  const U5 = { lia: '00000000-0000-0000-0000-0000000000d1', max: '00000000-0000-0000-0000-0000000000d2' };
  let g: string, lia: string, max: string, sin: string;
  const q = (u: string, sql: string, p: unknown[] = []) => as(u, () => one(sql, p));

  beforeAll(async () => {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'lia@ejemplo.do', '{"full_name":"Lía"}'), ($2, 'max@ejemplo.do', '{"full_name":"Max"}')`, [U5.lia, U5.max]);
    lia = await pid(U5.lia); max = await pid(U5.max);
    g = (await q(U5.lia, `select create_group('Punta Cana', 'viaje') as g`)).g;
    await q(U5.max, 'select join_group($1)', [(await one('select invite_token from groups where id = $1', [g])).invite_token]);
    sin = (await q(U5.lia, `select add_placeholder($1, 'Primo de Max') as p`, [g])).p;
  });

  it('un grupo de fecha a fecha: las fechas se ponen, se quitan y el fin no va antes del inicio', async () => {
    await q(U5.lia, 'select update_group($1, $2)', [g, JSON.stringify({ starts_on: '2026-12-20', ends_on: '2026-12-27' })]);
    expect(await one('select starts_on::text, ends_on::text from groups where id = $1', [g])).toEqual({ starts_on: '2026-12-20', ends_on: '2026-12-27' });
    await expect(q(U5.lia, 'select update_group($1, $2)', [g, JSON.stringify({ ends_on: '2026-12-01' })])).rejects.toThrow();
    await q(U5.lia, 'select update_group($1, $2)', [g, JSON.stringify({ starts_on: null, ends_on: null })]);
    expect(await one('select starts_on, ends_on from groups where id = $1', [g])).toEqual({ starts_on: null, ends_on: null });
  });

  it('un admin cambia el nombre de quien no tiene cuenta, pero no el de alguien con cuenta', async () => {
    await expect(q(U5.max, `select rename_placeholder($1, $2, 'Otro')`, [g, sin])).rejects.toThrow(/Solo un admin/);
    await q(U5.lia, `select rename_placeholder($1, $2, '  Luis  ')`, [g, sin]);
    expect((await one('select name from profiles where id = $1', [sin])).name).toBe('Luis');
    await expect(q(U5.lia, `select rename_placeholder($1, $2, 'Maxi')`, [g, max])).rejects.toThrow(/todavía no tiene cuenta/);
  });

  it('quitar a alguien: solo un admin, con sus cuentas saldadas, y queda anotado', async () => {
    await q(U5.lia, 'select save_expense($1)', [JSON.stringify({ group_id: g, description: 'Taxi', amount: 1000, split_mode: 'equal', payers: { [lia]: 1000 }, shares: { [lia]: 500, [max]: 500 } })]);
    await expect(q(U5.max, 'select remove_member($1, $2)', [g, lia])).rejects.toThrow(/Solo un admin/);
    await expect(q(U5.lia, 'select remove_member($1, $2)', [g, max])).rejects.toThrow(/cuentas pendientes/);
    await expect(q(U5.lia, 'select remove_member($1, $2)', [g, lia])).rejects.toThrow(/Salir del grupo/);
    await q(U5.lia, 'select remove_member($1, $2)', [g, sin]);
    expect(await one('select count(*)::int as n from group_members where group_id = $1 and profile_id = $2', [g, sin])).toEqual({ n: 0 });
    expect((await one(`select payload from activity where group_id = $1 and verb = 'miembro_quitado'`, [g])).payload).toEqual({ nombre: 'Luis' });
  });
});

// Corre la migración real en PGlite (Postgres en WASM) con un "auth" mínimo de imitación,
// y prueba las reglas que importan: RLS, que los gastos cuadren, permisos y reclamar un marcador.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../migrations/20261102000000_init.sql', import.meta.url), 'utf8');
const db = new PGlite();
const U = { ana: '00000000-0000-0000-0000-00000000000a', beto: '00000000-0000-0000-0000-00000000000b', cris: '00000000-0000-0000-0000-00000000000c' };

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
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth, public to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(sql);
  await db.exec(`grant select, insert, update on all tables in schema public to authenticated;`);
  await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
    ('${U.ana}', 'ana@ejemplo.do', '{"full_name":"Ana Peña"}'), ('${U.beto}', 'beto@ejemplo.do', '{}'), ('${U.cris}', 'cris@ejemplo.do', '{}');`);
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

  it('gastos de dos sin grupo usan un grupo directo reutilizable', async () => {
    const d1 = await as(U.ana, async () => (await one<{ g: string }>('select direct_group($1) as g', [beto])).g);
    const d2 = await as(U.beto, async () => (await one<{ g: string }>('select direct_group($1) as g', [ana])).g);
    expect(d1).toBe(d2);
    await expect(as(U.cris, () => one('select direct_group($1)', [ana]))).rejects.toThrow(/personas de tus grupos/);
  });
});

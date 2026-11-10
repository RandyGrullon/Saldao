// Guardar gastos como los guarda la app (por la cola: apply_op con el gasto en JSON, tal cual sale de supabase.ts), en
// las cinco monedas, con lo que debe entrar y lo que la base debe rechazar.
import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { opArgs } from '../../packages/core/src/supabase';
import type { Op } from '../../packages/core/src/types';
import { migratedDb } from './db';

let db: PGlite;
const U = { jp: '10000000-0000-0000-0000-00000000000a', pam: '10000000-0000-0000-0000-00000000000b', and: '10000000-0000-0000-0000-00000000000c', pao: '10000000-0000-0000-0000-00000000000d' };
async function as<T>(user: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('test.uid', '${user}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const one = async <T = any>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows[0];
let g: string, P: { jp: string; pam: string; and: string; pao: string };

/** Lo que manda la app al guardar un gasto nuevo (supabase.ts → opArgs → toSnake; sin ítems, sin el campo), con lo que se pase encima. */
function payload(o: Record<string, unknown> = {}) {
  return {
    id: null, new_id: randomUUID(), group_id: g, description: 'Cena', category: 'comida', date: '2026-11-08', currency: 'DOP',
    amount: 71000, fx_rate: 1, split_mode: 'equal', split_params: { on: Object.values(P) }, tax: 0, tip: 0,
    note: null, repeat: null, payers: { [P.jp]: 71000 }, shares: { [P.jp]: 17750, [P.pam]: 17750, [P.and]: 17750, [P.pao]: 17750 }, is_payment: false,
    ...o,
  };
}
const save = (p: Record<string, unknown>) => as(U.jp, () => one('select apply_op($1, $2, $3) as r', [randomUUID(), 'save_expense', JSON.stringify({ p })]));
const row = (id: string) => one('select currency, amount, fx_rate::float as fx_rate, items, split_params from expenses where id = $1', [id]);

beforeAll(async () => {
  db = await migratedDb();
  await db.exec(`insert into auth.users (id, email) values ${Object.entries(U).map(([k, id]) => `('${id}', '${k}@ejemplo.do')`).join(', ')};`);
  const pid = async (u: string) => (await one<{ id: string }>('select id from profiles where user_id = $1', [u])).id;
  P = { jp: await pid(U.jp), pam: await pid(U.pam), and: await pid(U.and), pao: await pid(U.pao) };
  g = await as(U.jp, async () => (await one<{ g: string }>(`select create_group('Casa', 'casa') as g`)).g);
  // los demás entran con el enlace, como en la app
  const token = (await one<{ invite_token: string }>('select invite_token from groups where id = $1', [g])).invite_token;
  for (const u of [U.pam, U.and, U.pao]) await as(u, () => one('select join_group($1, null)', [token]));
}, 60000);

describe('guardar un gasto como lo manda la app', () => {
  it('RD$ 710 en partes iguales entre cuatro, armado por la app (el error de la captura)', async () => {
    // el mismo camino que la hoja de gasto: la cola arma los argumentos de apply_op con opArgs
    const op = {
      kind: 'save_expense', id: randomUUID(), at: new Date().toISOString(), label: 'Cena', create: true,
      input: {
        id: randomUUID(), groupId: g, description: 'Cena', category: 'comida', date: '2026-11-08', currency: 'DOP', amount: 71000, fxRate: 1,
        splitMode: 'equal', splitParams: { on: Object.values(P) }, items: null, tax: 0, tip: 0, note: null, repeat: null, isPayment: false,
        payers: { [P.jp]: 71000 }, shares: { [P.jp]: 17750, [P.pam]: 17750, [P.and]: 17750, [P.pao]: 17750 },
      },
    } as unknown as Op;
    const r = await as(U.jp, () => one('select apply_op($1, $2, $3) as r', [op.id, op.kind, JSON.stringify(opArgs(op))]));
    expect(await row(r.r)).toMatchObject({ amount: 71000, currency: 'DOP', items: null, split_params: { on: Object.values(P) } });
  });

  it('con "items": null, como lo mandan los teléfonos con la versión anterior y la cola sin conexión', async () => {
    const r = await save(payload({ items: null }));
    expect(await row(r.r)).toMatchObject({ amount: 71000, items: null });
    const sinPartes = await save(payload({ split_params: null }));
    expect((await row(sinPartes.r)).split_params).toEqual({});
  });

  it('editar un gasto por ítems y pasarlo a partes iguales le quita los ítems', async () => {
    const items = [{ name: 'Pizza', price: 71000, to: [P.jp, P.pam] }];
    const id = (await save(payload({ split_mode: 'items', items, split_params: {}, shares: { [P.jp]: 35500, [P.pam]: 35500 } }))).r;
    expect((await row(id)).items).toHaveLength(1);
    await as(U.jp, () => one('select save_expense($1)', [JSON.stringify(payload({ id, new_id: null, items: null }))]));
    expect((await row(id)).items).toBeNull();
  });

  const RATE = { USD: 63.1, EUR: 68.45, CNY: 8.7631, JPY: 0.4123 };
  for (const [cur, rate] of Object.entries(RATE)) {
    it(`en ${cur}: partes iguales, ítems con ITBIS y ley, y montos exactos`, async () => {
      const id1 = (await save(payload({ currency: cur, fx_rate: rate }))).r;
      expect(await row(id1)).toMatchObject({ currency: cur, fx_rate: rate, amount: 71000 });
      const items = [{ name: 'Pescado', price: 30000, to: [P.jp, P.pam] }, { name: 'Langosta', price: 25000, to: [P.and] }];
      const id2 = (await save(payload({ currency: cur, fx_rate: rate, split_mode: 'items', split_params: {}, items, tax: 18, tip: 10, amount: 70400,
        payers: { [P.pam]: 70400 }, shares: { [P.jp]: 19200, [P.pam]: 19200, [P.and]: 32000 } }))).r;
      expect((await row(id2)).items).toHaveLength(2);
      const id3 = (await save(payload({ currency: cur, fx_rate: rate, split_mode: 'exact', split_params: { vals: { [P.jp]: 500, [P.pam]: 210 } },
        shares: { [P.jp]: 50000, [P.pam]: 21000 } }))).r;
      expect((await row(id3)).split_params).toEqual({ vals: { [P.jp]: 500, [P.pam]: 210 } });
    });
  }

  it('un pago en dólares y uno en yenes', async () => {
    for (const [cur, rate] of [['USD', 63.1], ['JPY', 0.4123]] as const) {
      const r = await save(payload({ description: 'Pago', category: 'pago', currency: cur, fx_rate: rate, split_mode: 'payment', split_params: { method: 'efectivo' },
        amount: 10000, payers: { [P.pam]: 10000 }, shares: { [P.jp]: 10000 }, is_payment: true }));
      expect(r.r).toBeTruthy();
    }
  });

  it('el monto más grande que deja el teclado (RD$ 999,999,999.99) y el más chico (un centavo)', async () => {
    const big = 99999999999;
    expect((await save(payload({ amount: big, payers: { [P.jp]: big }, shares: { [P.jp]: 25000000000, [P.pam]: 25000000000, [P.and]: 25000000000, [P.pao]: 24999999999 } }))).r).toBeTruthy();
    expect((await save(payload({ amount: 1, payers: { [P.jp]: 1 }, shares: { [P.pao]: 1 } }))).r).toBeTruthy();
  });
});

describe('lo que la base tiene que rechazar', () => {
  const bad = async (o: Record<string, unknown>, err: RegExp) => expect(save(payload(o))).rejects.toThrow(err);
  it('que no cuadre o que tenga montos raros', async () => {
    await bad({ amount: 71001 }, /No cuadra/);
    await bad({ amount: 0, payers: {}, shares: {} }, /No cuadra/);
    await bad({ amount: -100, payers: { [P.jp]: -100 }, shares: { [P.pam]: -100 } }, /No cuadra/);
    await bad({ shares: { [P.jp]: 81000, [P.pam]: -10000 } }, /Montos inválidos/);
    await bad({ amount: 100000000000, payers: { [P.jp]: 100000000000 }, shares: { [P.jp]: 100000000000 } }, /check constraint|violates/);
    await bad({ amount: 710.5, payers: { [P.jp]: 710.5 }, shares: { [P.jp]: 710.5 } }, /invalid input syntax/);
  });
  it('ítems o partes que no son una lista o un objeto', async () => {
    await bad({ items: { name: 'x' } }, /no son válidos/);
    await bad({ items: 'Pizza' }, /no son válidos/);
    await bad({ split_params: [1, 2] }, /no son válidos/);
  });
  it('monedas y tasas que no existen', async () => {
    await bad({ currency: 'yen' }, /check constraint|violates/);
    await bad({ currency: 'JPYX' }, /check constraint|violates/);
    await bad({ currency: 'JPY', fx_rate: 0 }, /check constraint|violates/);
    await bad({ currency: 'JPY', fx_rate: -0.41 }, /check constraint|violates/);
    await bad({ currency: 'JPY', fx_rate: 1e9 }, /overflow/);
  });
  it('gente de afuera, fechas imposibles y textos que no van', async () => {
    await bad({ shares: { [randomUUID()]: 71000 } }, /no son del grupo/);
    await bad({ date: '2099-01-01' }, /futuro/);
    await bad({ date: '1999-12-31' }, /check constraint|violates/);
    await bad({ description: 'x'.repeat(121) }, /check constraint|violates/);
    await bad({ repeat: 'diario' }, /check constraint|violates/);
  });
});

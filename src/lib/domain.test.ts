import { describe, expect, it } from 'vitest';
import { apportion, itemSplit, ledger, nets, pairTransfers, simplify, split, sum, type Expense } from './domain';

const ex = (o: Partial<Expense> & Pick<Expense, 'id' | 'amount' | 'payers' | 'shares'>): Expense => ({
  groupId: 'g', description: o.id, category: 'general', date: '2026-10-01', currency: 'DOP', fxRate: 1, isPayment: false,
  paymentStatus: null, splitMode: 'exact', splitParams: {}, items: null, tax: 0, tip: 0, note: null, repeat: null,
  createdBy: 'a', createdAt: '2026-10-01T10:00:00Z', deletedAt: null, ...o,
});

describe('apportion', () => {
  it('reparte todos los centavos y da el sobrante a quien más fracción tenía', () => {
    const r = apportion(1000, { a: 1, b: 1, c: 1 });
    expect(sum(r)).toBe(1000);
    expect(Object.values(r).sort()).toEqual([333, 333, 334]);
  });
  it('respeta pesos cero y totales cero', () => {
    expect(apportion(500, { a: 1, b: 0 })).toEqual({ a: 500, b: 0 });
    expect(apportion(0, { a: 1 })).toEqual({ a: 0 });
  });
});

describe('split', () => {
  const m = ['a', 'b', 'c'];
  it('iguales solo entre quienes entran', () => {
    const r = split('equal', 1000, m, { on: { a: true, b: true } });
    expect(r).toMatchObject({ ok: true, shares: { a: 500, b: 500, c: 0 } });
  });
  it('montos exactos dicen cuánto falta', () => {
    const r = split('exact', 1000, m, { vals: { a: '5', b: '3' } });
    expect(r.ok).toBe(false); expect(r.diff).toBe(200);
  });
  it('porcentajes deben sumar 100', () => {
    expect(split('percent', 4500000, m, { vals: { a: 40, b: 30, c: 30 } }).shares).toEqual({ a: 1800000, b: 1350000, c: 1350000 });
    expect(split('percent', 1000, m, { vals: { a: 50, b: 30 } }).ok).toBe(false);
  });
  it('partes y extras cuadran con el total', () => {
    expect(sum(split('shares', 1250000, m, { vals: { a: 1, b: 1, c: 2 } }).shares)).toBe(1250000);
    const r = split('adjust', 1000, m, { vals: { a: 1 } });
    expect(r.shares.a - r.shares.b).toBe(100); expect(sum(r.shares)).toBe(1000);
    expect(split('adjust', 1000, m, { vals: { a: 20 } }).ok).toBe(false);
  });
});

describe('itemSplit', () => {
  it('reparte ITBIS y ley según lo que consumió cada quien', () => {
    const r = itemSplit([{ name: 'x', price: 1000, to: ['a'] }, { name: 'y', price: 1000, to: ['a', 'b'] }], 18, 10);
    expect(r.total).toBe(2560);
    expect(sum(r.shares)).toBe(2560);
    expect(r.shares.a).toBe(1920);
  });
});

describe('saldos y porqué', () => {
  // a paga la villa (b y c deben); c paga la cena (a y b deben); b le paga a a.
  const villa = ex({ id: 'villa', date: '2026-10-01', amount: 30000, payers: { a: 30000 }, shares: { a: 10000, b: 10000, c: 10000 } });
  const cena = ex({ id: 'cena', date: '2026-10-02', amount: 6000, payers: { c: 6000 }, shares: { a: 2000, b: 2000, c: 2000 } });
  const pago = ex({ id: 'pago', date: '2026-10-03', amount: 10000, isPayment: true, splitMode: 'payment', payers: { b: 10000 }, shares: { a: 10000 } });
  const list = [villa, cena, pago];

  it('las deudas directas suman cero por persona', () => {
    const n = nets(list);
    expect(sum(n)).toBe(0);
    expect(n).toEqual({ a: 8000, b: -2000, c: -6000 });
    expect(pairTransfers(list)).toEqual([{ from: 'c', to: 'a', amount: 8000 }, { from: 'b', to: 'c', amount: 2000 }]);
  });
  it('el pago salda lo más viejo y cada movimiento sabe con qué se cerró', () => {
    const l = ledger('a', 'b', list);
    expect(l.map(i => [i.e.id, i.x, i.left])).toEqual([['villa', 10000, 0], ['pago', -10000, 0]]);
    expect(l[0].closedBy?.id).toBe('pago');
    expect(l[0].closedAt).toBe('2026-10-03');
  });
  it('un gasto en sentido contrario compensa lo pendiente', () => {
    const l = ledger('a', 'c', list);
    expect(l.map(i => [i.e.id, i.left])).toEqual([['villa', 8000], ['cena', 0]]);
    expect(l[1].closedBy?.id).toBe('villa');
  });
  it('los gastos borrados no cuentan', () => {
    expect(ledger('a', 'b', [villa, { ...pago, deletedAt: '2026-10-04' }])[0].left).toBe(10000);
  });
  it('simplificar nunca necesita más pagos que las deudas directas', () => {
    expect(simplify(nets(list)).length).toBeLessThanOrEqual(pairTransfers(list).length);
  });
  it('multimoneda: pagado y consumido cuadran tras convertir', () => {
    const usd = ex({ id: 'usd', currency: 'USD', fxRate: 63.1, amount: 64000, payers: { a: 64000 }, shares: { a: 21334, b: 21333, c: 21333 } });
    expect(sum(nets([usd]))).toBe(0);
    // el centavo del redondeo de la conversión cae en la parte más grande
    expect(Math.abs(nets([usd]).a - (64000 * 63.1 - 21334 * 63.1))).toBeLessThanOrEqual(1);
  });
});

// El dinero en cinco monedas: pesos, dólares, euros, yuanes y yenes. Casos que deben salir bien, casos que deben fallar
// y las esquinas (centavos sueltos, tasas chiquitas, comas, negativos). Las tasas son pesos por 1 de cada moneda.
import { describe, expect, it } from 'vitest';
import { apportion, itemSplit, nets, pairTransfers, pairVal, simplify, split, sum, toBase, type Expense } from './domain';
import { fetchRate } from './features';
import { centsText, curName, CURRENCIES, curStep, moneyT, parseMoney, parseNum } from './format';
import { setLang } from './i18n';

const RATE = { DOP: 1, USD: 63.1, EUR: 68.45, CNY: 8.7631, JPY: 0.4123 } as const;
type Cur = keyof typeof RATE;
const CURS = Object.keys(RATE) as Cur[];

let n = 0;
const ex = (o: Partial<Expense>): Expense => ({
  id: `e${++n}`, groupId: 'g', description: 'x', category: 'general', date: '2026-11-01', currency: 'DOP', amount: 0, fxRate: 1,
  isPayment: false, paymentStatus: null, splitMode: 'exact', splitParams: {}, items: null, tax: 0, tip: 0, note: null, repeat: null,
  payers: {}, shares: {}, createdBy: 'a', createdAt: `2026-11-01T12:00:${String(n % 60).padStart(2, '0')}Z`, deletedAt: null, ...o,
});
/** Un gasto que cuadra: `amount` en centavos de `cur`, dividido en partes iguales entre `on`. */
const equal = (cur: Cur, amount: number, payer: string, on: string[], extra: Partial<Expense> = {}) =>
  ex({ currency: cur, fxRate: RATE[cur], amount, payers: { [payer]: amount }, shares: split('equal', amount, on, { on: Object.fromEntries(on.map(k => [k, true])) }).shares, ...extra });

/** Lo que tiene que cumplir cualquier gasto: lo pagado y lo consumido suman lo mismo, también en pesos. */
function invariants(e: Expense) {
  expect(sum(e.payers)).toBe(e.amount);
  expect(sum(e.shares)).toBe(e.amount);
  const b = toBase(e);
  expect(b.total).toBe(Math.round(e.amount * e.fxRate));
  expect(sum(b.payers)).toBe(b.total);
  expect(sum(b.shares)).toBe(b.total);
  for (const v of [...Object.values(b.payers), ...Object.values(b.shares)]) expect(Number.isInteger(v) && v >= 0).toBe(true);
  const ns = nets([e]);
  expect(sum(ns)).toBe(0);
  // cada saldo es lo que pagó menos lo que consumió, con a lo sumo un centavo de redondeo por cada otra persona
  const ids = new Set([...Object.keys(e.payers), ...Object.keys(e.shares)]);
  for (const k of ids) expect(Math.abs((ns[k] || 0) - ((b.payers[k] || 0) - (b.shares[k] || 0)))).toBeLessThanOrEqual(ids.size - 1);
}

describe('en las cinco monedas, lo que debe salir bien', () => {
  for (const cur of CURS) {
    describe(cur, () => {
      it('partes iguales con centavos que no se dividen exacto', () => {
        for (const amount of [1, 2, 100, 10000, 10001, 99999, 123457, 99999999999]) {
          const e = equal(cur, amount, 'a', ['a', 'b', 'c']);
          const sh = Object.values(e.shares);
          expect(Math.max(...sh) - Math.min(...sh)).toBeLessThanOrEqual(1); // nadie paga más de un centavo de diferencia
          if (Math.round(amount * RATE[cur]) > 0) invariants(e);
        }
      });

      it('ítems de una factura con ITBIS 18 % y ley 10 %', () => {
        const items = [{ name: 'Pescado', price: 145000, to: ['a', 'b'] }, { name: 'Langosta', price: 230000, to: ['c'] }, { name: 'Camarones', price: 168001, to: ['a', 'c'] }];
        const r = itemSplit(items, 18, 10);
        expect(r.subtotal).toBe(543001);
        expect(r.taxC).toBe(Math.round(543001 * 0.18));
        expect(r.tipC).toBe(Math.round(543001 * 0.1));
        expect(r.total).toBe(r.subtotal + r.taxC + r.tipC);
        expect(sum(r.shares)).toBe(r.total);
        invariants(ex({ currency: cur, fxRate: RATE[cur], amount: r.total, payers: { b: r.total }, shares: r.shares, splitMode: 'items', items, tax: 18, tip: 10 }));
      });

      it('varios pagadores y porcentajes que suman 100', () => {
        const total = 1000000;
        const r = split('percent', total, ['a', 'b', 'c'], { vals: { a: '33.33', b: '33.33', c: '33.34' } });
        expect(r.ok).toBe(true);
        expect(sum(r.shares)).toBe(total);
        invariants(ex({ currency: cur, fxRate: RATE[cur], amount: total, payers: { a: 600000, b: 400000 }, shares: r.shares }));
      });

      it('un pago en esta moneda salda exacto una deuda en pesos', () => {
        // b le debe a a lo que valen 100.00 de esta moneda, en pesos; luego le paga 100.00 en esta moneda
        const debt = Math.round(10000 * RATE[cur]);
        const gasto = ex({ amount: debt, payers: { a: debt }, shares: { b: debt } });
        const pago = ex({ currency: cur, fxRate: RATE[cur], amount: 10000, isPayment: true, payers: { b: 10000 }, shares: { a: 10000 }, date: '2026-11-02' });
        expect(pairTransfers([gasto])).toEqual([{ from: 'b', to: 'a', amount: debt }]);
        expect(pairTransfers([gasto, pago])).toEqual([]);
      });

      it('formato del monto', () => {
        expect(moneyT(123456, cur)).toMatch(cur === 'JPY' ? /1,235$/ : /1,234\.56$/);
        expect(moneyT(-500, cur)).toMatch(cur === 'JPY' ? /^−.* 5$/ : /^−.*5\.00$/);
        expect(moneyT(0, cur)).toMatch(cur === 'JPY' ? / 0$/ : /0\.00$/);
      });
    });
  }

  it('un grupo con gastos en las cinco monedas: los saldos suman cero y el plan de pagos lo salda todo', () => {
    const list = [
      equal('DOP', 450000, 'a', ['a', 'b', 'c', 'd']),
      equal('USD', 64000, 'b', ['a', 'b', 'c', 'd', 'e']),
      equal('EUR', 12345, 'c', ['a', 'c']),
      equal('CNY', 88888, 'd', ['b', 'c', 'd', 'e']),
      equal('JPY', 1500000, 'e', ['a', 'b', 'c', 'd', 'e']),
      ex({ currency: 'USD', fxRate: RATE.USD, amount: 2000, isPayment: true, payers: { a: 2000 }, shares: { b: 2000 } }),
    ];
    list.forEach(invariants);
    const ns = nets(list);
    expect(sum(ns)).toBe(0);
    const plan = simplify(ns);
    const after = { ...ns };
    for (const t of plan) { after[t.from] += t.amount; after[t.to] -= t.amount; }
    expect(Object.values(after).every(v => v === 0)).toBe(true);
    expect(plan.length).toBeLessThanOrEqual(Object.keys(ns).length - 1);
  });
});

describe('lo que debe fallar o quedarse quieto', () => {
  it('sin personas, sin partes o sin monto no cuadra', () => {
    expect(split('equal', 10000, ['a', 'b'], { on: {} }).ok).toBe(false);
    expect(split('shares', 10000, ['a', 'b'], { vals: { a: '0', b: '' } }).ok).toBe(false);
    expect(split('equal', 0, ['a'], { on: { a: true } }).ok).toBe(false);
    expect(split('exact', 10000, ['a', 'b'], { vals: { a: '50', b: '49.99' } })).toMatchObject({ ok: false, diff: 1 });
    expect(split('exact', 10000, ['a', 'b'], { vals: { a: '50', b: '50.01' } })).toMatchObject({ ok: false, diff: -1 });
    expect(split('percent', 10000, ['a', 'b'], { vals: { a: '50', b: '49.99' } }).ok).toBe(false);
    expect(split('adjust', 10000, ['a', 'b'], { vals: { a: '60', b: '50' } }).ok).toBe(false);
  });

  it('un monto en negativo no reparte nada', () => {
    expect(sum(apportion(-500, { a: 1, b: 1 }))).toBe(0);
    expect(split('equal', -500, ['a'], { on: { a: true } }).ok).toBe(false);
  });

  it('lo que no es un número da cero', () => {
    for (const s of ['', '.', 'abc', '   ', '-', 'NaN']) expect(parseMoney(s)).toBe(0);
  });

  it('montos bien escritos', () => {
    expect(parseMoney('1,234.56')).toBe(123456);
    expect(parseMoney('0.01')).toBe(1);
    expect(parseMoney('1.15')).toBe(115);   // 1.15 × 100 en coma flotante es 114.999…
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('999999999.99')).toBe(99999999999);
  });
});

// Lo que encontramos al probar y quedó arreglado.
describe('errores arreglados', () => {
  it('la coma decimal («12,50», como escriben en euros) y los miles con punto («1.234,56»)', () => {
    expect(parseMoney('12,50')).toBe(1250);
    expect(parseMoney('12,5')).toBe(1250);
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('1,234.56')).toBe(123456);
    expect(parseMoney('1,234')).toBe(123400);       // aquí la coma de miles
    expect(parseMoney('0,125')).toBe(13);           // detrás de un 0 es decimal
    expect(parseMoney('1.234.567')).toBe(123456700);
    expect(parseMoney('1.005')).toBe(101);           // sin el error de coma flotante
    expect(parseMoney(' 2 500,75 ')).toBe(250075);
    expect(parseMoney('-12,50')).toBe(-1250);
    expect(parseNum('63,10')).toBe(63.1);
    expect(parseNum('1,5')).toBe(1.5);
  });

  it('lo que no es un número es cero: «Infinity», «1e3», «12,50,3», «1.2.3,4,5»', () => {
    for (const s of ['Infinity', '-Infinity', '1e3', '12,50,3', '1.2.3,4,5', 'RD$ 12', '12abc']) expect(parseMoney(s), s).toBe(0);
  });

  it('un gasto que en pesos redondea a cero (¥0.01 o tasa cero) no rompe los saldos', () => {
    const e = ex({ currency: 'JPY', fxRate: RATE.JPY, amount: 1, payers: { a: 1 }, shares: { b: 1 } });
    expect(pairVal(e, 'a', 'b')).toBe(0);
    expect(nets([e])).toEqual({});
    const sinTasa = ex({ currency: 'EUR', fxRate: 0, amount: 1000, payers: { a: 1000 }, shares: { b: 1000 } });
    expect(pairVal(sinTasa, 'a', 'b')).toBe(0);
  });

  it('montos exactos o porcentajes con un negativo no cuadran aunque la suma dé el total', () => {
    expect(split('exact', 10000, ['a', 'b'], { vals: { a: '150', b: '-50' } })).toMatchObject({ ok: false, status: 'No puede haber montos negativos' });
    expect(split('percent', 10000, ['a', 'b'], { vals: { a: '150', b: '-50' } })).toMatchObject({ ok: false, status: 'No puede haber porcentajes negativos' });
  });

  it('lo que a le debe a b es lo mismo visto desde los dos lados', () => {
    for (let i = 1; i <= 300; i++) {
      const e = ex({ currency: 'USD', fxRate: RATE.USD, amount: 3 * i + 1, payers: { a: 2 * i + 1, b: i }, shares: { a: i, b: i, c: i + 1 } });
      for (const [x, y] of [['a', 'b'], ['a', 'c'], ['b', 'c']]) expect(pairVal(e, x, y)).toBe(-pairVal(e, y, x) || 0);
    }
  });
});

describe('yenes, yuanes y euros', () => {
  it('símbolos, nombres y decimales', () => {
    expect(moneyT(150000, 'JPY')).toBe('¥ 1,500');
    expect(moneyT(150050, 'JPY')).toBe('¥ 1,501');
    expect(moneyT(123456, 'CNY')).toBe('CN¥ 1,234.56');
    expect(moneyT(123456, 'EUR')).toBe('€ 1,234.56');
    expect(moneyT(123456, 'USD')).toBe('US$ 1,234.56');
    expect(moneyT(123456)).toBe('RD$ 1,234.56');
    expect(CURRENCIES).toEqual(['DOP', 'USD', 'EUR', 'CNY', 'JPY']);
    expect(curName('JPY')).toBe('Yen');
    expect([curStep('JPY'), curStep('EUR'), curStep('DOP')]).toEqual([100, 1, 1]);
    expect(parseMoney('1500.4', 'JPY')).toBe(150000);   // el yen no tiene centavos
    expect(parseMoney('1500.5', 'JPY')).toBe(150100);
    expect(centsText(150000, 'JPY')).toBe('1500');
    expect(centsText(1250, 'EUR')).toBe('12.50');
  });

  it('en yenes nadie queda con fracciones de yen, y todo suma el total', () => {
    for (const mode of ['equal', 'shares', 'percent', 'adjust'] as const) {
      const vals: Record<string, string> = mode === 'percent' ? { a: '33.33', b: '33.33', c: '33.34' } : mode === 'adjust' ? { a: '7' } : { a: '1', b: '2', c: '1' };
      const r = split(mode, 100000, ['a', 'b', 'c'], { on: { a: true, b: true, c: true }, vals }, c => moneyT(c, 'JPY'), 100);
      expect(r.ok, mode).toBe(true);
      expect(sum(r.shares), mode).toBe(100000);
      for (const v of Object.values(r.shares)) expect(v % 100, mode).toBe(0);
    }
    const r = itemSplit([{ name: 'Ramen', price: 120000, to: ['a', 'b', 'c'] }, { name: 'Gyoza', price: 50000, to: ['b'] }], 10, 0, 100);
    expect(r.taxC % 100).toBe(0);
    expect(sum(r.shares)).toBe(r.total);
    for (const v of Object.values(r.shares)) expect(v % 100).toBe(0);
    expect(split('exact', 100000, ['a', 'b'], { vals: { a: '600', b: '400' } }, undefined, 100)).toMatchObject({ ok: true, shares: { a: 60000, b: 40000 } });
  });

  it('la tasa de hoy de cualquier moneda, en pesos', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (async () => ({ json: async () => ({ result: 'success', rates: { USD: 1, DOP: 63.1, EUR: 0.92, CNY: 7.2, JPY: 152.5 } }) })) as unknown as typeof fetch;
    try {
      expect(await fetchRate('USD')).toBe(63.1);
      expect(await fetchRate('EUR')).toBe(68.587);
      expect(await fetchRate('CNY')).toBe(8.7639);
      expect(await fetchRate('JPY')).toBe(0.4138);
      expect(await fetchRate('DOP')).toBe(1);
      expect(await fetchRate('XYZ')).toBeNull();
    } finally { globalThis.fetch = real; }
    globalThis.fetch = (async () => { throw new Error('sin señal'); }) as unknown as typeof fetch;
    try { expect(await fetchRate('EUR')).toBeNull(); } finally { globalThis.fetch = real; }
  });

  it('en noches, el texto habla de noches (también en inglés)', () => {
    expect(split('shares', 10000, ['a', 'b'], { vals: { a: '2', b: '1' }, nights: true }).status).toBe('3 noches en total');
    expect(split('shares', 10000, ['a', 'b'], { vals: {}, nights: true }).status).toBe('Pon cuántas noches estuvo cada quien');
    setLang('en');
    try {
      expect(split('shares', 10000, ['a', 'b'], { vals: { a: '2', b: '1' }, nights: true }).status).toBe('3 nights in total');
      expect(split('equal', 10000, ['a', 'b'], { on: { a: true, b: true } }).status).toBe('Split equally among 2');
      expect(split('exact', 10000, ['a', 'b'], { vals: { a: '50' } }, c => moneyT(c)).status).toBe('RD$ 50.00 short');
    } finally { setLang('es'); }
  });
});

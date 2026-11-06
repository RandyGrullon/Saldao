// Los cálculos de las mejoras con un grupo armado a mano: Ana, Beto y Caro en un viaje, y el fondo común.
import { describe, expect, it } from 'vitest';
import { debts } from './derive';
import type { Expense } from './domain';
import {
  budgetUse, exportCsv, fold, frequentExpenses, fundLeft, fundOf, monthStats, overdue, payQrText, qrPath, searchExpenses, shiftMonth, splitText, thisMonth,
} from './features';
import { today } from './format';
import type { Group, Profile, Snapshot } from './types';

const P = (id: string, name: string, fundOf: string | null = null): Profile =>
  ({ id, userId: fundOf ? null : `u-${id}`, name, email: null, payout: id === 'ana' ? 'Banco Popular · 123' : null, username: null, deletedAt: null, fundOf });
const month = thisMonth(), day = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
const old = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
const E = (o: Partial<Expense> & Pick<Expense, 'id' | 'amount' | 'payers' | 'shares'>): Expense => ({
  groupId: 'g', description: o.id, category: 'general', date: today(), currency: 'DOP', fxRate: 1, isPayment: false, paymentStatus: null,
  splitMode: 'equal', splitParams: {}, items: null, tax: 0, tip: 0, note: null, repeat: null, createdBy: 'ana', createdAt: `${today()}T10:00:00`, deletedAt: null, ...o,
});
const group = (o: Partial<Group> = {}): Group => ({ id: 'g', name: 'Samaná', kind: 'viaje', currency: 'DOP', inviteToken: 't', createdAt: '2026-01-01',
  members: ['ana', 'beto', 'caro', 'fondo'], roles: { ana: 'admin' }, budget: 50000, simplify: false, archivedAt: null, photoPath: null, startsOn: null, endsOn: null, ...o });
const snap = (g: Partial<Group> = {}): Snapshot => ({
  me: 'ana', legalOk: true, comments: [], activity: [], items: [],
  profiles: { ana: P('ana', 'Ana Peña'), beto: P('beto', 'Beto Ruiz'), caro: P('caro', 'Caro Díaz'), fondo: P('fondo', 'Fondo común', 'g') },
  groups: [group(g)],
  expenses: [
    // Ana pagó 300 entre las tres; Beto pagó 300 solo por Beto y Caro → Beto le debe 100 a Ana y Caro 100 a cada uno
    E({ id: 'Mofongo de chicharrón', amount: 30000, payers: { ana: 30000 }, shares: { ana: 10000, beto: 10000, caro: 10000 }, category: 'comida', date: day(1) }),
    E({ id: 'Gasolina', amount: 30000, payers: { beto: 30000 }, shares: { beto: 15000, caro: 15000 }, category: 'gasolina', date: day(2), createdBy: 'beto' }),
    // aportes al fondo y un gasto del fondo
    E({ id: 'Aporte', amount: 20000, isPayment: true, paymentStatus: 'confirmado', splitMode: 'payment', payers: { ana: 20000 }, shares: { fondo: 20000 }, date: day(3) }),
    E({ id: 'Hielo', amount: 6000, payers: { fondo: 6000 }, shares: { ana: 3000, beto: 3000 }, category: 'super', date: day(3) }),
    E({ id: 'Mofongo de chicharrón ', amount: 12000, payers: { ana: 12000 }, shares: { ana: 6000, caro: 6000 }, category: 'comida', date: old }),
  ],
});

describe('mejoras', () => {
  it('fondo común: quién es y cuánto queda (aportado menos pagado)', () => {
    const s = snap();
    expect(fundOf(s, 'g')).toBe('fondo');
    expect(fundLeft(s, 'g')).toBe(14000);
  });

  it('simplificar deudas da menos pagos con los mismos saldos', () => {
    const pairs = debts(snap(), 'g'), simple = debts(snap({ simplify: true }), 'g');
    expect(simple.length).toBeLessThanOrEqual(pairs.length);
    const net = (ts: { from: string; to: string; amount: number }[], k: string) => ts.reduce((a, t) => a + (t.to === k ? t.amount : t.from === k ? -t.amount : 0), 0);
    for (const k of ['ana', 'beto', 'caro', 'fondo']) expect(net(simple, k)).toBe(net(pairs, k));
  });

  it('presupuesto: lo gastado del mes (sin pagos) contra el tope', () => {
    expect(budgetUse(snap(), 'g')).toEqual({ spent: 66000, budget: 50000, ratio: 1.32 });
    expect(budgetUse(snap({ budget: null }), 'g')).toBeNull();
  });

  it('resumen del mes: tu parte por categoría, comparada con el mes anterior', () => {
    const m = monthStats(snap());
    expect(m.total).toBe(13000);
    expect(m.byCat.map(c => [c.key, c.amount])).toEqual([['comida', 10000], ['super', 3000]]);
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('buscar sin importar tildes ni mayúsculas, por persona y por monto', () => {
    const s = snap();
    expect(searchExpenses(s, { text: 'MOFÓNGO' }).length).toBe(2);
    expect(searchExpenses(s, { person: 'caro', cat: 'gasolina' }).map(e => e.description)).toEqual(['Gasolina']);
    expect(searchExpenses(s, { text: '300' }).length).toBe(2);
    expect(fold('Ñame Ácido ')).toBe('name acido');
  });

  it('gastos de siempre: lo que repites en el mismo grupo', () => {
    expect(frequentExpenses(snap()).map(e => e.id)).toEqual(['Mofongo de chicharrón']);
  });

  it('recordatorios: quién te debe desde hace más de 15 días', () => {
    expect(overdue(snap()).map(x => x.p)).toEqual(['caro']);
  });

  it('exportar: CSV con tildes para Excel y el texto de cómo se dividió', () => {
    const csv = exportCsv(snap(), 'g');
    expect(csv.startsWith('﻿Fecha,Grupo')).toBe(true);
    expect(csv).toContain('Mofongo de chicharrón');
    expect(csv.split('\r\n')).toHaveLength(6);
    const e = snap().expenses[0];
    expect(splitText({ ...e, splitMode: 'shares', splitParams: { unit: 'noches', vals: { ana: 2, beto: 3 } } }, k => k)).toBe('Por noches: ana 2, beto 3');
  });

  it('QR para cobrar: el texto lleva tus datos y el trazo es un cuadrado', () => {
    const t = payQrText(snap(), 125000);
    expect(t).toContain('Banco Popular · 123');
    expect(t).toContain('RD$ 1,250.00');
    const q = qrPath(t);
    expect(q.size).toBeGreaterThan(20);
    expect(q.d.startsWith('M')).toBe(true);
  });
});

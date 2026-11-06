import { involves, ledger, nets, pairTransfers, pairVal, simplify, toBase, type Expense, type Id, type LedgerItem } from './domain';
import { fdate, moneyT, today } from './format';
import type { Backend, Snapshot } from './types';
import { tr } from './i18n';

export const live = (s: Snapshot) => s.expenses.filter(e => !e.deletedAt);
export const listOf = (s: Snapshot, g: Id) => live(s).filter(e => e.groupId === g);
export const groupOf = (s: Snapshot, id: Id) => s.groups.find(g => g.id === id);
/** Los grupos de la lista (sin los «entre dos» ni los archivados; sus saldos igual cuentan). */
export const visibleGroups = (s: Snapshot) => s.groups.filter(g => g.kind !== 'directo' && !g.archivedAt);
export const archivedGroups = (s: Snapshot) => s.groups.filter(g => g.kind !== 'directo' && !!g.archivedAt);
export const byNewest = (a: Expense, b: Expense) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

const friendsCache = new WeakMap<Snapshot, Id[]>();
/** Todas las personas con las que compartes algún grupo. */
export function friends(s: Snapshot): Id[] {
  let f = friendsCache.get(s);
  if (!f) {
    // el fondo común no es una persona
    f = [...new Set(s.groups.flatMap(g => g.members))].filter(id => id !== s.me && s.profiles[id] && !s.profiles[id].fundOf)
      .sort((a, b) => s.profiles[a].name.localeCompare(s.profiles[b].name));
    friendsCache.set(s, f);
  }
  return f;
}
// Cada persona tiene su tono; con el orden por id el tono no cambia entre pantallas ni sesiones.
const HUES = [220, 40, 160, 340, 100, 15, 190, 280];
export function hueOf(s: Snapshot, id: Id): number | null {
  if (id === s.me) return null;
  const order = [...friends(s)].sort();
  const i = order.indexOf(id);
  return HUES[(i < 0 ? 0 : i) % HUES.length];
}
export const short = (s: Snapshot, id: Id) => id === s.me ? tr("Tú") : (s.profiles[id]?.name.split(' ')[0] ?? tr("Alguien"));
export const fullName = (s: Snapshot, id: Id) => id === s.me ? tr("Tú") : (s.profiles[id]?.name ?? tr("Alguien"));
export const initials = (s: Snapshot, id: Id) => (s.profiles[id]?.name ?? '?').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

/** Quién le debe a quién en el grupo: de a pares, o con «simplificar deudas», el menor número de pagos. */
export const debts = (s: Snapshot, g: Id) => (groupOf(s, g)?.simplify ? simplify(nets(listOf(s, g))) : pairTransfers(listOf(s, g)));
export const allDebts = (s: Snapshot) => s.groups.flatMap(g => debts(s, g.id).map(t => ({ ...t, groupId: g.id })));
export const sharedGroups = (s: Snapshot, a: Id, b: Id) => s.groups.filter(g => g.members.includes(a) && g.members.includes(b)).map(g => g.id);

/** Saldo con una persona: + te debe. Desglosado por grupo. */
export function friendBal(s: Snapshot, p: Id) {
  let b = 0; const by: Record<Id, number> = {};
  for (const t of allDebts(s)) {
    const x = t.from === p && t.to === s.me ? t.amount : t.from === s.me && t.to === p ? -t.amount : 0;
    if (x) { b += x; by[t.groupId] = (by[t.groupId] || 0) + x; }
  }
  return { b, by };
}
/** Cuántos gastos siguen abiertos con p y desde cuándo. */
export function pendingInfo(s: Snapshot, p: Id) {
  const open = sharedGroups(s, s.me, p).flatMap(g => ledger(s.me, p, listOf(s, g))).filter(it => it.left && !it.e.isPayment);
  return { n: open.length, since: open.map(it => it.e.date).sort()[0] as string | undefined };
}
export function myTotals(s: Snapshot) {
  let owed = 0, owe = 0;
  for (const p of friends(s)) { const { b } = friendBal(s, p); if (b > 0) owed += b; else owe -= b; }
  return { owed, owe, net: owed - owe };
}
export const groupNets = (s: Snapshot, g: Id) => nets(listOf(s, g));
export const groupBal = (s: Snapshot, g: Id) => groupNets(s, g)[s.me] || 0;
export const spent = (list: Expense[]) => list.filter(e => !e.isPayment).reduce((a, e) => a + toBase(e).total, 0);
export function mineOf(s: Snapshot, e: Expense) { const { payers, shares } = toBase(e); return (payers[s.me] || 0) - (shares[s.me] || 0); }

/** Movimientos entre a y b (de uno o todos los grupos), del más nuevo al más viejo. */
export function whyItems(s: Snapshot, a: Id, b: Id, g?: Id): (LedgerItem & { groupId: Id })[] {
  const gs = g ? [g] : sharedGroups(s, a, b);
  return gs.flatMap(x => ledger(a, b, listOf(s, x)).map(it => ({ ...it, groupId: x })))
    .sort((p, q) => q.e.date.localeCompare(p.e.date) || q.e.createdAt.localeCompare(p.e.createdAt));
}

/** Quién puede editar o borrar un gasto: quien lo creó, quien participa o quien administra el grupo. */
export const canEdit = (s: Snapshot, e: Expense) =>
  e.createdBy === s.me || involves(e, s.me) || groupOf(s, e.groupId)?.roles[s.me] === 'admin';

/** ¿Ya se saldó tu parte de este gasto? Con cuántas personas de cuántas. */
export function myStatus(s: Snapshot, e: Expense) {
  if (e.isPayment) return null;
  const ks = [...new Set([...Object.keys(e.payers), ...Object.keys(e.shares)])].filter(k => k !== s.me && pairVal(e, s.me, k));
  if (!ks.length) return null;
  const done = ks.filter(k => !ledger(s.me, k, listOf(s, e.groupId)).find(it => it.e.id === e.id)?.left).length;
  return done ? { done, total: ks.length } : null;
}

export function paidText(s: Snapshot, e: Expense) {
  const ps = Object.keys(e.payers);
  if (ps.length > 1) return tr("Pagaron {0}", ps.map(k => (k === s.me ? tr("tú") : short(s, k))).join(tr(' y ')));
  return ps[0] === s.me ? tr("Pagaste {0}", moneyT(e.amount, e.currency)) : tr("{0} pagó {1}", short(s, ps[0]), moneyT(e.amount, e.currency));
}

/**
 * Anota un pago. Con grupo, va a ese grupo; sin grupo, se reparte entre las deudas de mayor a menor y lo que sobre
 * queda en el grupo «entre dos».
 */
export async function recordPay(b: Backend, s: Snapshot, from: Id, to: Id, amount: number, groupId?: Id, method: 'transferencia' | 'efectivo' = 'transferencia') {
  const save = (g: Id, x: number) => b.saveExpense({ groupId: g, description: 'Pago', category: 'pago', date: today(), currency: 'DOP', amount: x, fxRate: 1,
    splitMode: 'payment', splitParams: { method }, items: null, tax: 0, tip: 0, note: null, repeat: null, payers: { [from]: x }, shares: { [to]: x }, isPayment: true });
  if (groupId) return [await save(groupId, amount)];
  const ids: Id[] = [];
  let rest = amount;
  for (const t of allDebts(s).filter(t => t.from === from && t.to === to).sort((a, c) => c.amount - a.amount)) {
    if (rest <= 0) break;
    const x = Math.min(rest, t.amount);
    ids.push(await save(t.groupId, x));
    rest -= x;
  }
  if (rest > 0) ids.push(await save(await b.directGroup(from === s.me ? to : from), rest));
  return ids;
}

/** El recordatorio amable que se manda por WhatsApp: lo pendiente (hasta cinco gastos) y dónde pagarte. */
export function reminderText(s: Snapshot, p: Id, amount: number) {
  const open = whyItems(s, s.me, p).filter(it => it.left && !it.e.isPayment && it.x > 0);
  const lines = open.slice(0, 5).map(it => `• ${it.e.description} (${fdate(it.e.date)}): ${moneyT(it.left)}`).join('\n');
  return tr("Hola {0}, según Saldao tenemos pendiente {1}:\n{2}{3}\n\n{4}", short(s, p), moneyT(amount), lines, open.length > 5 ? '\n…' : '', s.profiles[s.me]?.payout ? tr("Me puedes pagar a: {0}", s.profiles[s.me].payout) : '').trim();
}

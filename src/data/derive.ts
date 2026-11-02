import { ledger, nets, pairTransfers, toBase, type Expense, type Id, type LedgerItem } from '../lib/domain';
import type { Snapshot } from './types';

export const live = (s: Snapshot) => s.expenses.filter(e => !e.deletedAt);
export const listOf = (s: Snapshot, g: Id) => live(s).filter(e => e.groupId === g);
export const groupOf = (s: Snapshot, id: Id) => s.groups.find(g => g.id === id);
export const visibleGroups = (s: Snapshot) => s.groups.filter(g => g.kind !== 'directo');
export const byNewest = (a: Expense, b: Expense) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

const friendsCache = new WeakMap<Snapshot, Id[]>();
/** Todas las personas con las que compartes algún grupo. */
export function friends(s: Snapshot): Id[] {
  let f = friendsCache.get(s);
  if (!f) {
    f = [...new Set(s.groups.flatMap(g => g.members))].filter(id => id !== s.me && s.profiles[id])
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
export const short = (s: Snapshot, id: Id) => id === s.me ? 'Tú' : (s.profiles[id]?.name.split(' ')[0] ?? 'Alguien');
export const fullName = (s: Snapshot, id: Id) => id === s.me ? 'Tú' : (s.profiles[id]?.name ?? 'Alguien');
export const initials = (s: Snapshot, id: Id) => (s.profiles[id]?.name ?? '?').split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

export const debts = (s: Snapshot, g: Id) => pairTransfers(listOf(s, g));
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

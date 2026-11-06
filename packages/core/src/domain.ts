// Reglas de dinero de la app. Todo en centavos enteros: nunca se suma con decimales.
export type Id = string;
export type Cents = number;
export type SplitMode = 'equal' | 'exact' | 'percent' | 'shares' | 'adjust' | 'items' | 'payment';

export interface Item { name: string; price: Cents; to: Id[] }

export interface Expense {
  id: Id;
  groupId: Id;
  description: string;
  category: string;
  date: string;            // YYYY-MM-DD, el día del gasto
  currency: string;
  amount: Cents;
  fxRate: number;          // unidades de la moneda del grupo por 1 de esta moneda, fijada el día del gasto
  isPayment: boolean;
  paymentStatus: 'pendiente' | 'confirmado' | null;
  splitMode: SplitMode;
  splitParams: { on?: Id[]; vals?: Record<Id, number>; method?: 'transferencia' | 'efectivo' };
  items: Item[] | null;
  tax: number;             // % ITBIS
  tip: number;             // % ley
  note: string | null;
  repeat: string | null;
  payers: Record<Id, Cents>;
  shares: Record<Id, Cents>;
  createdBy: Id;
  createdAt: string;       // ISO
  deletedAt: string | null;
  pending?: boolean;       // anotado en el teléfono, todavía sin enviar a la base
}

export const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** Reparte `total` centavos según pesos. Los centavos sueltos van a quien tenía más fracción (resto mayor). */
export function apportion(total: Cents, w: Record<Id, number>): Record<Id, Cents> {
  const out: Record<Id, Cents> = {};
  const ids = Object.keys(w).filter(k => w[k] > 0);
  const W = ids.reduce((a, k) => a + w[k], 0);
  Object.keys(w).forEach(k => (out[k] = 0));
  if (!W || total <= 0) return out;
  let used = 0;
  const rem = ids.map(k => {
    const x = (total * w[k]) / W;
    out[k] = Math.floor(x + 1e-9);
    used += out[k];
    return [k, x - out[k]] as const;
  }).sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < total - used; i++) out[rem[i % rem.length][0]]++;
  return out;
}

/** Ítems de una factura: cada ítem se reparte entre quienes lo consumieron; ITBIS y ley, en proporción a lo consumido. */
export function itemSplit(items: Item[], tax: number, tip: number) {
  const subs: Record<Id, Cents> = {};
  for (const it of items) if (it.to.length) {
    const a = apportion(it.price, Object.fromEntries(it.to.map(k => [k, 1])));
    for (const k in a) subs[k] = (subs[k] || 0) + a[k];
  }
  const subtotal = items.reduce((a, it) => a + it.price, 0);
  const taxC = Math.round((subtotal * tax) / 100), tipC = Math.round((subtotal * tip) / 100);
  const total = subtotal + taxC + tipC;
  const unassigned = items.filter(i => !i.to.length).length;
  return { subtotal, taxC, tipC, total, unassigned, shares: apportion(total, subs) };
}

export interface SplitResult { shares: Record<Id, Cents>; ok: boolean; status: string; diff: Cents }

/** Calcula las partes de cada quien. `status` es el texto que ve la persona mientras divide. */
export function split(mode: SplitMode, total: Cents, members: Id[], p: { on?: Record<Id, boolean>; vals?: Record<Id, string | number> } = {},
  fmt: (c: Cents) => string = c => (c / 100).toFixed(2)): SplitResult {
  const on = p.on || {}, vals = p.vals || {};
  const v = (k: Id) => Number(String(vals[k] ?? '').replace(',', '.')) || 0;
  let shares: Record<Id, Cents> = {}, ok = true, status = '', diff = 0;
  if (mode === 'equal') {
    shares = apportion(total, Object.fromEntries(members.map(k => [k, on[k] ? 1 : 0])));
    const n = members.filter(k => on[k]).length;
    ok = n > 0; status = ok ? `Partes iguales entre ${n}` : 'Elige al menos una persona';
  } else if (mode === 'exact') {
    members.forEach(k => (shares[k] = Math.round(v(k) * 100)));
    diff = total - sum(shares);
    ok = diff === 0; status = ok ? 'Cuadra con el total' : diff > 0 ? `Faltan ${fmt(diff)}` : `Sobran ${fmt(-diff)}`;
  } else if (mode === 'percent') {
    const pct = Math.round(members.reduce((a, k) => a + v(k), 0) * 100) / 100;
    ok = pct === 100;
    if (ok) shares = apportion(total, Object.fromEntries(members.map(k => [k, v(k)])));
    else members.forEach(k => (shares[k] = Math.round((total * v(k)) / 100)));
    const d = Math.round(Math.abs(100 - pct) * 100) / 100;
    status = ok ? 'Los porcentajes suman 100 %' : pct < 100 ? `Falta ${d} % por asignar` : `Sobra ${d} %`;
  } else if (mode === 'shares') {
    const w = Object.fromEntries(members.map(k => [k, Math.max(0, Math.round(v(k)))]));
    shares = apportion(total, w);
    const n = sum(w);
    ok = n > 0; status = ok ? `${n} partes en total` : 'Asigna al menos una parte';
  } else if (mode === 'adjust') {
    const adj = Object.fromEntries(members.map(k => [k, Math.round(Math.max(0, v(k)) * 100)]));
    const rest = total - sum(adj);
    const base = apportion(Math.max(rest, 0), Object.fromEntries(members.map(k => [k, 1])));
    members.forEach(k => (shares[k] = base[k] + adj[k]));
    ok = rest >= 0; status = ok ? 'El extra se suma; el resto va en partes iguales' : 'Los extras pasan del total';
  }
  return { shares, ok: ok && total > 0, status, diff };
}

/** Pagado y consumido convertidos a la moneda del grupo, cuadrando el redondeo para que ambos sumen lo mismo. */
export function toBase(e: Expense) {
  const T = Math.round(e.amount * e.fxRate);
  const conv = (o: Record<Id, Cents>) => {
    const r: Record<Id, Cents> = {};
    for (const k in o) r[k] = Math.round(o[k] * e.fxRate);
    const d = T - sum(r);
    if (d) { const k = Object.keys(r).sort((a, b) => r[b] - r[a])[0]; r[k] += d; }
    return r;
  };
  return { payers: conv(e.payers), shares: conv(e.shares), total: T };
}

export const involves = (e: Expense, k: Id) => e.payers[k] != null || e.shares[k] != null;

/** Lo que b le debe a a por un gasto (negativo si a le debe a b). Cada saldo es la suma de estos valores. */
export function pairVal(e: Expense, a: Id, b: Id): Cents {
  const { payers, shares, total } = toBase(e);
  return Math.round(((shares[b] || 0) * (payers[a] || 0) - (shares[a] || 0) * (payers[b] || 0)) / total);
}

export interface Transfer { from: Id; to: Id; amount: Cents }

/** Deudas directas entre cada pareja de personas de una lista de gastos. */
export function pairTransfers(list: Expense[]): Transfer[] {
  const ids = [...new Set(list.flatMap(e => [...Object.keys(e.payers), ...Object.keys(e.shares)]))].sort();
  const out: Transfer[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j];
    const x = list.reduce((s, e) => s + pairVal(e, a, b), 0);
    if (x > 0) out.push({ from: b, to: a, amount: x });
    else if (x < 0) out.push({ from: a, to: b, amount: -x });
  }
  return out;
}

export function nets(list: Expense[]): Record<Id, Cents> {
  const n: Record<Id, Cents> = {};
  for (const t of pairTransfers(list)) { n[t.from] = (n[t.from] || 0) - t.amount; n[t.to] = (n[t.to] || 0) + t.amount; }
  return n;
}

/** Plan de pagos mínimo: el que más debe le paga al que más le deben, hasta dejar todo en cero. */
export function simplify(n: Record<Id, Cents>): Transfer[] {
  const cr: [Id, Cents][] = [], db: [Id, Cents][] = [], out: Transfer[] = [];
  for (const k of Object.keys(n).sort()) { if (n[k] > 0) cr.push([k, n[k]]); else if (n[k] < 0) db.push([k, -n[k]]); }
  while (cr.length && db.length) {
    cr.sort((a, b) => b[1] - a[1]); db.sort((a, b) => b[1] - a[1]);
    const x = Math.min(cr[0][1], db[0][1]);
    out.push({ from: db[0][0], to: cr[0][0], amount: x });
    cr[0][1] -= x; db[0][1] -= x;
    if (!cr[0][1]) cr.shift();
    if (!db[0][1]) db.shift();
  }
  return out;
}

export interface LedgerItem {
  e: Expense;
  x: Cents;               // + : b le debe más a a por este movimiento
  left: Cents;            // lo que de este movimiento sigue sin saldar
  covers: Expense[];      // lo que este movimiento fue cerrando
  closedBy?: Expense;     // con qué se terminó de saldar
  closedAt?: string;      // cuándo
}

const byDate = (x: Expense, y: Expense) => x.date.localeCompare(y.date) || x.createdAt.localeCompare(y.createdAt);

/** Movimientos entre a y b, del más viejo al más nuevo, con su estado: lo nuevo en sentido contrario cierra primero lo más viejo. */
export function ledger(a: Id, b: Id, list: Expense[]): LedgerItem[] {
  const items: LedgerItem[] = list.filter(e => !e.deletedAt && involves(e, a) && involves(e, b)).sort(byDate)
    .map(e => ({ e, x: pairVal(e, a, b), left: 0, covers: [] as Expense[] })).filter(it => it.x);
  const open: LedgerItem[] = [];
  for (const it of items) {
    it.left = Math.abs(it.x);
    while (it.left && open.length && Math.sign(open[0].x) !== Math.sign(it.x)) {
      const o = open[0], y = Math.min(o.left, it.left);
      o.left -= y; it.left -= y; it.covers.push(o.e);
      if (!o.left) { o.closedBy = it.e; o.closedAt = it.e.date; open.shift(); }
    }
    if (!it.left) { it.closedBy = it.covers[it.covers.length - 1]; it.closedAt = it.e.date; }
    if (it.left) open.push(it);
  }
  return items;
}

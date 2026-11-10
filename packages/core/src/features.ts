// Lo que calculan las mejoras (docs/MEJORAS.md), igual en la web y en la app nativa: fondo común, presupuesto, resumen
// del mes, buscar, gastos de siempre, quién te debe hace mucho, exportar, el QR para cobrar, la tasa del día y las rutas
// de las fotos.
import { create as createQr } from 'qrcode';
import { cat } from './categories';
import { friendBal, friends, groupOf, live, listOf, pendingInfo, short } from './derive';
import { toBase, type Expense, type Id, type Transfer } from './domain';
import { fdate, moneyT, MONTHS, today } from './format';
import { newId } from './queue';
import type { Snapshot } from './types';
import { getLang, tr } from './i18n';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const thisMonth = () => today().slice(0, 7);
/** Sin tildes y en minúsculas, para buscar «mofongo» y encontrar «Mofóngo». */
export const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ── fondo común ──────────────────────────────────────────────
export const isFund = (s: Snapshot, id: Id) => !!s.profiles[id]?.fundOf;
export const fundOf = (s: Snapshot, g: Id): Id | null => groupOf(s, g)?.members.find(m => s.profiles[m]?.fundOf === g) ?? null;
/** Lo que queda en el fondo: lo que se le aportó menos lo que pagó. */
/** Cómo se lee una deuda; con el fondo común, lo que el fondo guarda de cada uno o lo que falta aportar. */
export function xferTitle(s: Snapshot, t: Transfer) {
  if (isFund(s, t.from)) return t.to === s.me ? tr("El fondo te guarda") : tr("El fondo le guarda a {0}", short(s, t.to));
  if (isFund(s, t.to)) return t.from === s.me ? tr("Te falta aportar al fondo") : tr("A {0} le falta aportar", short(s, t.from));
  return t.from === s.me ? tr("Le debes a {0}", short(s, t.to)) : t.to === s.me ? tr("{0} te debe", short(s, t.from)) : tr("{0} le debe a {1}", short(s, t.from), short(s, t.to));
}
export function fundLeft(s: Snapshot, g: Id): number {
  const f = fundOf(s, g);
  if (!f) return 0;
  return sum(listOf(s, g).map(e => { const b = toBase(e); return (b.shares[f] || 0) - (b.payers[f] || 0); }));
}

// ── grupos de fecha a fecha ──────────────────────────────────
/** «Del 20 al 27 dic», «Desde el 20 dic» o «Hasta el 27 dic». */
export function groupDates(g: { startsOn: string | null; endsOn: string | null }) {
  if (g.startsOn && g.endsOn) return tr("Del {0} al {1}", fdate(g.startsOn), fdate(g.endsOn));
  if (g.startsOn) return tr("Desde el {0}", fdate(g.startsOn));
  if (g.endsOn) return tr("Hasta el {0}", fdate(g.endsOn));
  return '';
}
/** Ya pasó la fecha de fin: toca saldar y archivar. */
export const groupEnded = (g: { endsOn: string | null; archivedAt: string | null }) => !!g.endsOn && !g.archivedAt && g.endsOn < today();
export const groupUpcoming = (g: { startsOn: string | null }) => !!g.startsOn && g.startsOn > today();

// ── presupuesto del grupo ────────────────────────────────────
/** Lo gastado en el grupo este mes (sin pagos) contra el presupuesto. */
export function budgetUse(s: Snapshot, g: Id, month = thisMonth()) {
  const grp = groupOf(s, g);
  if (!grp?.budget) return null;
  const spent = sum(listOf(s, g).filter(e => !e.isPayment && e.date.startsWith(month)).map(e => toBase(e).total));
  return { spent, budget: grp.budget, ratio: spent / grp.budget };
}

// ── resumen del mes ──────────────────────────────────────────
export interface MonthStats {
  month: string; total: number; prev: number; count: number;
  byCat: { key: string; name: string; amount: number }[];
  byGroup: { groupId: Id; amount: number }[];
  top: Expense[];
}
const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
export const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number), d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** Tu parte de lo gastado en el mes (lo que te tocó consumir, no lo que pagaste), por categoría y por grupo. */
export function monthStats(s: Snapshot, month = thisMonth()): MonthStats {
  const mine = (e: Expense) => toBase(e).shares[s.me] || 0;
  const of = (m: string) => live(s).filter(e => !e.isPayment && e.date.startsWith(m) && mine(e) > 0);
  const list = of(month);
  const by = <K extends string>(key: (e: Expense) => K) => {
    const acc = new Map<K, number>();
    for (const e of list) acc.set(key(e), (acc.get(key(e)) || 0) + mine(e));
    return [...acc.entries()].sort((a, b) => b[1] - a[1]);
  };
  return {
    month, total: sum(list.map(mine)), prev: sum(of(prevMonth(month)).map(mine)), count: list.length,
    byCat: by(e => e.category).map(([key, amount]) => ({ key, name: cat(key).name, amount })),
    byGroup: by(e => e.groupId).map(([groupId, amount]) => ({ groupId, amount })),
    top: [...list].sort((a, b) => mine(b) - mine(a)).slice(0, 5),
  };
}
export const monthName = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${MONTHS[getLang()][mo - 1]} ${y}`; };

// ── buscar ───────────────────────────────────────────────────
export interface Filters { text?: string; groupId?: Id; person?: Id; cat?: string; from?: string; to?: string }
export function searchExpenses(s: Snapshot, f: Filters): Expense[] {
  const q = fold(f.text ?? '');
  const digits = q.replace(/[^\d]/g, '');
  return live(s).filter(e => {
    if (f.groupId && e.groupId !== f.groupId) return false;
    if (f.person && e.payers[f.person] == null && e.shares[f.person] == null) return false;
    if (f.cat && e.category !== f.cat) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    if (!q) return true;
    const hay = fold([e.description, e.note ?? '', cat(e.category).name, groupOf(s, e.groupId)?.name ?? '', ...(e.items ?? []).map(i => i.name),
      ...Object.keys({ ...e.payers, ...e.shares }).map(k => s.profiles[k]?.name ?? '')].join(' '));
    return hay.includes(q) || (digits.length >= 2 && String(Math.round(e.amount / 100)).includes(digits));
  }).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

// ── gastos de siempre ────────────────────────────────────────
/** Los que más repites (misma descripción en el mismo grupo, dos veces o más): el más reciente de cada uno. */
export function frequentExpenses(s: Snapshot, n = 6): Expense[] {
  const acc = new Map<string, { e: Expense; count: number }>();
  for (const e of live(s)) {
    if (e.isPayment || e.createdBy !== s.me) continue;
    const k = `${e.groupId}|${fold(e.description)}`;
    const cur = acc.get(k);
    if (!cur) acc.set(k, { e, count: 1 });
    else acc.set(k, { e: e.date > cur.e.date ? e : cur.e, count: cur.count + 1 });
  }
  return [...acc.values()].filter(x => x.count >= 2).sort((a, b) => b.count - a.count || b.e.date.localeCompare(a.e.date)).slice(0, n).map(x => x.e);
}

// ── recordatorios ────────────────────────────────────────────
const daysSince = (d: string) => Math.floor((Date.now() - new Date(`${d}T12:00:00`).getTime()) / 86400000);
/** Quién te debe con algo sin saldar desde hace más de `days` días: para recordarle. */
export function overdue(s: Snapshot, days = 15) {
  return friends(s).map(p => ({ p, amount: friendBal(s, p).b, since: pendingInfo(s, p).since }))
    .filter(x => x.amount > 0 && x.since && daysSince(x.since) >= days)
    .map(x => ({ ...x, days: daysSince(x.since!) }))
    .sort((a, b) => b.days - a.days);
}

// ── gastos que se repiten ────────────────────────────────────
export const REPEATS = [['', 'No se repite'], ['semanal', 'Cada semana'], ['quincenal', 'Cada quincena'], ['mensual', 'Cada mes'], ['anual', 'Cada año']] as const;
export const repeatText = (r: string | null | undefined) => tr(REPEATS.find(([k]) => k === (r ?? ''))?.[1] ?? 'No se repite');

// ── cómo se dividió ──────────────────────────────────────────
export function splitText(e: Expense, nm: (k: Id) => string) {
  const vals = e.splitParams.vals ?? {};
  const list = (suf = '') => Object.keys(vals).filter(k => vals[k]).map(k => `${nm(k)} ${vals[k]}${suf}`).join(', ');
  switch (e.splitMode) {
    case 'equal': return tr("Partes iguales entre {0}", Object.keys(e.shares).length);
    case 'percent': return tr("Por porcentaje: {0}", list(' %'));
    case 'shares': return e.splitParams.unit === 'noches' ? tr("Por noches: {0}", list()) : tr("Por partes: {0}", list());
    case 'items': return tr("Por lo que consumió cada quien{0}.", e.tax || e.tip ? tr(", con {0} repartidos en proporción", [e.tax && `ITBIS ${e.tax} %`, e.tip && tr("ley {0} %", e.tip)].filter(Boolean).join(' y ')) : '');
    case 'adjust': return tr("Partes iguales con extras");
    default: return tr("Montos exactos");
  }
}

// ── exportar ─────────────────────────────────────────────────
const groupLabel = (s: Snapshot, g: Id) => { const x = groupOf(s, g); return x?.kind === 'directo' ? tr("Entre dos: {0}", x.members.map(m => short(s, m)).join(' y ')) : x?.name ?? ''; };
const csvCell = (v: string | number) => { const t = String(v); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
const plain = (c: number) => (c / 100).toFixed(2);
const people = (s: Snapshot, o: Record<Id, number>, cur: string) => Object.entries(o).map(([k, v]) => `${s.profiles[k]?.name ?? tr("Alguien")} ${moneyT(v, cur)}`).join('; ');
/** Los gastos (de un grupo o de todos) en CSV para Excel o Google Sheets. */
export function exportCsv(s: Snapshot, groupId?: Id): string {
  const list = (groupId ? listOf(s, groupId) : live(s)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const head = [tr("Fecha"), tr("Grupo"), tr("Descripción"), tr("Categoría"), tr("Tipo"), tr("Monto"), tr("Moneda"), tr("Tasa"), tr("Monto RD$"), tr("Pagó"), tr("Partes"), tr("Tu parte RD$"), tr("Nota")];
  const rows = list.map(e => {
    const b = toBase(e);
    return [e.date, groupLabel(s, e.groupId), e.description, cat(e.category).name, e.isPayment ? tr("Pago") : tr("Gasto"), plain(e.amount), e.currency,
      e.fxRate, plain(b.total), people(s, e.payers, e.currency), people(s, e.shares, e.currency), plain(b.shares[s.me] || 0), e.note ?? ''];
  });
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'); // con BOM: Excel lee bien las tildes
}
const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
/** Un informe para imprimir o guardar en PDF: los gastos y quién le debe a quién. */
export function exportHtml(s: Snapshot, groupId?: Id, debtsLines: string[] = []): string {
  const list = (groupId ? listOf(s, groupId) : live(s)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const title = groupId ? groupLabel(s, groupId) : tr("Todas mis cuentas");
  const rows = list.map(e => `<tr><td>${fdate(e.date)}</td><td>${esc(e.isPayment ? tr("Pago") : e.description)}${groupId ? '' : `<br><small>${esc(groupLabel(s, e.groupId))}</small>`}</td>`
    + `<td>${esc(Object.keys(e.payers).map(k => short(s, k)).join(', '))}</td><td class="n">${esc(moneyT(toBase(e).total))}</td></tr>`).join('');
  return `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><title>${esc(title)} · Saldao</title><style>
body{font:14px/1.4 -apple-system,system-ui,sans-serif;color:#121318;margin:32px}h1{font-size:22px;margin:0 0 4px}p{color:#6c6e78;margin:0 0 20px}
table{width:100%;border-collapse:collapse}td,th{padding:8px 6px;border-bottom:1px solid #e5e3db;text-align:left;vertical-align:top}th{font-size:12px;color:#6c6e78}
.n{text-align:right;white-space:nowrap}small{color:#6c6e78}ul{padding-left:18px}</style></head><body>
<h1>${esc(title)}</h1><p>Saldao · ${esc(fdate(today()))} · ${esc(tr('{0} movimientos · total {1}', list.length, moneyT(sum(list.filter(e => !e.isPayment).map(e => toBase(e).total)))))}</p>
${debtsLines.length ? `<h2>${esc(tr('Quién le debe a quién'))}</h2><ul>${debtsLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
<table><thead><tr><th>${esc(tr('Fecha'))}</th><th>${esc(tr('Qué'))}</th><th>${esc(tr('Pagó'))}</th><th class="n">${esc(tr('Monto'))}</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
export const exportName = (s: Snapshot, groupId?: Id) => `saldao-${fold(groupId ? groupLabel(s, groupId) : 'mis-cuentas').replace(/[^a-z0-9]+/g, '-')}-${today()}`;

// ── QR para cobrar ───────────────────────────────────────────
/** El texto del QR: tus datos de cobro y, si hay, el monto. Cualquier cámara lo lee. */
export function payQrText(s: Snapshot, amount?: number) {
  const me = s.profiles[s.me];
  return [tr("Pagar a {0}", me.name), me.payout, amount ? tr("Monto: {0}", moneyT(amount)) : null, tr("Saldao")].filter(Boolean).join('\n');
}
/** El QR como un trazo SVG (cuadros de 1×1 en un lienzo de `size`): cada app lo dibuja con su SVG. */
export function qrPath(text: string): { size: number; d: string } {
  const { modules } = createQr(text, { errorCorrectionLevel: 'M' });
  let d = '';
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return { size: modules.size, d };
}

// ── tasa del dólar ───────────────────────────────────────────
/** La tasa de hoy (RD$ por US$ 1), de ExchangeRate-API. Sin conexión o si falla: null. */
/** Pesos por 1 de esa moneda, de hoy (ExchangeRate-API, sin clave). Con 4 decimales: el yen vale menos de un peso. */
export async function fetchRate(cur: string): Promise<number | null> {
  if (cur === 'DOP') return 1;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const j = await r.json() as { result?: string; rates?: Record<string, number> };
    const dop = j.rates?.DOP, x = j.rates?.[cur];
    if (j.result !== 'success' || !dop || !x || dop <= 0 || x <= 0) return null;
    return Math.round((dop / x) * 10000) / 10000;
  } catch { return null; }
}
/** @deprecated usar fetchRate('USD') */
export const fetchUsdRate = () => fetchRate('USD');

// ── fotos ────────────────────────────────────────────────────
const tag = () => newId().replace(/-/g, '').slice(0, 8);
export const expensePhotoPath = (groupId: Id, expenseId: Id) => `gastos/${groupId}/${expenseId}-${tag()}.jpg`;
export const groupPhotoPath = (groupId: Id) => `grupos/${groupId}/foto-${tag()}.jpg`;

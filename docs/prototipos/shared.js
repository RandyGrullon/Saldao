/* Cuentas Claras · prototipo de diseño con datos de ejemplo.
   Datos, cálculo de saldos, gestos y vistas que comparten los dos diseños.
   Cada diseño aporta sus tokens, su CSS y su pantalla de inicio con CC.start(). */
(() => {
'use strict';

/* ── utilidades ───────────────────────────────────────────── */
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = s => s[0].toUpperCase() + s.slice(1);
const NF = new Intl.NumberFormat('en-US'); // en RD se escribe 1,234.56
const CUR = { DOP: 'RD$', USD: 'US$' };
const FX = { DOP: 1, USD: 63.10 }; // shortcut: tasa fija de ejemplo; la app real guarda la tasa del día de cada gasto
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const TODAY = '2026-11-02';
const NOW = new Date('2026-11-02T09:30:00');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = () => { try { navigator.vibrate?.(8); } catch { /* sin háptica */ } };

function parts(c) { const a = Math.abs(Math.round(c)); return [NF.format(Math.floor(a / 100)), String(a % 100).padStart(2, '0')]; }
function money(c, cur = 'DOP', sign = false) {
  const [i, d] = parts(c), s = c < 0 ? '−' : sign && c > 0 ? '+' : '';
  return `<span class="money">${s}${CUR[cur]}&nbsp;${i}<small>.${d}</small></span>`;
}
function moneyT(c, cur = 'DOP') { const [i, d] = parts(c); return `${c < 0 ? '−' : ''}${CUR[cur]} ${i}.${d}`; }
const fmtN = n => String(Math.round(n * 100) / 100);
const D = s => new Date(s.length === 10 ? s + 'T12:00:00' : s);
const fdate = s => { const d = D(s); return `${d.getDate()} ${MES[d.getMonth()]}`; };
const fday = s => { const d = D(s); return cap(`${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}`); };
const ftime = s => { const d = D(s); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
function ago(s) {
  const m = (NOW - D(s)) / 60000;
  if (m < 60) return `hace ${Math.max(1, Math.round(m))} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  if (m < 2880) return 'ayer';
  if (m < 10080) return `hace ${Math.floor(m / 1440)} días`;
  return fdate(s); // fecha absoluta pasada una semana
}
let tick = 0;
const stamp = () => new Date(NOW.getTime() + (++tick) * 60000).toISOString();

/* ── iconos (trazo, 24×24) ────────────────────────────────── */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  wifi: '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><path d="M12 20h.01"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  fuel: '<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
  receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  del: '<path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"/><path d="m18 9-6 6"/><path d="m12 9 6 6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  cal: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
};
const I = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

/* ── datos de ejemplo ─────────────────────────────────────── */
const P = {
  me:     { name: 'Carolina Méndez', short: 'Tú',     ini: 'CM', hue: null, bank: 'Banco Popular · ahorro ···· 7734' },
  laura:  { name: 'Laura Peña',      short: 'Laura',  ini: 'LP', hue: 220,  bank: 'Banco Popular · ahorro ···· 4821' },
  miguel: { name: 'Miguel Santos',   short: 'Miguel', ini: 'MS', hue: 40,   bank: 'Banreservas · corriente ···· 0937' },
  paola:  { name: 'Paola Reyes',     short: 'Paola',  ini: 'PR', hue: 160,  bank: 'BHD · ahorro ···· 5512' },
  andres: { name: 'Andrés Batista',  short: 'Andrés', ini: 'AB', hue: 340,  bank: 'Banco Popular · ahorro ···· 2290' },
};
const FRIENDS = ['laura', 'miguel', 'paola', 'andres'];
const ALL5 = ['me', ...FRIENDS];
const GROUPS = [
  { id: 'samana', name: 'Samaná', kind: 'Viaje', when: '30 oct – 1 nov', members: ALL5 },
  { id: 'naco', name: 'Apto. Naco', kind: 'Casa', when: 'Gastos del apartamento', members: ['me', 'laura', 'miguel'] },
];
const CATS = {
  rent: ['Alquiler', 'home'], power: ['Luz', 'bolt'], net: ['Internet', 'wifi'], groceries: ['Supermercado', 'cart'],
  fuel: ['Gasolina', 'fuel'], lodging: ['Hospedaje', 'bed'], food: ['Comida y bebida', 'food'], tour: ['Excursión', 'compass'],
  other: ['General', 'receipt'], pay: ['Pago', 'swap'],
};
const GUESS = [[/alquil|renta/i, 'rent'], [/luz|ede|electric/i, 'power'], [/internet|claro|altice|wifi/i, 'net'],
  [/super|sirena|colmado|bravo|compra|hielo/i, 'groceries'], [/gasolin|combust|peaje/i, 'fuel'], [/hotel|villa|airbnb|hosped/i, 'lodging'],
  [/cena|almuer|desayun|comida|pizza|pollo|bar|cerveza|presidente/i, 'food'], [/excurs|tour|entrada|bote/i, 'tour']];
const guessCat = s => (GUESS.find(([r]) => r.test(s)) || [0, 'other'])[1];
const RECEIPT = { desc: 'Pica pollo y cervezas', tax: 18, tip: 10, items: [
  { n: 'Pica pollo familiar', p: 85000 }, { n: 'Tostones con salami', p: 42000 },
  { n: 'Presidente grande ×4', p: 100000 }, { n: 'Refresco de 2 litros', p: 15000 }] };

const RAW = [
  { id: 'e1', g: 'samana', desc: 'Villa en Las Terrenas', cat: 'lodging', date: '2026-10-30', cur: 'USD', amt: 64000, by: { laura: 64000 },
    mode: 'equal', on: ALL5, who: 'laura', at: '2026-10-28T10:42', note: 'Dos noches, tres habitaciones.' },
  { id: 'e2', g: 'samana', desc: 'Gasolina ida y vuelta', cat: 'fuel', date: '2026-10-30', cur: 'DOP', amt: 680000, by: { me: 680000 },
    mode: 'equal', on: ['me', 'miguel', 'paola', 'andres'], who: 'me', at: '2026-10-30T08:15', note: 'Laura se fue en guagua.' },
  { id: 'e3', g: 'samana', desc: 'Colmado y hielo', cat: 'groceries', date: '2026-10-30', cur: 'DOP', amt: 427500, by: { paola: 427500 },
    mode: 'equal', on: ALL5, who: 'paola', at: '2026-10-30T17:20' },
  { id: 'e4', g: 'samana', desc: 'Cena en la playa', cat: 'food', date: '2026-10-31', cur: 'DOP', payer: 'miguel', mode: 'items', tax: 18, tip: 10,
    items: [
      { n: 'Pescado frito con tostones', p: 145000, to: ['me', 'paola'] },
      { n: 'Langosta a la plancha', p: 230000, to: ['laura'] },
      { n: 'Camarones al coco', p: 168000, to: ['miguel', 'andres'] },
      { n: 'Arroz con coco ×2', p: 90000, to: ALL5 },
      { n: 'Presidente grande ×6', p: 150000, to: ['me', 'miguel', 'andres'] },
      { n: 'Jugo de chinola ×2', p: 60000, to: ['laura', 'paola'] }],
    who: 'miguel', at: '2026-10-31T22:05', comments: [{ who: 'laura', text: 'La langosta valió cada peso.', at: '2026-11-01T09:12' }] },
  { id: 'e5', g: 'samana', desc: 'Excursión a Los Haitises', cat: 'tour', date: '2026-10-31', cur: 'DOP', amt: 1250000, by: { andres: 1250000 },
    mode: 'shares', vals: { me: 1, laura: 1, miguel: 1, paola: 1, andres: 2 }, who: 'andres', at: '2026-10-31T19:40',
    note: 'Andrés cubrió también a su primo Luis.' },
  { id: 'e6', g: 'samana', pay: true, desc: 'Pago', cat: 'pay', date: '2026-11-01', cur: 'DOP', amt: 500000, by: { miguel: 500000 }, sh: { laura: 500000 },
    who: 'miguel', at: '2026-11-01T16:30' },
  { id: 'n1', g: 'naco', desc: 'Alquiler de octubre', cat: 'rent', date: '2026-10-01', cur: 'DOP', amt: 4500000, by: { me: 4500000 },
    mode: 'percent', vals: { me: 40, laura: 30, miguel: 30 }, rec: 'Cada mes', who: 'me', at: '2026-10-01T08:00', note: 'Tú tienes la habitación con baño.' },
  { id: 'n2', g: 'naco', pay: true, desc: 'Pago', cat: 'pay', date: '2026-10-15', cur: 'DOP', amt: 1000000, by: { laura: 1000000 }, sh: { me: 1000000 },
    who: 'laura', at: '2026-10-15T12:10' },
  { id: 'n3', g: 'naco', desc: 'Luz Edeeste de octubre', cat: 'power', date: '2026-10-20', cur: 'DOP', amt: 342000, by: { laura: 342000 },
    mode: 'equal', on: ['me', 'laura', 'miguel'], who: 'laura', at: '2026-10-20T18:44' },
  { id: 'n4', g: 'naco', desc: 'Internet Claro', cat: 'net', date: '2026-10-22', cur: 'DOP', amt: 269000, by: { miguel: 269000 },
    mode: 'equal', on: ['me', 'laura', 'miguel'], rec: 'Cada mes', who: 'miguel', at: '2026-10-22T07:30' },
  { id: 'n5', g: 'naco', desc: 'Compra en Sirena', cat: 'groceries', date: '2026-10-26', cur: 'DOP', amt: 784550, by: { me: 500000, laura: 284550 },
    mode: 'equal', on: ['me', 'laura', 'miguel'], who: 'me', at: '2026-10-26T13:05' },
  { id: 's1', g: null, desc: 'Almuerzo del viernes', cat: 'food', date: '2026-10-23', cur: 'DOP', amt: 196000, by: { paola: 196000 },
    mode: 'equal', on: ['me', 'paola'], who: 'paola', at: '2026-10-23T13:30' },
];

/* ── división ─────────────────────────────────────────────── */
// Reparte `total` centavos según pesos, con resto mayor: los centavos sueltos van a quien más fracción tenía.
function apportion(total, w) {
  const out = {}, ids = Object.keys(w).filter(k => w[k] > 0), W = ids.reduce((a, k) => a + w[k], 0);
  Object.keys(w).forEach(k => out[k] = 0);
  if (!W || total <= 0) return out;
  let used = 0;
  const rem = ids.map(k => { const x = total * w[k] / W; out[k] = Math.floor(x + 1e-9); used += out[k]; return [k, x - out[k]]; })
    .sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < total - used; i++) out[rem[i % rem.length][0]]++;
  return out;
}
function itemSplit(items, tax, tip) {
  const subs = {};
  for (const it of items) if (it.to.length) {
    const a = apportion(it.p, Object.fromEntries(it.to.map(k => [k, 1])));
    for (const k in a) subs[k] = (subs[k] || 0) + a[k];
  }
  const subtotal = items.reduce((a, it) => a + it.p, 0);
  const taxC = Math.round(subtotal * tax / 100), tipC = Math.round(subtotal * tip / 100), total = subtotal + taxC + tipC;
  return { subtotal, taxC, tipC, total, sh: apportion(total, subs) }; // ITBIS y ley se reparten según lo que consumió cada quien
}
function split(mode, total, ms, { on = {}, vals = {}, cur = 'DOP' } = {}) {
  const v = k => +vals[k] || 0, sh = {};
  let ok = true, status = '';
  if (mode === 'equal') {
    Object.assign(sh, apportion(total, Object.fromEntries(ms.map(k => [k, on[k] ? 1 : 0]))));
    const n = ms.filter(k => on[k]).length;
    ok = n > 0; status = ok ? `Partes iguales entre ${n}` : 'Elige al menos una persona';
  } else if (mode === 'exact') {
    ms.forEach(k => sh[k] = Math.round(v(k) * 100));
    const d = total - sum(sh);
    ok = d === 0; status = ok ? 'Cuadra con el total' : d > 0 ? `Faltan ${moneyT(d, cur)}` : `Sobran ${moneyT(-d, cur)}`;
  } else if (mode === 'percent') {
    const p = Math.round(ms.reduce((a, k) => a + v(k), 0) * 100) / 100;
    ok = p === 100;
    if (ok) Object.assign(sh, apportion(total, Object.fromEntries(ms.map(k => [k, v(k)]))));
    else ms.forEach(k => sh[k] = Math.round(total * v(k) / 100));
    status = ok ? 'Los porcentajes suman 100 %' : p < 100 ? `Falta ${fmtN(100 - p)} % por asignar` : `Sobra ${fmtN(p - 100)} %`;
  } else if (mode === 'shares') {
    const w = Object.fromEntries(ms.map(k => [k, Math.max(0, Math.round(v(k)))])), n = sum(w);
    Object.assign(sh, apportion(total, w));
    ok = n > 0; status = ok ? `${n} partes en total` : 'Asigna al menos una parte';
  } else if (mode === 'adjust') {
    const adj = Object.fromEntries(ms.map(k => [k, Math.round(Math.max(0, v(k)) * 100)])), rest = total - sum(adj);
    const base = apportion(Math.max(rest, 0), Object.fromEntries(ms.map(k => [k, 1])));
    ms.forEach(k => sh[k] = base[k] + adj[k]);
    ok = rest >= 0; status = ok ? 'El extra se suma; el resto va en partes iguales' : 'Los extras pasan del total';
  }
  return { sh, ok: ok && total > 0, status };
}

function build(r) {
  const e = { comments: [], ...r };
  if (e.mode === 'items') { const x = itemSplit(e.items, e.tax, e.tip); e.amt = x.total; e.by = { [e.payer]: x.total }; e.sh = x.sh; }
  else if (!e.sh) e.sh = split(e.mode, e.amt, e.on || Object.keys(e.vals), { on: Object.fromEntries((e.on || []).map(k => [k, true])), vals: e.vals }).sh;
  for (const k of Object.keys(e.sh)) if (!e.sh[k]) delete e.sh[k];
  console.assert(sum(e.by) === e.amt && sum(e.sh) === e.amt, 'El gasto no cuadra', e.id);
  return e;
}
const EXP = RAW.map(build);

/* ── saldos ───────────────────────────────────────────────── */
const G = id => GROUPS.find(g => g.id === id);
const EX = id => EXP.find(e => e.id === id);
const live = () => EXP.filter(e => !e.deleted);
const listOf = g => live().filter(e => e.g === g);
const involves = (e, k) => e.by[k] != null || e.sh[k] != null;
const byNewest = (a, b) => D(b.date) - D(a.date) || D(b.at) - D(a.at);

function dop(e) { // montos en centavos de peso; pagado y consumido suman lo mismo
  const f = FX[e.cur], T = Math.round(e.amt * f);
  const conv = o => { const r = {}; for (const k in o) r[k] = Math.round(o[k] * f); const d = T - sum(r); if (d) { const k = Object.keys(r).sort((a, b) => r[b] - r[a])[0]; r[k] += d; } return r; };
  return { by: conv(e.by), sh: conv(e.sh), T };
}
const mineOf = e => { const { by, sh } = dop(e); return (by.me || 0) - (sh.me || 0); };
// Lo que b le debe a a por un gasto (negativo si a le debe a b). Todo saldo sale de sumar estos valores,
// así que cada deuda se puede explicar gasto por gasto.
function pairVal(e, a, b) {
  const { by, sh, T } = dop(e);
  return Math.round(((sh[b] || 0) * (by[a] || 0) - (sh[a] || 0) * (by[b] || 0)) / T);
}
function pairTransfers(list) {
  const ids = [...new Set(list.flatMap(e => [...Object.keys(e.by), ...Object.keys(e.sh)]))], out = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = ids[i], b = ids[j], x = list.reduce((s, e) => s + pairVal(e, a, b), 0);
    if (x > 0) out.push({ from: b, to: a, amt: x }); else if (x < 0) out.push({ from: a, to: b, amt: -x });
  }
  return out;
}
function nets(list) {
  const n = {};
  for (const t of pairTransfers(list)) { n[t.from] = (n[t.from] || 0) - t.amt; n[t.to] = (n[t.to] || 0) + t.amt; }
  return n;
}
// Movimientos entre a y b dentro de un grupo, del más viejo al más nuevo. Cada uno sabe cuánto le queda
// sin saldar: lo nuevo en sentido contrario (un pago u otro gasto) cierra primero lo más viejo.
function ledger(a, b, g) {
  const items = listOf(g).filter(e => involves(e, a) && involves(e, b))
    .sort((x, y) => D(x.date) - D(y.date) || D(x.at) - D(y.at))
    .map(e => ({ e, x: pairVal(e, a, b) })).filter(it => it.x);
  const open = [];
  for (const it of items) {
    it.left = Math.abs(it.x); it.covers = [];
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
const sharedGroups = (a, b) => [...GROUPS.map(g => g.id), null].filter(g => listOf(g).some(e => involves(e, a) && involves(e, b)));
function pendingInfo(p) { // lo que sigue abierto con p: cuántos gastos y desde cuándo
  const open = sharedGroups('me', p).flatMap(g => ledger('me', p, g)).filter(it => it.left && !it.e.pay);
  const oldest = open.map(it => it.e.date).sort()[0];
  return { n: open.length, since: oldest };
}
// Mínimo de pagos: el que más debe le paga al que más le deben, hasta que todos quedan en cero.
function simplify(n) {
  const cr = [], db = [], out = [];
  for (const k of Object.keys(n)) { if (n[k] > 0) cr.push([k, n[k]]); else if (n[k] < 0) db.push([k, -n[k]]); }
  while (cr.length && db.length) {
    cr.sort((a, b) => b[1] - a[1]); db.sort((a, b) => b[1] - a[1]);
    const x = Math.min(cr[0][1], db[0][1]);
    out.push({ from: db[0][0], to: cr[0][0], amt: x });
    cr[0][1] -= x; db[0][1] -= x;
    if (!cr[0][1]) cr.shift(); if (!db[0][1]) db.shift();
  }
  return out;
}
const debts = g => pairTransfers(listOf(g));
const allDebts = () => [...GROUPS.map(g => g.id), null].flatMap(g => debts(g).map(t => ({ ...t, g })));
function friendBal(p) {
  let b = 0; const by = {};
  for (const t of allDebts()) {
    const x = t.from === p && t.to === 'me' ? t.amt : t.from === 'me' && t.to === p ? -t.amt : 0;
    if (x) { b += x; by[t.g ?? ''] = (by[t.g ?? ''] || 0) + x; }
  }
  return { b, by };
}
function myTotals() {
  let owed = 0, owe = 0;
  for (const p of FRIENDS) { const { b } = friendBal(p); if (b > 0) owed += b; else owe -= b; }
  return { owed, owe, net: owed - owe };
}
const groupBal = g => nets(listOf(g)).me || 0;
const spent = list => list.filter(e => !e.pay).reduce((a, e) => a + dop(e).T, 0);

/* ── textos ───────────────────────────────────────────────── */
const nm = k => k === 'me' ? 'Tú' : P[k].short;
const gname = g => g ? G(g).name : 'Sin grupo';
function payText(from, to) {
  if (from === 'me') return `Le pagaste a <b>${P[to].short}</b>`;
  if (to === 'me') return `<b>${P[from].short}</b> te pagó`;
  return `<b>${P[from].short}</b> le pagó a <b>${P[to].short}</b>`;
}
function paidText(e) {
  const ps = Object.keys(e.by);
  if (ps.length > 1) return `Pagaron ${ps.map(k => k === 'me' ? 'tú' : P[k].short).join(' y ')}`;
  return ps[0] === 'me' ? `Pagaste ${moneyT(e.amt, e.cur)}` : `${P[ps[0]].short} pagó ${moneyT(e.amt, e.cur)}`;
}
function impact(e) { // lo que este gasto mueve tu saldo
  const m = mineOf(e);
  if (e.pay) return m > 0 ? `<span class="end pos"><span class="lbl">pagaste</span>${money(m)}</span>`
    : m < 0 ? `<span class="end"><span class="lbl">recibiste</span>${money(-m)}</span>` : `<span class="end zero"><span class="lbl">no participas</span></span>`;
  if (m > 0) return `<span class="end pos"><span class="lbl">prestaste</span>${money(m, 'DOP', true)}</span>`;
  if (m < 0) return `<span class="end"><span class="lbl">te prestaron</span>${money(-m)}</span>`;
  return `<span class="end zero"><span class="lbl">${involves(e, 'me') ? 'pagaste lo tuyo' : 'no participas'}</span></span>`;
}
function balText(c, who) { // saldo con alguien o en un grupo
  if (c > 0) return `<span class="end pos"><span class="lbl">${who ? 'te debe' : 'te deben'}</span>${money(c, 'DOP', true)}</span>`;
  if (c < 0) return `<span class="end"><span class="lbl">${who ? 'le debes' : 'debes'}</span>${money(-c)}</span>`;
  return `<span class="end zero"><span class="lbl">a mano</span></span>`;
}
function modeText(e) {
  if (e.pay) return 'Pago entre dos personas';
  const ks = Object.keys(e.sh);
  if (e.mode === 'equal') return `Partes iguales entre ${ks.length}`;
  if (e.mode === 'percent') return 'Por porcentaje: ' + Object.keys(e.vals).map(k => `${nm(k)} ${e.vals[k]} %`).join(', ');
  if (e.mode === 'shares') return 'Por partes: ' + Object.keys(e.vals).filter(k => e.vals[k]).map(k => `${nm(k)} ${e.vals[k]}`).join(', ');
  if (e.mode === 'items') return `Por lo que pidió cada quien. ITBIS ${e.tax} % y ley ${e.tip} % repartidos en proporción.`;
  if (e.mode === 'adjust') return 'Partes iguales con extras';
  return 'Montos exactos';
}
const owesText = (from, to) => from === 'me' ? `Le debes a ${P[to].short}` : to === 'me' ? `${P[from].short} te debe` : `${P[from].short} le debe a ${P[to].short}`;
function itemStatus(it) { // ¿ya se saldó este movimiento?
  if (!it.left) return `<span class="pill ok">${it.e.pay ? 'aplicado' : 'saldado'}${it.closedAt ? ` ${fdate(it.closedAt)}` : ''}</span>`;
  if (it.e.pay) return `<span class="pill">${it.covers.length ? `sobran ${moneyT(it.left)}` : 'a favor'}</span>`;
  if (it.left < Math.abs(it.x)) return `<span class="pill warn">quedan ${moneyT(it.left)}</span>`;
  return '<span class="pill warn">pendiente</span>';
}
function whyRow(it, a, b) { // un renglón del porqué, visto desde a: + suma a lo que b le debe a a
  const e = it.e, debtor = it.x > 0 ? b : a, share = e.sh[debtor] || 0;
  const title = e.pay ? `${payText(Object.keys(e.by)[0], Object.keys(e.sh)[0])}` : `«${esc(e.desc)}»`;
  const sub = e.pay ? (it.covers.length ? `Cubrió ${it.covers.map(c => `«${esc(c.desc)}»`).join(', ')}${it.left ? ` y sobraron ${moneyT(it.left)}` : ''}` : 'Quedó como saldo a favor')
    : `${paidText(e)} · ${debtor === 'me' ? 'tu parte' : `parte de ${P[debtor].short}`} ${moneyT(share, e.cur)}${e.g && CC.showGroup ? ` · ${esc(G(e.g).name)}` : ''}`;
  const closed = it.closedBy && !it.left && !it.e.pay ? ` · se saldó con ${it.closedBy.pay ? `el pago del ${fdate(it.closedBy.date)}` : `«${esc(it.closedBy.desc)}»`}` : '';
  return `<li><button class="row why-row tap" data-act="open-exp" data-id="${e.id}">
    <span class="lead date"><b>${D(e.date).getDate()}</b>${MES[D(e.date).getMonth()]}</span>
    <span class="main"><span class="t">${title}</span><span class="s">${sub}${closed}</span></span>
    <span class="end-wrap"><span class="end">${money(it.x, 'DOP', true)}</span>${itemStatus(it)}</span></button></li>`;
}
function whyItems(a, b, g) { // g undefined: todos los grupos
  const gs = g === undefined ? sharedGroups(a, b) : [g];
  return gs.flatMap(x => ledger(a, b, x)).sort((p, q) => D(q.e.date) - D(p.e.date) || D(q.e.at) - D(p.e.at));
}
function myStatus(e) { // en la lista: si tu parte de este gasto ya se saldó
  if (e.pay) return '';
  const ks = [...new Set([...Object.keys(e.by), ...Object.keys(e.sh)])].filter(k => k !== 'me' && pairVal(e, 'me', k));
  if (!ks.length) return '';
  const done = ks.filter(k => !ledger('me', k, e.g).find(it => it.e === e).left).length;
  return done === ks.length ? ' · <span class="pill ok">saldado</span>' : done ? ` · <span class="pill">${done} de ${ks.length} saldados</span>` : '';
}

/* ── piezas de vista ──────────────────────────────────────── */
const av = (k, size = '') => `<span class="av ${size}" style="--h:${P[k].hue ?? 0}"${k === 'me' ? ' data-me' : ''} aria-hidden="true">${P[k].ini}</span>`;
const avs = ks => `<span class="avs">${ks.map(k => av(k, 'xs')).join('')}</span>`;
const bar = back => `<header class="bar"><button class="back tap" data-act="back">${I('left')}<span>${esc(back)}</span></button></header>`;

function expRow(e, run) {
  const [, ci] = CATS[e.cat], isLedger = CC.variant === 'ledger';
  const from = Object.keys(e.by)[0], to = e.pay && Object.keys(e.sh)[0];
  const lead = isLedger ? `<span class="lead date"><b>${D(e.date).getDate()}</b>${MES[D(e.date).getMonth()]}</span>` : av(e.pay ? from : from);
  const title = e.pay ? payText(from, to) : esc(e.desc);
  const sub = e.pay ? `${moneyT(e.amt)} · ${fdate(e.date)}${e.pending ? ' · <span class="pill warn">por confirmar</span>' : ''}`
    : `${I(ci, 'ic sm')}${paidText(e)}${isLedger ? '' : ` · ${fdate(e.date)}`}${e.rec ? ` · ${I('repeat', 'ic sm')}` : ''}${myStatus(e)}`;
  return `<li class="swipe"><button class="row tap" data-act="open-exp" data-id="${e.id}">${lead}
    <span class="main"><span class="t">${title}</span><span class="s">${sub}</span></span>
    <span class="end-wrap">${impact(e)}${run != null ? `<span class="run">saldo ${money(run, 'DOP', true)}</span>` : ''}</span></button>
    <button class="swipe-act tap" data-act="del-exp" data-id="${e.id}" tabindex="-1">${I('trash')}<span>Eliminar</span></button></li>`;
}
function groupRow(g) {
  return `<li><button class="row tap" data-act="open-group" data-id="${g.id}">${avs(g.members)}
    <span class="main"><span class="t">${esc(g.name)}</span><span class="s">${g.kind} · ${g.members.length} personas</span></span>${balText(groupBal(g.id))}</button></li>`;
}
function events() {
  const ev = [];
  for (const e of live()) {
    ev.push({ at: e.at, who: e.who, e, kind: e.pay ? 'pay' : 'add' });
    for (const c of e.comments) ev.push({ at: c.at, who: c.who, e, kind: 'comment', text: c.text });
  }
  return ev.sort((a, b) => D(b.at) - D(a.at));
}
let seenAt = '2026-11-01T00:00:00';
function evRow(ev) {
  const e = ev.e, w = ev.who, where = e.g ? ` en ${esc(G(e.g).name)}` : '';
  const text = ev.kind === 'comment' ? `<b>${w === 'me' ? 'Tú' : P[w].short}</b> comentó en «${esc(e.desc)}»: “${esc(ev.text)}”`
    : ev.kind === 'pay' ? `${payText(Object.keys(e.by)[0], Object.keys(e.sh)[0])} ${moneyT(e.amt)}${where}`
    : `${w === 'me' ? 'Añadiste' : `<b>${P[w].short}</b> añadió`} «${esc(e.desc)}»${where}`;
  const fresh = D(ev.at) > D(seenAt);
  return `<li><button class="row tap ${fresh ? 'fresh' : ''}" data-act="open-exp" data-id="${e.id}">${av(w)}
    <span class="main"><span class="t wrap">${text}</span><span class="s">${ago(ev.at)}${fresh ? ' · <span class="pill">nuevo</span>' : ''}</span></span>
    ${ev.kind === 'comment' ? '' : impact(e)}</button></li>`;
}

/* ── pantallas ────────────────────────────────────────────── */
function groupsView() {
  const solo = listOf(null);
  return `<div class="scroll pad"><header class="title-row"><h1>Grupos</h1><button class="btn sm tap" data-act="new-group">${I('plus', 'ic sm')}Nuevo</button></header>
    <ul class="list card">${GROUPS.map(groupRow).join('')}</ul>
    ${solo.length ? `<h2 class="sec">Sin grupo</h2><ul class="list card">${FRIENDS.filter(p => solo.some(e => involves(e, p))).map(p => `<li><button class="row tap" data-act="open-friend" data-id="${p}">${av(p)}
      <span class="main"><span class="t">${P[p].name}</span><span class="s">Gastos entre ustedes dos</span></span>${balText(friendBal(p).by[''] || 0, true)}</button></li>`).join('')}</ul>` : ''}</div>`;
}
function activityView() {
  return `<div class="scroll pad"><header class="title-row"><h1>Actividad</h1></header><ul class="list card">${events().map(evRow).join('')}</ul></div>`;
}
function accountView() {
  return `<div class="scroll pad"><header class="title-row"><h1>Cuenta</h1></header>
    <section class="card profile">${av('me', 'lg')}<div><p class="t">${P.me.name}</p><p class="s">carolina.mendez@ejemplo.do</p></div></section>
    <h2 class="sec">Dónde te pagan</h2>
    <section class="card bankcard"><p class="t">${P.me.bank}</p><p class="s">Lo ven tus amigos cuando te van a pagar.</p>
      <button class="btn sm tap" data-act="copy" data-text="${P.me.bank}">${I('copy', 'ic sm')}Copiar</button></section>
    <h2 class="sec">Preferencias</h2>
    <dl class="list card prefs"><div><dt>Moneda principal</dt><dd>Peso dominicano (RD$)</dd></div><div><dt>Avisos</dt><dd>Push y correo</dd></div>
      <div><dt>Tema</dt><dd>Según el sistema</dd></div><div><dt>Idioma</dt><dd>Español</dd></div></dl>
    <p class="foot">Prototipo de diseño. Personas, montos y cuentas bancarias son de ejemplo.</p></div>`;
}
function groupView(id) {
  const g = G(id), list = listOf(id).sort(byNewest), n = nets(listOf(id)), me = n.me || 0, d = debts(id);
  let run = null;
  if (CC.variant === 'ledger') { // saldo acumulado, como un estado de cuenta
    run = {}; let acc = 0;
    for (const e of [...list].reverse()) { acc += mineOf(e); run[e.id] = acc; }
  }
  const days = [...new Set(list.map(e => e.date))];
  return `${bar(CC.backLabel())}<div class="scroll pad">
    <header class="head">${avs(g.members)}<h1>${esc(g.name)}</h1><p class="meta">${g.kind} · ${g.members.length} personas · ${esc(g.when)}</p></header>
    <section class="card sumcard"><p class="lbl">${me > 0 ? 'En este grupo te deben' : me < 0 ? 'En este grupo debes' : 'En este grupo estás a mano'}</p>
      <p class="big${me > 0 ? ' pos' : ''}">${money(Math.abs(me), 'DOP', me > 0)}</p>
      <p class="note">Gastado entre todos: ${moneyT(spent(listOf(id)))} · ${d.length ? `${d.length} ${d.length === 1 ? 'deuda abierta' : 'deudas abiertas'}` : 'nadie le debe a nadie'}</p>
      <div class="actions"><button class="btn primary tap" data-act="settle" data-id="${id}"${d.length ? '' : ' disabled'}>Saldar</button><button class="btn tap" data-act="add" data-g="${id}">${I('plus', 'ic sm')}Gasto</button></div></section>
    <h2 class="sec">Quién le debe a quién <span class="hint">toca para ver por qué</span></h2>
    ${d.length ? `<ul class="list card xfers">${d.map(t => xferRow(t, id)).join('')}</ul>` : '<p class="note">Todo el grupo está a mano.</p>'}
    <h2 class="sec">Gastos <span class="hint">desliza una fila para borrarla</span></h2>
    ${days.map(day => `<h3 class="day">${fday(day)}</h3><ul class="list card">${list.filter(e => e.date === day).map(e => expRow(e, run && run[e.id])).join('')}</ul>`).join('')}
  </div>`;
}
function friendView(p) {
  const { b, by } = friendBal(p), info = pendingInfo(p), gs = sharedGroups('me', p);
  return `${bar(CC.backLabel())}<div class="scroll pad">
    <header class="head">${av(p, 'lg')}<h1>${P[p].name}</h1></header>
    <section class="card sumcard"><p class="lbl">${b > 0 ? `${P[p].short} te debe` : b < 0 ? `Le debes a ${P[p].short}` : 'Están a mano'}</p>
      <p class="big${b > 0 ? ' pos' : ''}">${money(Math.abs(b), 'DOP', b > 0)}</p>
      ${b && info.n ? `<p class="note">${info.n} ${info.n === 1 ? 'gasto sin saldar' : 'gastos sin saldar'}, el más viejo del ${fday(info.since).toLowerCase()}</p>` : ''}
      ${Object.keys(by).length > 1 ? `<ul class="breakdown">${Object.keys(by).map(g => `<li><span>${esc(gname(g || null))}</span>${money(by[g], 'DOP', true)}</li>`).join('')}</ul>` : ''}
      <div class="actions">${b < 0 ? `<button class="btn primary tap" data-act="pay" data-to="${p}" data-amt="${-b}">Pagar</button>`
        : b > 0 ? `<button class="btn primary tap" data-act="remind" data-p="${p}">Recordar</button><button class="btn tap" data-act="got-paid" data-p="${p}" data-amt="${b}">Me pagó</button>` : ''}</div></section>
    <h2 class="sec">Por qué</h2>
    <p class="note legend">Con + ${P[p].short} te debe más; con − le debes tú o ya te pagó. Toca un renglón para ver el gasto.</p>
    ${gs.map(g => { const its = ledger('me', p, g), s = its.reduce((a, it) => a + it.x, 0); return its.length ? `<h3 class="day">${esc(gname(g))}<span>${s ? money(s, 'DOP', true) : 'a mano'}</span></h3>
      <ul class="list card why">${[...its].reverse().map(it => whyRow(it, 'me', p)).join('')}</ul>` : ''; }).join('')}</div>`;
}
function expView(id) {
  const e = EX(id); if (!e) return bar(CC.backLabel());
  const [cn, ci] = CATS[e.cat], m = mineOf(e), people = [...new Set([...Object.keys(e.by), ...Object.keys(e.sh)])];
  const owner = Object.keys(e.by).length === 1 ? Object.keys(e.by)[0] : null;
  const you = e.pay ? '' : m > 0 ? `Te deben ${moneyT(m)} por este gasto.` : m < 0 ? `Tu parte: ${moneyT(-m)}${owner ? `, se la debes a ${P[owner].short}` : ''}.` : involves(e, 'me') ? 'Pagaste justo lo tuyo.' : 'No participas en este gasto.';
  return `${bar(CC.backLabel())}<div class="scroll pad">
    <header class="head"><p class="meta">${I(ci, 'ic sm')}${cn} · ${fday(e.date)} · ${esc(gname(e.g))}</p>
      <h1>${e.pay ? payText(Object.keys(e.by)[0], Object.keys(e.sh)[0]) : esc(e.desc)}</h1>
      <p class="big">${money(e.amt, e.cur)}</p>
      ${e.cur !== 'DOP' ? `<p class="note">Equivale a ${moneyT(dop(e).T)} · US$ 1 = RD$ ${FX[e.cur].toFixed(2)} ese día</p>` : ''}
      ${e.rec ? `<p class="note">${I('repeat', 'ic sm')} Se repite: ${e.rec.toLowerCase()}</p>` : ''}
      ${e.pending ? `<p class="note"><span class="pill warn">por confirmar</span> ${P[Object.keys(e.sh)[0]].short} todavía no confirma que le llegó.</p>` : ''}</header>
    <section class="card"><h2>${e.pay ? 'Detalle' : 'Quién pagó y cuánto le toca'}</h2><p class="note">${modeText(e)}</p>
      <ul class="shares">${people.map(k => {
        const x = k === 'me' || e.pay ? 0 : pairVal(e, 'me', k), it = x && ledger('me', k, e.g).find(i => i.e === e);
        const rel = x ? `<span class="s">${x > 0 ? `te debe ${moneyT(x)}` : `le debes ${moneyT(-x)}`} ${itemStatus(it)}</span>` : '';
        return `<li>${av(k)}<span class="main"><span class="t">${k === 'me' ? 'Tú' : P[k].name}</span>
        ${e.by[k] ? `<span class="s">pagó ${moneyT(e.by[k], e.cur)}</span>` : ''}${rel}</span><span class="end">${e.pay ? (e.by[k] ? 'envió' : 'recibió') : money(e.sh[k] || 0, e.cur)}</span></li>`; }).join('')}</ul>
      ${you ? `<p class="you">${you}</p>` : ''}</section>
    ${e.items ? itemsCard(e) : ''}
    ${e.note ? `<section class="card"><h2>Nota</h2><p>${esc(e.note)}</p></section>` : ''}
    <section class="card"><h2>Comentarios</h2>
      ${e.comments.length ? `<ul class="comments">${e.comments.map(c => `<li>${av(c.who, 'sm')}<div><p class="s">${nm(c.who)} · ${ago(c.at)}</p><p>${esc(c.text)}</p></div></li>`).join('')}</ul>` : '<p class="note">Todavía nadie comenta.</p>'}
      <form class="composer" data-form="comment" data-id="${e.id}"><input id="cm-${e.id}" name="t" placeholder="Escribe un comentario" enterkeyhint="send" autocomplete="off" aria-label="Comentario">
        <button class="icon-btn tap" aria-label="Enviar comentario">${I('send')}</button></form></section>
    <p class="hist">${e.who === 'me' ? 'Lo añadiste tú' : `Lo añadió ${P[e.who].short}`} el ${fdate(e.at)} a las ${ftime(e.at)}</p>
    <button class="btn danger block tap" data-act="del-exp" data-id="${e.id}">${I('trash', 'ic sm')}Eliminar ${e.pay ? 'pago' : 'gasto'}</button></div>`;
}
function itemsCard(e) {
  const x = itemSplit(e.items, e.tax, e.tip);
  return `<section class="card"><h2>Recibo escaneado</h2><ul class="items">${e.items.map(it => `<li><span class="main"><span class="t">${esc(it.n)}</span>${avs(it.to)}</span>${money(it.p)}</li>`).join('')}</ul>
    <dl class="totals"><div><dt>Subtotal</dt><dd>${money(x.subtotal)}</dd></div><div><dt>ITBIS ${e.tax} %</dt><dd>${money(x.taxC)}</dd></div>
    <div><dt>Ley ${e.tip} %</dt><dd>${money(x.tipC)}</dd></div><div class="total"><dt>Total</dt><dd>${money(x.total)}</dd></div></dl></section>`;
}

/* ── hojas ────────────────────────────────────────────────── */
const head = (title, right = '<span></span>', left = '<button class="link tap" data-act="close-sheet">Cancelar</button>') =>
  `<div class="sheet-head" data-drag>${left}<h2>${title}</h2>${right}</div>`;
const xferRow = (t, g) => {
  const act = t.from === 'me' ? `<button class="btn primary sm tap" data-act="pay" data-to="${t.to}" data-amt="${t.amt}"${g !== undefined ? ` data-g="${g ?? ''}"` : ''}>Pagar</button>`
    : t.to === 'me' ? `<button class="btn sm tap" data-act="remind" data-p="${t.from}">Recordar</button>` : '';
  const its = whyItems(t.to, t.from, g), open = its.filter(it => it.left && !it.e.pay), over = its.find(it => it.left && it.e.pay), since = open.map(it => it.e.date).sort()[0];
  CC.showGroup = g === undefined;
  const rows = its.map(it => whyRow(it, t.to, t.from)).join('');
  CC.showGroup = false;
  return `<li class="xfer${act ? ' mine' : ''}"><details><summary class="row tap"><span class="pair">${av(t.from, 'sm')}${I('right', 'ic sm')}${av(t.to, 'sm')}</span>
    <span class="main"><span class="t">${owesText(t.from, t.to)}</span><span class="s">${open.length ? `${open.length} ${open.length === 1 ? 'gasto sin saldar' : 'gastos sin saldar'} · desde el ${fdate(since)}` : over ? `Pagó de más el ${fdate(over.e.date)}` : ''}</span></span>
    <span class="end-wrap"><span class="end">${money(t.amt)}</span><span class="more">${I('left', 'ic sm chev')}Por qué</span></span></summary>
    <ul class="why">${rows}</ul></details>${act ? `<div class="xfer-act">${act}</div>` : ''}</li>`;
};
function settleSheet(gid) {
  const g = G(gid), l = listOf(gid), d = debts(gid), s = simplify(nets(l)).length;
  return `${head(`Saldar ${esc(g.name)}`, '<span></span>', '<button class="link tap" data-act="close-sheet">Cerrar</button>')}<div class="scroll sheet-scroll pad">
    ${d.length ? `<p class="finding"><strong>${d.length} ${d.length === 1 ? 'deuda abierta' : 'deudas abiertas'}</strong> en ${esc(g.name)}.</p>
    <p class="note">Toca una para ver de qué gastos sale, cuándo fue y qué ya se saldó.${s < d.length ? ` Con «Simplificar deudas» bastarían ${s} pagos.` : ''}</p>
    <ul class="list card xfers">${d.map(t => xferRow(t, gid)).join('')}</ul>` : `<p class="finding">Todo el mundo está a mano en ${esc(g.name)}.</p>`}</div>`;
}
function mySettleSheet() {
  const mine = allDebts().filter(t => t.from === 'me' || t.to === 'me');
  const per = {}; // por persona, como en Inicio
  for (const t of mine) { const p = t.from === 'me' ? t.to : t.from; per[p] = (per[p] || 0) + (t.from === 'me' ? -t.amt : t.amt); }
  const rows = Object.keys(per).filter(p => per[p]).map(p => per[p] < 0 ? { from: 'me', to: p, amt: -per[p] } : { from: p, to: 'me', amt: per[p] });
  return `${head('Saldar cuentas', '<span></span>', '<button class="link tap" data-act="close-sheet">Cerrar</button>')}<div class="scroll sheet-scroll pad">
    ${rows.length ? `<p class="note">Sumando todos tus grupos y los gastos sueltos.</p><ul class="list card xfers">${rows.map(t => xferRow(t)).join('')}</ul>` : '<p class="finding">Estás a mano con todo el mundo.</p>'}</div>`;
}
let PAY = null;
function paySheet() {
  const p = P[PAY.to];
  return `${head(`Pagar a ${p.short}`)}<div class="scroll sheet-scroll pad paysheet">
    <label class="amount-in" for="pay-amt"><span>RD$</span><input id="pay-amt" inputmode="decimal" enterkeyhint="done" autocomplete="off" value="${(PAY.amt / 100).toFixed(2)}" aria-label="Monto a pagar"></label>
    <section class="card"><h2>Cuenta de ${p.short}</h2><p class="t">${p.bank}</p><p class="s">${p.name}</p>
      <button class="btn sm tap" data-act="copy" data-text="${p.bank}">${I('copy', 'ic sm')}Copiar cuenta</button></section>
    <div class="seg" role="radiogroup" aria-label="Cómo pagas">${[['transfer', 'Transferencia'], ['cash', 'Efectivo']].map(([k, l]) =>
      `<button class="tap" role="radio" aria-checked="${PAY.method === k}" data-act="pay-method" data-k="${k}">${l}</button>`).join('')}</div>
    <button class="btn primary block tap" data-act="pay-save">Registrar pago</button>
    <p class="note center">${p.short} recibe un aviso para confirmar que le llegó.</p></div>`;
}
let NG = null;
function newGroupSheet() {
  return `${head('Nuevo grupo', `<button class="link strong tap" data-act="ng-save"${NG.name.trim() ? '' : ' disabled'}>Crear</button>`)}<div class="scroll sheet-scroll pad">
    <input class="field" id="ng-name" data-in="ng-name" value="${esc(NG.name)}" placeholder="Nombre del grupo" enterkeyhint="done" autocomplete="off" aria-label="Nombre del grupo">
    <h3>Tipo</h3><div class="seg" role="radiogroup" aria-label="Tipo de grupo">${['Casa', 'Viaje', 'Pareja', 'Otro'].map(k =>
      `<button class="tap" role="radio" aria-checked="${NG.kind === k}" data-act="ng-kind" data-k="${k}">${k}</button>`).join('')}</div>
    <h3>Personas</h3><div class="chips">${FRIENDS.map(k => `<button class="chip person tap" role="checkbox" aria-checked="${NG.on.includes(k)}" data-act="ng-tog" data-k="${k}">${av(k, 'xs')}${P[k].short}</button>`).join('')}</div>
    <p class="note">También puedes invitar por enlace o QR cuando el grupo exista.</p></div>`;
}

/* nuevo gasto: paso 1 monto, paso 2 división */
const MODES = [['equal', 'Iguales'], ['exact', 'Montos'], ['percent', '%'], ['shares', 'Partes'], ['adjust', 'Extra'], ['items', 'Ítems']];
let A = null;
const cents = () => Math.round(parseFloat(A.s || '0') * 100) || 0;
const members = () => G(A.g).members;
const ones = ms => Object.fromEntries(ms.map(k => [k, 1]));
const typed = s => { const [i, d] = s.split('.'); return NF.format(+i || 0) + (d !== undefined ? '.' + d : ''); };
function addOpen(g) {
  A = { step: 1, s: '', cur: 'DOP', desc: '', g: g || 'samana', date: TODAY, payer: 'me', mode: 'equal', on: {}, vals: {}, items: null };
  setMode('equal'); openSheet(addSheet, 'Nuevo gasto', true);
}
function setMode(m) {
  A.mode = m; const ms = members(), total = A.mode === 'items' && A.items ? 0 : cents();
  if (m === 'equal') A.on = Object.fromEntries(ms.map(k => [k, true]));
  if (m === 'exact') { const a = apportion(total, ones(ms)); A.vals = Object.fromEntries(ms.map(k => [k, (a[k] / 100).toFixed(2)])); }
  if (m === 'percent') { const a = apportion(10000, ones(ms)); A.vals = Object.fromEntries(ms.map(k => [k, fmtN(a[k] / 100)])); }
  if (m === 'shares') A.vals = ones(ms);
  if (m === 'adjust') A.vals = {};
}
function splitNow() {
  if (A.mode !== 'items') return split(A.mode, cents(), members(), { on: A.on, vals: A.vals, cur: A.cur });
  if (!A.items) return { ok: false, sh: {}, status: 'Escanea un recibo para dividir por ítems' };
  const x = itemSplit(A.items, A.tax, A.tip), un = A.items.filter(i => !i.to.length).length;
  return { ok: !un, sh: x.sh, status: un ? `${un} ${un === 1 ? 'ítem sin nadie' : 'ítems sin nadie'} asignado` : 'Cuadra con el recibo' };
}
const addSheet = () => A.step === 1 ? addStep1() : addStep2();
function addStep1() {
  const c = cents(), cat = CATS[guessCat(A.desc)];
  return `${head('Nuevo gasto', `<button class="link strong tap" data-act="add-next"${c ? '' : ' disabled'}>Siguiente</button>`)}
  <div class="scroll sheet-scroll pad add1">
    <div class="amount"><button class="cur tap" data-act="add-cur" aria-label="Moneda: ${CUR[A.cur]}. Cambiar">${CUR[A.cur]}</button>
      <output class="amount-v${A.s ? '' : ' empty'}" aria-live="polite">${A.s ? typed(A.s) : '0.00'}</output></div>
    ${A.cur !== 'DOP' ? `<p class="note center">${c ? `Equivale a ${moneyT(Math.round(c * FX[A.cur]))}` : 'Se convierte a pesos'} · US$ 1 = RD$ ${FX[A.cur].toFixed(2)}</p>` : ''}
    <input class="field" id="add-desc" data-in="desc" value="${esc(A.desc)}" placeholder="¿En qué fue?" enterkeyhint="done" autocomplete="off" aria-label="Descripción">
    <div class="chips">
      <label class="chip">${I('users', 'ic sm')}<select id="add-g" data-in="g" aria-label="Grupo">${GROUPS.map(g => `<option value="${g.id}"${g.id === A.g ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="chip">${I('cal', 'ic sm')}<input type="date" id="add-date" data-in="date" value="${A.date}" aria-label="Fecha"></label>
      <span class="chip static" id="add-cat">${I(cat[1], 'ic sm')}${cat[0]}</span></div>
    ${A.items ? `<p class="note">${I('receipt', 'ic sm')} Recibo leído: ${A.items.length} ítems con ITBIS y ley. Asigna cada ítem en el siguiente paso.</p>`
      : `<button class="scan tap" data-act="add-scan">${I('camera')}<span>Escanear recibo<small>Demo: carga un recibo de ejemplo</small></span></button>`}
  </div>
  <div class="keypad" role="group" aria-label="Teclado del monto">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(k =>
    `<button class="key tap" data-act="key" data-k="${k}" aria-label="${k === 'del' ? 'Borrar' : k === '.' ? 'Punto' : k}">${k === 'del' ? I('del') : k}</button>`).join('')}</div>`;
}
function addStep2() {
  const r = splitNow(), ms = members(), total = A.items ? itemSplit(A.items, A.tax, A.tip).total : cents();
  return `${head('Dividir', `<button class="link strong tap" data-act="add-save"${r.ok ? '' : ' disabled'}>Guardar</button>`, `<button class="link tap" data-act="add-back">${I('left', 'ic sm')}Monto</button>`)}
  <div class="scroll sheet-scroll pad add2">
    <p class="recap"><span>${esc(A.desc.trim() || 'Gasto')} · ${esc(G(A.g).name)}</span>${money(total, A.cur)}</p>
    <h3>Pagó</h3><div class="chips" role="radiogroup" aria-label="Quién pagó">${ms.map(k =>
      `<button class="chip person tap" role="radio" aria-checked="${A.payer === k}" data-act="add-payer" data-k="${k}">${av(k, 'xs')}${nm(k)}</button>`).join('')}</div>
    <h3>Cómo se divide</h3><div class="seg scroll-x" role="tablist" aria-label="Forma de dividir">${MODES.map(([m, l]) =>
      `<button class="tap" role="tab" aria-selected="${A.mode === m}" data-act="add-mode" data-m="${m}">${l}</button>`).join('')}</div>
    <div id="split-rows">${splitRows(r)}</div>
    <p class="split-status ${r.ok ? 'ok' : 'bad'}" id="split-status" aria-live="polite">${r.ok ? I('check', 'ic sm') : ''}${r.status}</p>
    <button class="btn primary block tap" data-act="add-save"${r.ok ? '' : ' disabled'}>Guardar gasto</button></div>`;
}
function splitRows(r) {
  const ms = members(), cur = A.cur, amt = k => `<span class="end" data-amt="${k}">${money(r.sh[k] || 0, cur)}</span>`;
  if (A.mode === 'items') {
    if (!A.items) return `<button class="scan tap" data-act="add-scan">${I('camera')}<span>Escanear recibo<small>Demo: carga un recibo de ejemplo</small></span></button>`;
    return `<ul class="items edit">${A.items.map((it, i) => `<li><div class="item-top"><span class="t">${esc(it.n)}</span>${money(it.p, cur)}</div>
      <div class="who">${ms.map(k => `<button class="avt tap" aria-pressed="${it.to.includes(k)}" data-act="item-tog" data-i="${i}" data-k="${k}" aria-label="${nm(k)} comió ${esc(it.n)}">${av(k, 'sm')}</button>`).join('')}</div></li>`).join('')}</ul>
      <ul class="list card split-list">${ms.map(k => `<li class="row static">${av(k)}<span class="main"><span class="t">${nm(k)}</span></span>${amt(k)}</li>`).join('')}</ul>`;
  }
  return `<ul class="list card split-list">${ms.map(k => {
    if (A.mode === 'equal') return `<li><button class="row check tap" role="checkbox" aria-checked="${!!A.on[k]}" data-act="add-on" data-k="${k}">${av(k)}<span class="main"><span class="t">${nm(k)}</span></span>
      <span class="end" data-amt="${k}">${A.on[k] ? money(r.sh[k], cur) : '<span class="lbl">no entra</span>'}</span><span class="box">${I('check', 'ic sm')}</span></button></li>`;
    const input = (suf, pre, mode = 'decimal') => `<label class="num-in">${pre ? `<span>${pre}</span>` : ''}<input id="v-${k}" data-in="val" data-k="${k}" inputmode="${mode}" enterkeyhint="next" autocomplete="off" value="${A.vals[k] ?? ''}" placeholder="0" aria-label="${nm(k)}">${suf ? `<span>${suf}</span>` : ''}</label>`;
    const ctl = A.mode === 'exact' ? input('', CUR[cur]) : A.mode === 'percent' ? input('%') : A.mode === 'adjust' ? input('', '+')
      : `<span class="stepper"><button class="tap" data-act="step" data-k="${k}" data-d="-1" aria-label="Menos partes para ${nm(k)}">−</button><output>${A.vals[k] ?? 0}</output><button class="tap" data-act="step" data-k="${k}" data-d="1" aria-label="Más partes para ${nm(k)}">+</button></span>`;
    return `<li class="row static">${av(k)}<span class="main"><span class="t">${nm(k)}</span>${A.mode === 'exact' ? '' : `<span class="s" data-amt-s="${k}">${moneyT(r.sh[k] || 0, cur)}</span>`}</span>${ctl}</li>`;
  }).join('')}</ul>`;
}
function addPartial() { // al escribir en un campo: actualiza montos y estado sin perder el foco
  const r = splitNow(), cur = A.cur;
  for (const k of members()) { const s = sheetEl.querySelector(`[data-amt-s="${k}"]`); if (s) s.textContent = moneyT(r.sh[k] || 0, cur); }
  const st = sheetEl.querySelector('#split-status'); st.className = `split-status ${r.ok ? 'ok' : 'bad'}`; st.innerHTML = (r.ok ? I('check', 'ic sm') : '') + r.status;
  sheetEl.querySelectorAll('[data-act="add-save"]').forEach(b => b.disabled = !r.ok);
}
function addSave() {
  const r = splitNow(); if (!r.ok) return;
  const base = { id: 'x' + Date.now(), g: A.g, desc: A.desc.trim() || CATS[guessCat(A.desc)][0], cat: guessCat(A.desc), date: A.date, cur: A.cur, who: 'me', at: stamp() };
  const e = build(A.mode === 'items' ? { ...base, mode: 'items', payer: A.payer, items: A.items.map(i => ({ ...i, to: [...i.to] })), tax: A.tax, tip: A.tip }
    : { ...base, amt: cents(), by: { [A.payer]: cents() }, sh: { ...r.sh }, mode: A.mode, vals: { ...A.vals } });
  EXP.push(e); buzz(); closeSheet(); refresh();
  toast('Gasto guardado', () => { e.deleted = true; refresh(); });
}

/* ── mecánica: pantallas, hojas, toast ────────────────────── */
let root, stage, views, stack, scrim, host, toastHost, sheetEl, sheetRender, opener;
const currentView = () => views.find(v => !v.hidden);
const TITLES = { home: 'Inicio', groups: 'Grupos', activity: 'Actividad', account: 'Cuenta' };
function after(el, fn) { // corre fn cuando termina la transición de transform (o enseguida si no hay animación)
  if (reduced()) return fn();
  let done = false; const go = () => { if (!done) { done = true; fn(); } };
  el.addEventListener('transitionend', function h(e) { if (e.target === el && e.propertyName === 'transform') { el.removeEventListener('transitionend', h); go(); } });
  setTimeout(go, 700);
}
function push(render, back) {
  const el = document.createElement('section');
  el.className = 'screen'; el._render = render; el._back = back; el.innerHTML = render();
  const under = stack.lastElementChild || currentView();
  stack.append(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('in'); under.classList.add('covered'); }));
  el.addEventListener('pointerdown', edgeSwipe);
}
function pop() {
  const el = stack.lastElementChild; if (!el) return;
  const under = el.previousElementSibling || currentView();
  el.style.transform = under.style.transform = '';
  el.classList.remove('in'); under.classList.remove('covered');
  after(el, () => el.remove());
}
function edgeSwipe(ev) { // volver arrastrando desde el borde izquierdo, como en iOS
  const el = ev.currentTarget, r = el.getBoundingClientRect();
  if (el !== stack.lastElementChild || ev.clientX - r.left > 24 || ev.target.closest('input, textarea')) return;
  const under = el.previousElementSibling || currentView(), w = r.width, x0 = ev.clientX, ac = new AbortController();
  let dx = 0, v = 0, lx = x0, lt = ev.timeStamp;
  el.setPointerCapture(ev.pointerId);
  el.style.transition = under.style.transition = 'none';
  el.addEventListener('pointermove', e => {
    dx = Math.max(0, e.clientX - x0);
    el.style.transform = `translateX(${dx}px)`; under.style.transform = `translateX(${-28 + dx / w * 28}%)`;
    v = (e.clientX - lx) / Math.max(1, e.timeStamp - lt); lx = e.clientX; lt = e.timeStamp;
  }, { signal: ac.signal });
  const up = () => {
    ac.abort(); el.style.transition = under.style.transition = '';
    if (dx > w * 0.35 || v > 0.5) pop(); else { el.style.transform = ''; under.style.transform = ''; }
  };
  el.addEventListener('pointerup', up, { signal: ac.signal }); el.addEventListener('pointercancel', up, { signal: ac.signal });
}
function tab(name) {
  stack.replaceChildren();
  for (const v of views) { v.hidden = v.dataset.tab !== name; v.classList.remove('covered'); v.style.transform = ''; }
  root.querySelectorAll('.tab[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false'));
  if (name === 'activity') { const ev = events()[0]; if (ev) setTimeout(() => { seenAt = ev.at; badge(); }, 1500); }
}
function openSheet(render, label, full = false) {
  host.querySelector('.sheet')?.remove();
  opener = document.activeElement; sheetRender = render;
  host.insertAdjacentHTML('beforeend', `<div class="sheet${full ? ' full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"><div class="grab" data-drag><span></span></div><div class="sheet-in">${render()}</div></div>`);
  sheetEl = host.querySelector('.sheet'); scrim.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('sheet-open')));
  sheetEl.focus({ preventScroll: true });
}
function renderSheet() {
  const sc = sheetEl.querySelector('.sheet-scroll'), top = sc?.scrollTop;
  sheetEl.querySelector('.sheet-in').innerHTML = sheetRender();
  const sc2 = sheetEl.querySelector('.sheet-scroll'); if (sc2 && top) sc2.scrollTop = top;
}
function closeSheet() {
  if (!sheetEl) return;
  const el = sheetEl; sheetEl = null;
  el.style.transform = ''; root.classList.remove('sheet-open');
  after(el, () => { el.remove(); if (!sheetEl) scrim.hidden = true; });
  opener?.focus?.({ preventScroll: true });
}
function sheetDrag(ev) { // arrastrar hacia abajo cierra; la velocidad cuenta tanto como la distancia
  const z = ev.target.closest('[data-drag]');
  if (!z || !sheetEl || ev.target.closest('button, input, select, label')) return;
  const el = sheetEl, h = el.offsetHeight, y0 = ev.clientY, ac = new AbortController();
  let dy = 0, v = 0, ly = y0, lt = ev.timeStamp;
  z.setPointerCapture(ev.pointerId); el.style.transition = 'none';
  z.addEventListener('pointermove', e => {
    dy = e.clientY - y0;
    el.style.transform = `translateY(${dy < 0 ? -Math.sqrt(-dy) * 2 : dy}px)`; // resistencia al subir
    v = (e.clientY - ly) / Math.max(1, e.timeStamp - lt); ly = e.clientY; lt = e.timeStamp;
  }, { signal: ac.signal });
  const up = () => { ac.abort(); el.style.transition = ''; if (dy > h * 0.25 || v > 0.45) closeSheet(); else el.style.transform = ''; };
  z.addEventListener('pointerup', up, { signal: ac.signal }); z.addEventListener('pointercancel', up, { signal: ac.signal });
}
let toastTimer;
function toast(text, undo) {
  clearTimeout(toastTimer);
  toastHost.innerHTML = `<div class="toast" role="status"><span>${esc(text)}</span>${undo ? '<button class="tap" data-act="undo">Deshacer</button>' : ''}</div>`;
  const t = toastHost.firstElementChild; t._undo = undo;
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('on')));
  toastTimer = setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, 4500);
}
function badge() {
  const n = events().filter(ev => D(ev.at) > D(seenAt)).length, b = root.querySelector('.tab[data-tab="activity"] .badge');
  b.hidden = !n; b.textContent = n;
}
const RENDER = { groups: groupsView, activity: activityView, account: accountView };
function refresh() {
  for (const v of views) { const sc = v.querySelector('.scroll'), top = sc?.scrollTop; v.innerHTML = RENDER[v.dataset.tab](); if (top) v.querySelector('.scroll').scrollTop = top; }
  for (const s of stack.children) { const sc = s.querySelector('.scroll'), top = sc?.scrollTop; s.innerHTML = s._render(); if (top) s.querySelector('.scroll').scrollTop = top; }
  badge();
}
function recordPay(from, to, amt, g, extra = {}) { // sin grupo indicado, reparte el pago entre los grupos donde hay deuda
  const made = [], add = (gid, x) => { const e = build({ id: 'p' + Date.now() + made.length, g: gid, pay: true, desc: 'Pago', cat: 'pay', date: TODAY, cur: 'DOP', amt: x, by: { [from]: x }, sh: { [to]: x }, who: 'me', at: stamp(), ...extra }); EXP.push(e); made.push(e); };
  if (g !== undefined) add(g, amt);
  else {
    let rest = amt;
    for (const t of allDebts().filter(t => t.from === from && t.to === to).sort((a, b) => b.amt - a.amt)) { if (rest <= 0) break; const x = Math.min(rest, t.amt); add(t.g, x); rest -= x; }
    if (rest > 0) add(null, rest);
  }
  return made;
}

/* ── acciones ─────────────────────────────────────────────── */
const ACTS = {
  tab: d => tab(d.tab),
  back: () => pop(),
  'open-group': d => { push(() => groupView(d.id), CC.backLabel()); stack.lastElementChild._group = d.id; },
  'open-friend': d => push(() => friendView(d.id), CC.backLabel()),
  'open-exp': d => push(() => expView(d.id), CC.backLabel()),
  add: d => addOpen(d.g || [...stack.children].reverse().find(s => s._group)?._group),
  settle: d => openSheet(() => settleSheet(d.id), 'Saldar grupo'),
  'settle-any': () => openSheet(mySettleSheet, 'Saldar cuentas'),
  'close-sheet': () => closeSheet(),
  undo: (d, t) => { t.closest('.toast')._undo?.(); toastHost.replaceChildren(); },
  'del-exp': d => {
    const e = EX(d.id); e.deleted = true; buzz();
    if (stack.lastElementChild?.querySelector(`[data-form="comment"][data-id="${d.id}"]`)) pop();
    refresh(); toast(e.pay ? 'Pago eliminado' : 'Gasto eliminado', () => { e.deleted = false; refresh(); });
  },
  copy: d => navigator.clipboard.writeText(d.text).then(() => toast('Cuenta copiada')).catch(() => toast('No se pudo copiar. Mantén presionado el texto.')),
  remind: d => { buzz(); toast(`Recordatorio enviado a ${P[d.p].short}`); },
  'got-paid': d => { const made = recordPay(d.p, 'me', +d.amt); refresh(); toast(`Pago de ${P[d.p].short} registrado`, () => { made.forEach(e => e.deleted = true); refresh(); }); },
  pay: d => { PAY = { to: d.to, amt: +d.amt, g: d.g === undefined ? undefined : d.g || null, method: 'transfer' }; openSheet(paySheet, 'Pagar'); },
  'pay-method': d => { PAY.method = d.k; renderSheet(); },
  'pay-save': () => {
    const x = Math.round(parseFloat(sheetEl.querySelector('#pay-amt').value.replace(/,/g, '')) * 100);
    if (!(x > 0)) return toast('Escribe un monto mayor que cero');
    const made = recordPay('me', PAY.to, x, PAY.g, { pending: true }), to = P[PAY.to].short;
    buzz(); closeSheet(); refresh();
    toast(`Pago registrado. ${to} debe confirmarlo.`, () => { made.forEach(e => e.deleted = true); refresh(); });
  },
  'new-group': () => { NG = { name: '', kind: 'Casa', on: [] }; openSheet(newGroupSheet, 'Nuevo grupo'); },
  'ng-kind': d => { NG.kind = d.k; renderSheet(); },
  'ng-tog': d => { NG.on = NG.on.includes(d.k) ? NG.on.filter(k => k !== d.k) : [...NG.on, d.k]; buzz(); renderSheet(); },
  'ng-save': () => {
    const g = { id: 'g' + Date.now(), name: NG.name.trim(), kind: NG.kind, when: 'Creado hoy', members: ['me', ...NG.on] };
    GROUPS.push(g); closeSheet(); refresh(); push(() => groupView(g.id), CC.backLabel()); stack.lastElementChild._group = g.id;
  },
  key: d => {
    if (A.items) { A.items = null; setMode('equal'); }
    let s = A.s;
    if (d.k === 'del') s = s.slice(0, -1);
    else if (d.k === '.') { if (!s.includes('.')) s = (s || '0') + '.'; }
    else { if ((s.split('.')[1] || '').length >= 2 || s.replace('.', '').length >= 9) return; s = s === '0' ? d.k : s + d.k; }
    A.s = s; buzz(); renderSheet();
  },
  'add-cur': () => { A.cur = A.cur === 'DOP' ? 'USD' : 'DOP'; renderSheet(); },
  'add-scan': () => {
    A.items = RECEIPT.items.map(i => ({ ...i, to: [...members()] })); A.tax = RECEIPT.tax; A.tip = RECEIPT.tip;
    A.desc = RECEIPT.desc; A.cur = 'DOP'; A.s = (itemSplit(A.items, A.tax, A.tip).total / 100).toFixed(2); A.mode = 'items';
    buzz(); renderSheet();
  },
  'add-next': () => { if (!A.items && A.mode === 'exact') setMode('exact'); A.step = 2; renderSheet(); },
  'add-back': () => { A.step = 1; renderSheet(); },
  'add-payer': d => { A.payer = d.k; buzz(); renderSheet(); },
  'add-mode': d => { setMode(d.m); renderSheet(); },
  'add-on': d => { A.on[d.k] = !A.on[d.k]; buzz(); renderSheet(); },
  step: d => { A.vals[d.k] = Math.max(0, (+A.vals[d.k] || 0) + +d.d); buzz(); renderSheet(); },
  'item-tog': d => { const it = A.items[d.i]; it.to = it.to.includes(d.k) ? it.to.filter(k => k !== d.k) : [...it.to, d.k]; buzz(); renderSheet(); },
  'add-save': () => addSave(),
};
const INPUTS = {
  desc: t => { A.desc = t.value; const c = CATS[guessCat(A.desc)]; sheetEl.querySelector('#add-cat').innerHTML = I(c[1], 'ic sm') + c[0]; },
  g: t => { A.g = t.value; setMode(A.mode === 'items' ? 'equal' : A.mode); if (A.items) A.items.forEach(i => i.to = [...members()]); if (!members().includes(A.payer)) A.payer = 'me'; },
  date: t => { A.date = t.value || TODAY; },
  val: t => { A.vals[t.dataset.k] = t.value.replace(',', '.'); addPartial(); },
  'ng-name': t => { NG.name = t.value; sheetEl.querySelector('[data-act="ng-save"]').disabled = !NG.name.trim(); },
};

/* ── arranque ─────────────────────────────────────────────── */
const CC = window.CC = {
  variant: 'pastel', backLabel: () => stack.lastElementChild ? 'Atrás' : TITLES[currentView().dataset.tab],
  P, FRIENDS, GROUPS, I, av, avs, money, moneyT, esc, fdate, ago, nm, gname, friendBal, myTotals, groupBal, listOf, spent,
  events, evRow, groupRow, balText, impact, mineOf, live, byNewest, pendingInfo, ledger, debts, nets, pairTransfers, EXP, showGroup: false,
  start({ home, variant }) {
    CC.variant = variant; RENDER.home = home;
    root = document.getElementById('app'); root.className = 'app';
    root.innerHTML = `<div class="stage">${['home', 'groups', 'activity', 'account'].map((t, i) => `<section class="view" data-tab="${t}"${i ? ' hidden' : ''}></section>`).join('')}<div class="stack"></div></div>
      <nav class="tabbar" aria-label="Secciones">
        <button class="tab tap" data-act="tab" data-tab="home" aria-current="page">${I('home')}<span>Inicio</span></button>
        <button class="tab tap" data-act="tab" data-tab="groups">${I('users')}<span>Grupos</span></button>
        <button class="tab tab-add tap" data-act="add" aria-label="Añadir gasto">${I('plus')}</button>
        <button class="tab tap" data-act="tab" data-tab="activity">${I('bell')}<span>Actividad</span><span class="badge" hidden></span></button>
        <button class="tab tap" data-act="tab" data-tab="account">${I('user')}<span>Cuenta</span></button></nav>
      <div class="scrim" hidden data-act="close-sheet"></div><div class="sheet-host"></div><div class="toast-host"></div>`;
    stage = root.querySelector('.stage'); views = [...root.querySelectorAll('.view')]; stack = root.querySelector('.stack');
    scrim = root.querySelector('.scrim'); host = root.querySelector('.sheet-host'); toastHost = root.querySelector('.toast-host');
    root.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (t && !t.disabled && root.contains(t)) ACTS[t.dataset.act]?.(t.dataset, t, e); });
    root.addEventListener('input', e => { const t = e.target.closest('[data-in]'); if (t) INPUTS[t.dataset.in]?.(t); });
    root.addEventListener('change', e => { const t = e.target.closest('select[data-in], input[type="date"][data-in]'); if (t) { INPUTS[t.dataset.in]?.(t); renderSheet(); } });
    root.addEventListener('submit', e => {
      e.preventDefault(); const f = e.target, txt = f.t.value.trim(); if (!txt) return;
      EX(f.dataset.id).comments.push({ who: 'me', text: txt, at: stamp() }); buzz(); refresh();
    });
    host.addEventListener('pointerdown', sheetDrag);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') sheetEl ? closeSheet() : pop(); });
    document.addEventListener('gesturestart', e => e.preventDefault()); // iOS: sin zoom de pellizco
    refresh();
  },
};
})();

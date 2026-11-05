// Backend de demostración: los datos del prototipo en memoria. `npm run dev:demo`.
// Salir o borrar la cuenta llama a `onExit` (en la web, recargar la página: vuelve a empezar).
import { apportion, itemSplit, split, type Cents, type Expense, type Id, type Item } from './domain';
import type { Activity, Backend, Comment, Group, Profile, Snapshot, Verb } from './types';

const P = (id: Id, name: string, payout: string | null = null): Profile => ({ id, userId: id === 'me' ? 'u-me' : `u-${id}`, name, email: null, payout, username: null, deletedAt: null });
let profiles: Record<Id, Profile> = {
  me: P('me', 'Carolina Méndez', 'Banco Popular · ahorro · 7734'),
  laura: P('laura', 'Laura Peña', 'Banco Popular · ahorro · 4821'),
  miguel: P('miguel', 'Miguel Santos', 'Banreservas · corriente · 0937'),
  paola: P('paola', 'Paola Reyes', 'BHD · ahorro · 5512'),
  andres: P('andres', 'Andrés Batista', 'Banco Popular · ahorro · 2290'),
};
const ALL5 = ['me', 'laura', 'miguel', 'paola', 'andres'];
const G = (id: Id, name: string, kind: Group['kind'], members: Id[], createdAt: string): Group =>
  ({ id, name, kind, currency: 'DOP', inviteToken: `demo-${id}`, createdAt, members, roles: Object.fromEntries(members.map((m, i) => [m, i ? 'miembro' : 'admin'])) });
let groups: Group[] = [
  G('samana', 'Samaná', 'viaje', ALL5, '2026-10-25T10:00:00'),
  G('naco', 'Apto. Naco', 'casa', ['me', 'laura', 'miguel'], '2025-03-01T10:00:00'),
  G('d-paola', 'Tú y Paola', 'directo', ['me', 'paola'], '2026-10-23T10:00:00'),
];

const clean = (o: Record<Id, Cents>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0));
const eq = (amount: Cents, ids: Id[]) => clean(apportion(amount, Object.fromEntries(ids.map(k => [k, 1]))));
type Raw = Pick<Expense, 'id' | 'groupId' | 'description' | 'category' | 'date' | 'amount' | 'payers' | 'shares' | 'createdBy' | 'createdAt'> & Partial<Expense>;
const E = (o: Raw): Expense => ({ currency: 'DOP', fxRate: 1, isPayment: false, paymentStatus: null, splitMode: 'equal', splitParams: {},
  items: null, tax: 0, tip: 0, note: null, repeat: null, deletedAt: null, ...o });

const dinner: Item[] = [
  { name: 'Pescado frito con tostones', price: 145000, to: ['me', 'paola'] },
  { name: 'Langosta a la plancha', price: 230000, to: ['laura'] },
  { name: 'Camarones al coco', price: 168000, to: ['miguel', 'andres'] },
  { name: 'Arroz con coco ×2', price: 90000, to: ALL5 },
  { name: 'Presidente grande ×6', price: 150000, to: ['me', 'miguel', 'andres'] },
  { name: 'Jugo de chinola ×2', price: 60000, to: ['laura', 'paola'] },
];
const d = itemSplit(dinner, 18, 10);
const usdShares = eq(64000, ALL5);

let expenses: Expense[] = [
  E({ id: 'e1', groupId: 'samana', description: 'Villa en Las Terrenas', category: 'hospedaje', date: '2026-10-30', currency: 'USD', fxRate: 63.1, amount: 64000,
    payers: { laura: 64000 }, shares: usdShares, splitParams: { on: ALL5 }, createdBy: 'laura', createdAt: '2026-10-28T10:42:00', note: 'Dos noches, tres habitaciones.' }),
  E({ id: 'e2', groupId: 'samana', description: 'Gasolina ida y vuelta', category: 'gasolina', date: '2026-10-30', amount: 680000, payers: { me: 680000 },
    shares: eq(680000, ['me', 'miguel', 'paola', 'andres']), createdBy: 'me', createdAt: '2026-10-30T08:15:00', note: 'Laura se fue en guagua.' }),
  E({ id: 'e3', groupId: 'samana', description: 'Colmado y hielo', category: 'super', date: '2026-10-30', amount: 427500, payers: { paola: 427500 },
    shares: eq(427500, ALL5), createdBy: 'paola', createdAt: '2026-10-30T17:20:00' }),
  E({ id: 'e4', groupId: 'samana', description: 'Cena en la playa', category: 'comida', date: '2026-10-31', amount: d.total, payers: { miguel: d.total },
    shares: clean(d.shares), splitMode: 'items', items: dinner, tax: 18, tip: 10, createdBy: 'miguel', createdAt: '2026-10-31T22:05:00' }),
  E({ id: 'e5', groupId: 'samana', description: 'Excursión a Los Haitises', category: 'paseo', date: '2026-10-31', amount: 1250000, payers: { andres: 1250000 },
    shares: clean(split('shares', 1250000, ALL5, { vals: { me: 1, laura: 1, miguel: 1, paola: 1, andres: 2 } }).shares), splitMode: 'shares',
    splitParams: { vals: { me: 1, laura: 1, miguel: 1, paola: 1, andres: 2 } }, createdBy: 'andres', createdAt: '2026-10-31T19:40:00', note: 'Andrés cubrió también a su primo Luis.' }),
  E({ id: 'e6', groupId: 'samana', description: 'Pago', category: 'pago', date: '2026-11-01', amount: 500000, payers: { miguel: 500000 }, shares: { laura: 500000 },
    isPayment: true, paymentStatus: 'confirmado', splitMode: 'payment', createdBy: 'miguel', createdAt: '2026-11-01T16:30:00' }),
  E({ id: 'n1', groupId: 'naco', description: 'Alquiler de octubre', category: 'alquiler', date: '2026-10-01', amount: 4500000, payers: { me: 4500000 },
    shares: { me: 1800000, laura: 1350000, miguel: 1350000 }, splitMode: 'percent', splitParams: { vals: { me: 40, laura: 30, miguel: 30 } },
    createdBy: 'me', createdAt: '2026-10-01T08:00:00', note: 'Tú tienes la habitación con baño.' }),
  E({ id: 'n2', groupId: 'naco', description: 'Pago', category: 'pago', date: '2026-10-15', amount: 1000000, payers: { laura: 1000000 }, shares: { me: 1000000 },
    isPayment: true, paymentStatus: 'confirmado', splitMode: 'payment', createdBy: 'laura', createdAt: '2026-10-15T12:10:00' }),
  E({ id: 'n3', groupId: 'naco', description: 'Luz Edeeste de octubre', category: 'luz', date: '2026-10-20', amount: 342000, payers: { laura: 342000 },
    shares: eq(342000, ['me', 'laura', 'miguel']), createdBy: 'laura', createdAt: '2026-10-20T18:44:00' }),
  E({ id: 'n4', groupId: 'naco', description: 'Internet Claro', category: 'internet', date: '2026-10-22', amount: 269000, payers: { miguel: 269000 },
    shares: eq(269000, ['me', 'laura', 'miguel']), createdBy: 'miguel', createdAt: '2026-10-22T07:30:00' }),
  E({ id: 'n5', groupId: 'naco', description: 'Compra en Sirena', category: 'super', date: '2026-10-26', amount: 784550, payers: { me: 500000, laura: 284550 },
    shares: eq(784550, ['me', 'laura', 'miguel']), createdBy: 'me', createdAt: '2026-10-26T13:05:00' }),
  E({ id: 's1', groupId: 'd-paola', description: 'Almuerzo del viernes', category: 'comida', date: '2026-10-23', amount: 196000, payers: { paola: 196000 },
    shares: eq(196000, ['me', 'paola']), createdBy: 'paola', createdAt: '2026-10-23T13:30:00' }),
];
let comments: Comment[] = [{ id: 'c1', expenseId: 'e4', profileId: 'laura', body: 'La langosta valió cada peso.', createdAt: '2026-11-01T09:12:00' }];

let actSeq = 0;
const A = (groupId: Id, actor: Id, verb: Verb, expenseId: Id | null, createdAt: string, payload: Record<string, unknown> = {}): Activity =>
  ({ id: String(++actSeq), groupId, actor, verb, expenseId, payload, createdAt });
let activity: Activity[] = [
  ...expenses.map(e => A(e.groupId, e.createdBy, e.isPayment ? 'pago_registrado' : 'gasto_creado', e.id, e.createdAt,
    { descripcion: e.description, monto: e.amount, moneda: e.currency })),
  ...comments.map(c => A('samana', c.profileId, 'comentario', c.expenseId, c.createdAt, { texto: c.body })),
];
const now = () => new Date().toISOString();
const log = (groupId: Id, verb: Verb, expenseId: Id | null = null, payload: Record<string, unknown> = {}) =>
  activity.push(A(groupId, 'me', verb, expenseId, now(), payload));
const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const createDemoBackend = (onExit: () => void): Backend => ({
  async load(): Promise<Snapshot> {
    return { me: 'me', profiles: { ...profiles }, groups: groups.map(g => ({ ...g })), expenses: [...expenses], comments: [...comments],
      activity: [...activity].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), legalOk: true };
  },
  subscribe: () => () => {},
  async saveExpense(i) {
    const id = i.id ?? uid('x');
    const prev = expenses.find(e => e.id === id);
    const e: Expense = { ...i, id, items: i.items, deletedAt: null, createdBy: prev?.createdBy ?? 'me', createdAt: prev?.createdAt ?? now(),
      paymentStatus: i.isPayment ? (i.shares.me ? 'confirmado' : 'pendiente') : null };
    expenses = prev ? expenses.map(x => x.id === id ? e : x) : [...expenses, e];
    log(i.groupId, prev ? 'gasto_editado' : i.isPayment ? 'pago_registrado' : 'gasto_creado', id, { descripcion: i.description, monto: i.amount, moneda: i.currency });
    return id;
  },
  async deleteExpense(id) {
    expenses = expenses.map(e => e.id === id ? { ...e, deletedAt: now() } : e);
    log(expenses.find(e => e.id === id)!.groupId, 'gasto_borrado', id);
  },
  async restoreExpense(id) {
    expenses = expenses.map(e => e.id === id ? { ...e, deletedAt: null } : e);
    log(expenses.find(e => e.id === id)!.groupId, 'gasto_restaurado', id);
  },
  async confirmPayment(id) {
    expenses = expenses.map(e => e.id === id ? { ...e, paymentStatus: 'confirmado' } : e);
    log(expenses.find(e => e.id === id)!.groupId, 'pago_confirmado', id);
  },
  async addComment(expenseId, body) {
    comments = [...comments, { id: uid('c'), expenseId, profileId: 'me', body, createdAt: now() }];
    log(expenses.find(e => e.id === expenseId)!.groupId, 'comentario', expenseId, { texto: body });
  },
  async createGroup(name, kind) {
    const g = G(uid('g'), name, kind, ['me'], now());
    groups = [...groups, g];
    log(g.id, 'grupo_creado');
    return g.id;
  },
  async addPlaceholder(groupId, name) {
    const p: Profile = { id: uid('p'), userId: null, name, email: null, payout: null, username: null, deletedAt: null };
    profiles = { ...profiles, [p.id]: p };
    groups = groups.map(g => g.id === groupId ? { ...g, members: [...g.members, p.id], roles: { ...g.roles, [p.id]: 'miembro' } } : g);
    log(groupId, 'miembro_agregado', null, { nombre: name });
    return p.id;
  },
  async addMember(groupId, profileId) {
    groups = groups.map(g => g.id === groupId && !g.members.includes(profileId) ? { ...g, members: [...g.members, profileId], roles: { ...g.roles, [profileId]: 'miembro' } } : g);
    log(groupId, 'miembro_agregado', null, { nombre: profiles[profileId].name });
  },
  async directGroup(other) {
    const found = groups.find(g => g.kind === 'directo' && g.members.includes('me') && g.members.includes(other));
    if (found) return found.id;
    const g = G(uid('d'), `Tú y ${profiles[other].name}`, 'directo', ['me', other], now());
    groups = [...groups, g];
    return g.id;
  },
  async invitePreview(token) {
    const g = groups.find(x => x.inviteToken === token);
    return g ? { id: g.id, name: g.name, kind: g.kind, members: g.members.length,
      placeholders: g.members.filter(m => !profiles[m].userId).map(m => ({ id: m, name: profiles[m].name })) } : null;
  },
  async joinGroup(token) {
    const g = groups.find(x => x.inviteToken === token);
    if (!g) throw new Error('La invitación no es válida o expiró');
    return g.id;
  },
  async updateProfile(p) { profiles = { ...profiles, me: { ...profiles.me, name: p.name, payout: p.payout || null, username: p.username || null } }; },
  async acceptLegal() {},
  async deleteAccount() { onExit(); }, // en la demostración, borrar es volver a empezar
  async signOut() { onExit(); },
});

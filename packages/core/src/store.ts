import { isRetry } from './errors';
import { newId, overlay } from './queue';
import type { Id } from './domain';
import type { Backend, Op, OpBody, Server, Snapshot } from './types';
import { tr } from './i18n';

// Una sola fuente de verdad: la foto de los datos. Es lo último que dio la base más los cambios que esperan en la cola,
// aplicados encima. Así lo que anotas se ve al instante, con o sin señal, y se envía solo cuando hay conexión.
// La última foto y la cola se guardan en el teléfono: la app abre al instante y funciona sin internet.
// Sin React: cada app lo conecta con useSyncExternalStore (onSnap + getSnap, onSync + getSync, onBusy + isBusy).

/** Dónde guardar en el teléfono: localStorage en la web, AsyncStorage en la nativa. */
export interface KV {
  getItem(k: string): string | null | Promise<string | null>;
  setItem(k: string, v: string): void | Promise<void>;
  removeItem(k: string): void | Promise<void>;
}
export interface StartOptions {
  storage?: KV;
  /** De quién son la foto y la cola (el id de la cuenta): otra cuenta en el mismo teléfono no las ve ni las envía. */
  key?: string;
}
export interface SyncState {
  offline: boolean;  // la última vez que se habló con la base no hubo respuesta
  sending: boolean;
  pending: number;   // cambios por enviar
  failed: Op[];      // cambios que la base rechazó
}

const CACHE_V = 1;           // si cambia la forma de la foto guardada, se ignora la vieja
const ACK_WAIT = 8000;       // cuánto espera la pantalla a que la base confirme antes de seguir sin conexión
const RETRY_MAX = 5 * 60_000;

let server: Server | null = null;
let kv: KV | null = null, key = '';
let base: Snapshot | null = null;   // lo último que dio la base
let snap: Snapshot | null = null;   // lo que se ve
let queue: Op[] = [];
let offline = false, sending = false;
let gen = 0;                        // cada sesión nueva invalida lo que quedó en camino de la anterior
let seq = 0;                        // orden de los sucesos, para saber qué cambios ya trae una foto
const doneAt = new Map<Id, number>();
let unsub: (() => void) | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined, retryDelay = 0;
let sync_: SyncState = { offline: false, sending: false, pending: 0, failed: [] };

const listeners = new Set<() => void>(), syncListeners = new Set<() => void>();
export const getSnap = () => snap;
export function onSnap(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export const getSync = () => sync_;
export function onSync(f: () => void) { syncListeners.add(f); return () => { syncListeners.delete(f); }; }

function publish() {
  snap = base && overlay(base, queue);
  sync_ = { offline, sending, pending: queue.filter(o => !o.done && !o.error).length, failed: queue.filter(o => o.error) };
  listeners.forEach(f => f());
  syncListeners.forEach(f => f());
}

// ── guardado en el teléfono ──────────────────────────────────
const K = { snap: () => `saldao:foto:${key}`, queue: () => `saldao:cola:${key}` };
async function read<T>(k: string): Promise<T | null> {
  if (!kv) return null;
  try { const v = await kv.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
async function write(k: string, v: unknown) {
  if (!kv) return;
  try { await kv.setItem(k, JSON.stringify(v)); } catch { /* lleno o sin almacenamiento: sigue en memoria */ }
}
const saveQueue = () => write(K.queue(), queue);
/**
 * Al salir o borrar la cuenta, la foto y la cola de esta cuenta se van del teléfono. Se prepara antes de la acción
 * (que cierra la sesión y para el almacén) y se ejecuta después, solo si la acción salió bien.
 */
function forgetter() {
  const store = kv, ks = [K.snap(), K.queue()];
  return async () => {
    if (!store) return;
    try { for (const k of ks) await store.removeItem(k); } catch { /* sin almacenamiento */ }
  };
}

// ── arrancar y parar ─────────────────────────────────────────
export async function start(s: Server, o: StartOptions = {}) {
  stop();
  const g = gen;
  server = s; kv = o.storage && o.key ? o.storage : null; key = o.key ?? '';
  const cached = await read<{ v: number; snap: Snapshot }>(K.snap());
  queue = (await read<Op[]>(K.queue())) ?? [];
  if (g !== gen) return;
  if (cached?.v === CACHE_V) base = cached.snap;
  let t: ReturnType<typeof setTimeout> | undefined;
  unsub = s.subscribe(() => { clearTimeout(t); t = setTimeout(() => { refresh().catch(() => {}); }, 250); });
  // Con algo guardado, la app abre al instante y la base se pide detrás; la primera vez hay que esperarla.
  if (base) { publish(); void sync().then(() => catchUp(g)); return; }
  await refresh(true);
  void flush();
  void catchUp(g);
}

/** Los gastos que se repiten (el alquiler, la luz): al abrir la app se crean los que ya tocaban. */
async function catchUp(g: number) {
  if (!server || g !== gen || offline) return;
  const made = await server.catchUpRecurring().catch(() => 0);
  if (made > 0 && g === gen) await refresh().catch(() => {});
}
export function stop() {
  gen++;
  unsub?.(); unsub = null;
  clearTimeout(retryTimer); retryTimer = undefined; retryDelay = 0;
  server = null; kv = null; key = ''; base = null; queue = []; offline = false; sending = false; doneAt.clear();
  publish();
}

// ── traer la foto ────────────────────────────────────────────
/** Pide la foto a la base. Sin conexión no falla (si hay algo guardado): se queda con lo último y reintenta luego. */
export async function refresh(strict = false) {
  if (!server) return;
  const g = gen, started = ++seq, wasOffline = offline;
  try {
    const s = await server.load();
    if (g !== gen) return;
    base = s; offline = false; retryDelay = 0;
    // los cambios que la base confirmó antes de pedir esta foto ya vienen en ella
    queue = queue.filter(o => !(o.done && (doneAt.get(o.id) ?? -1) < started));
    void write(K.snap(), { v: CACHE_V, at: new Date().toISOString(), snap: s });
    void saveQueue();
    publish();
    if (wasOffline && sync_.pending) void sync(); // volvió la conexión: lo pendiente sale ya
  } catch (e) {
    if (g !== gen) return;
    if (isRetry(e) && (base || !strict)) { offline = true; publish(); schedule(); return; }
    throw e;
  }
}

/** Envía lo pendiente y trae la foto. La web lo llama al volver la conexión o al volver a la app. */
export async function sync() {
  if (!server) return;
  await flush();
  await refresh().catch(() => { /* se reintenta solo */ });
}

function schedule() {
  if (retryTimer || !server) return;
  retryDelay = Math.min(retryDelay ? retryDelay * 2 : 5000, RETRY_MAX);
  retryTimer = setTimeout(() => { retryTimer = undefined; void sync(); }, retryDelay);
}

// ── enviar la cola ───────────────────────────────────────────
let flushing: Promise<void> | null = null;
function flush(): Promise<void> {
  if (!flushing) flushing = sendQueue().finally(() => { flushing = null; });
  return flushing;
}
const next = () => queue.find(o => !o.done && !o.error);
async function sendQueue() {
  const s = server, g = gen;
  if (!s || !queue.some(o => !o.done && !o.error)) return;
  sending = true; publish();
  try {
    // En orden: borrar un gasto anotado sin señal tiene que llegar después de crearlo. Se busca cada vez el siguiente
    // pendiente porque la cola puede cambiar mientras tanto (se anota algo nuevo, llega una foto).
    for (let op = next(); op; op = next()) {
      try {
        await s.applyOp(op);
        if (g !== gen) return;
        op.done = true; doneAt.set(op.id, ++seq); offline = false;
      } catch (e) {
        if (g !== gen) return;
        if (isRetry(e)) { offline = true; schedule(); break; }
        op.error = e instanceof Error ? e.message : 'No se pudo guardar';
      }
      void saveQueue(); publish();
    }
  } finally {
    if (g === gen) { sending = false; publish(); }
  }
}

/** Lo que la base rechazó en segundo plano: la persona lo ve y lo descarta. */
export function discard(opId: Id) {
  queue = queue.filter(o => o.id !== opId);
  void saveQueue(); publish();
}

// ── lo que usan las pantallas ────────────────────────────────
interface Ctx { deferred: boolean }
const nameOf = (id: Id) => snap?.expenses.find(e => e.id === id)?.description ?? tr("un gasto");

async function enqueue(body: OpBody, label: string, ctx: Ctx) {
  const op = { ...body, id: newId(), at: new Date().toISOString(), label } as Op;
  queue = [...queue, op];
  void saveQueue(); publish();
  // Con conexión se espera la respuesta: si la base dice que no, la pantalla lo muestra como siempre.
  // Sin conexión (o muy lenta) se sigue: el cambio ya se ve y sale solo después.
  let t: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([flush(), new Promise<void>(r => { t = setTimeout(r, ACK_WAIT); })]);
  clearTimeout(t);
  if (op.error) { discard(op.id); throw new Error(op.error); }
  if (!op.done) ctx.deferred = true;
}

function actions(ctx: Ctx): Backend {
  const s = server!;
  return {
    async saveExpense(e) {
      const id = e.id ?? newId();
      await enqueue({ kind: 'save_expense', input: { ...e, id }, create: !e.id }, e.id ? tr("Cambios en «{0}»", e.description) : `«${e.description}»`, ctx);
      return id;
    },
    deleteExpense: id => enqueue({ kind: 'delete_expense', expenseId: id }, tr("Borrar «{0}»", nameOf(id)), ctx),
    restoreExpense: id => enqueue({ kind: 'restore_expense', expenseId: id }, tr("Restaurar «{0}»", nameOf(id)), ctx),
    confirmPayment: id => enqueue({ kind: 'confirm_payment', expenseId: id }, tr("Confirmar un pago"), ctx),
    addComment: (expenseId, body) => enqueue({ kind: 'add_comment', commentId: newId(), expenseId, body }, tr("Comentario en «{0}»", nameOf(expenseId)), ctx),
    createGroup: (name, kind) => s.createGroup(name, kind),
    addPlaceholder: (groupId, name) => s.addPlaceholder(groupId, name),
    addMember: (groupId, profileId) => s.addMember(groupId, profileId),
    directGroup: other => s.directGroup(other),
    invitePreview: token => s.invitePreview(token),
    joinGroup: (token, as) => s.joinGroup(token, as),
    updateProfile: p => s.updateProfile(p),
    acceptLegal: () => s.acceptLegal(),
    async deleteAccount(confirm) { const forget = forgetter(); await s.deleteAccount(confirm); await forget(); },
    async signOut() { const forget = forgetter(); await s.signOut(); await forget(); },
    // lo demás necesita internet: va directo a la base
    updateGroup: (g, p) => s.updateGroup(g, p),
    setMemberRole: (g, p, r) => s.setMemberRole(g, p, r),
    removeMember: (g, p) => s.removeMember(g, p),
    renamePlaceholder: (g, p, n) => s.renamePlaceholder(g, p, n),
    leaveGroup: g => s.leaveGroup(g),
    createFund: g => s.createFund(g),
    catchUpRecurring: () => s.catchUpRecurring(),
    addItem: (g, n) => s.addItem(g, n),
    toggleItem: id => s.toggleItem(id),
    deleteItem: id => s.deleteItem(id),
    uploadPhoto: (path, f) => s.uploadPhoto(path, f),
    photoUrl: path => s.photoUrl(path),
    setExpensePhoto: (id, path) => s.setExpensePhoto(id, path),
    savePushToken: (k, t) => s.savePushToken(k, t),
    deletePushToken: t => s.deletePushToken(t),
    scanReceipt: (img, mime) => s.scanReceipt(img, mime),
  };
}

// Cuántas acciones van en camino: mientras haya alguna, la app muestra que está guardando.
let busy = 0;
const busyListeners = new Set<() => void>();
const setBusy = (d: number) => { busy += d; busyListeners.forEach(f => f()); };
export const isBusy = () => busy > 0;
export function onBusy(f: () => void) { busyListeners.add(f); return () => { busyListeners.delete(f); }; }

/** Ejecuta una acción y trae la foto nueva (si la acción quedó esperando conexión, se ve igual con la cola encima). */
export async function run<T>(fn: (b: Backend) => Promise<T>): Promise<T> {
  if (!server) throw new Error(tr("La app no está conectada"));
  const ctx: Ctx = { deferred: false };
  setBusy(1);
  try {
    const r = await fn(actions(ctx));
    if (ctx.deferred) publish(); else await refresh();
    return r;
  } finally { setBusy(-1); }
}
/** Para lo que no recarga la foto (ver una invitación, borrar la cuenta). */
export const getBackend = (): Backend | null => (server ? actions({ deferred: false }) : null);

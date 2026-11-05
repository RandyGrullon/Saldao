import type { Backend, Snapshot } from './types';

// Una sola fuente de verdad: la foto que devuelve el backend. Cada acción escribe y vuelve a cargar;
// los cambios de otras personas llegan por tiempo real y también recargan.
// Sin React: cada app lo conecta con useSyncExternalStore (onSnap + getSnap, onBusy + isBusy).
let backend: Backend | null = null;
let snap: Snapshot | null = null;
let unsub: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

export async function start(b: Backend) {
  backend = b;
  await reload();
  unsub?.();
  let t: ReturnType<typeof setTimeout> | undefined;
  unsub = b.subscribe(() => { clearTimeout(t); t = setTimeout(reload, 250); });
}
export function stop() { unsub?.(); unsub = null; backend = null; snap = null; emit(); }
export async function reload() { if (backend) { snap = await backend.load(); emit(); } }

export const getSnap = () => snap;
export function onSnap(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

// Cuántas acciones van en camino: mientras haya alguna, la app muestra que está guardando.
let busy = 0;
const busyListeners = new Set<() => void>();
const setBusy = (d: number) => { busy += d; busyListeners.forEach(f => f()); };
export const isBusy = () => busy > 0;
export function onBusy(f: () => void) { busyListeners.add(f); return () => { busyListeners.delete(f); }; }

/** Ejecuta una acción del backend y recarga la foto. */
export async function run<T>(fn: (b: Backend) => Promise<T>): Promise<T> {
  if (!backend) throw new Error('La app no está conectada');
  setBusy(1);
  try {
    const r = await fn(backend);
    await reload();
    return r;
  } finally { setBusy(-1); }
}
export const getBackend = () => backend;

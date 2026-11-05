import { useSyncExternalStore } from 'react';
import type { Backend, Snapshot } from './types';

// Una sola fuente de verdad: la foto que devuelve el backend. Cada acción escribe y vuelve a cargar;
// los cambios de otras personas llegan por tiempo real y también recargan.
let backend: Backend | null = null;
let snap: Snapshot | null = null;
let unsub: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

export async function start(b: Backend) {
  backend = b;
  await reload();
  unsub?.();
  let t: number | undefined;
  unsub = b.subscribe(() => { clearTimeout(t); t = window.setTimeout(reload, 250); });
}
export function stop() { unsub?.(); unsub = null; backend = null; snap = null; emit(); }
export async function reload() { if (backend) { snap = await backend.load(); emit(); } }

export function useSnap(): Snapshot | null {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => snap);
}
// Cuántas acciones van en camino: mientras haya alguna, arriba se ve la barra fina de carga.
let busy = 0;
const busyListeners = new Set<() => void>();
const setBusy = (d: number) => { busy += d; busyListeners.forEach(f => f()); };
export function useBusy(): boolean {
  return useSyncExternalStore(f => { busyListeners.add(f); return () => busyListeners.delete(f); }, () => busy > 0);
}

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

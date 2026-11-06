// La web conecta el núcleo con Supabase y con el teléfono: sus variables de Vite, el origen de la página para los
// enlaces de los correos, dónde guardar la última foto y la cola, y cuándo reintentar lo pendiente.
import { sync, type KV } from '@saldao/core';
import { initSupabase } from '@saldao/core/supabase';

const url = import.meta.env.VITE_SUPABASE_URL, anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
/** Marca para que la pantalla de entrar diga que la cuenta se borró. */
export const DELETED = 'saldao:cuenta-borrada';
export const isConfigured = () => !!(url && anonKey);

if (url && anonKey) initSupabase({
  url, anonKey, redirectTo: location.origin, detectSessionInUrl: true,
  onAccountDeleted: () => { try { sessionStorage.setItem(DELETED, '1'); } catch { /* sin almacenamiento: no sale el aviso */ } },
});

/** localStorage, sin romperse si el navegador no lo deja usar (el núcleo sigue en memoria). */
export const storage: KV = {
  getItem: k => { try { return localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: k => localStorage.removeItem(k),
};

// Lo pendiente sale en cuanto vuelve la señal o la persona vuelve a la app (y además se reintenta solo, cada vez más espaciado).
addEventListener('online', () => { void sync(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void sync(); });

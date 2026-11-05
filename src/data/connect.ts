// La web conecta el núcleo con Supabase: sus variables de Vite, el origen de la página para los enlaces de los correos
// y el aviso de «tu cuenta se borró» para la pantalla de entrar.
import { initSupabase } from '@saldao/core/supabase';

const url = import.meta.env.VITE_SUPABASE_URL, anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
/** Marca para que la pantalla de entrar diga que la cuenta se borró. */
export const DELETED = 'saldao:cuenta-borrada';
export const isConfigured = () => !!(url && anonKey);

if (url && anonKey) initSupabase({
  url, anonKey, redirectTo: location.origin, detectSessionInUrl: true,
  onAccountDeleted: () => { try { sessionStorage.setItem(DELETED, '1'); } catch { /* sin almacenamiento: no sale el aviso */ } },
});

// La app nativa conecta el núcleo con Supabase y con el teléfono: sus variables (EXPO_PUBLIC_…), la sesión en el
// llavero, la última foto y la cola en el almacenamiento de la app, y cuándo reintentar lo pendiente.
import './polyfills';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AppState, Platform } from 'react-native';
import { APP, sync, type KV } from '@saldao/core';
import { initSupabase, sb } from '@saldao/core/supabase';
import { sessionStore } from './session-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL, anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
/** Con EXPO_PUBLIC_DEMO=1 la app corre con los datos de ejemplo en memoria, sin Supabase. */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';
export const isConfigured = () => !!(url && anonKey);

/** «Tu cuenta se borró»: la pantalla de entrar lo dice una vez. */
export const deleted = { now: false };

if (url && anonKey) initSupabase({
  url, anonKey,
  // Los enlaces de los correos (confirmar, recuperar la contraseña) se abren en la web.
  redirectTo: APP.site,
  detectSessionInUrl: false,
  storage: sessionStore,
  onAccountDeleted: () => { deleted.now = true; },
});

export const storage: KV = AsyncStorage;

// Supabase pide renovar la sesión solo con la app al frente. Al volver a la app, además, sale lo pendiente.
if (url && anonKey && Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') { sb().auth.startAutoRefresh(); void sync(); } else sb().auth.stopAutoRefresh();
  });
}
// Volvió la señal: lo pendiente sale ya (además se reintenta solo, cada vez más espaciado).
let was: boolean | null = null;
NetInfo.addEventListener(s => {
  const now = !!s.isConnected;
  if (was === false && now) void sync();
  was = now;
});

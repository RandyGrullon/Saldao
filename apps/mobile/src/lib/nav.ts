// Adónde se va desde cada pantalla. Las hojas (gasto nuevo, saldar, pagar…) son pantallas modales con sus datos en la ruta.
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import type { Id } from '@saldao/core';

const q = (o: Record<string, string | number | undefined>) => {
  const s = Object.entries(o).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  return s ? `?${s}` : '';
};

export const go = {
  group: (id: Id) => router.push(`/grupo/${id}`),
  person: (id: Id) => router.push(`/persona/${id}`),
  expense: (id: Id) => router.push(`/gasto/${id}`),
  addExpense: (o: { groupId?: Id; friendId?: Id; edit?: Id } = {}) => router.push(`/nuevo-gasto${q(o)}`),
  settle: (groupId?: Id) => router.push(`/saldar${q({ groupId })}`),
  pay: (to: Id, amount: number, groupId?: Id) => router.push(`/pagar${q({ to, amount, groupId })}`),
  newGroup: () => router.push('/nuevo-grupo'),
  invite: (groupId: Id) => router.push(`/invitar${q({ groupId })}`),
  join: (token: string) => router.push(`/unirse${q({ token })}`),
  deleteAccount: () => router.push('/borrar-cuenta'),
  failed: () => router.push('/no-guardados'),
  tab: (t: 'index' | 'grupos' | 'actividad' | 'cuenta') => router.navigate(t === 'index' ? '/' : `/${t}`),
  back: () => (router.canGoBack() ? router.back() : router.replace('/')),
};

/** Un toque en el teléfono al confirmar algo. */
export const buzz = () => { if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {}); };

export const errMsg = (e: unknown) => {
  const m = (e as { message?: string })?.message;
  return m && !/fetch|network/i.test(m) ? m : 'No se pudo completar. Revisa tu conexión e intenta de nuevo.';
};

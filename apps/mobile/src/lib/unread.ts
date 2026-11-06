// Lo nuevo en Actividad desde la última vez que la abriste (por cuenta, guardado en el teléfono).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { Snapshot } from '@saldao/core';

let seen = '', me = '';
const ls = new Set<() => void>();
const emit = () => ls.forEach(f => f());
const KEY = (id: string) => `saldao:visto:${id}`;

export async function loadSeen(id: string) {
  if (me === id) return;
  me = id; seen = '';
  try { seen = (await AsyncStorage.getItem(KEY(id))) ?? ''; } catch { /* sin almacenamiento */ }
  emit();
}
export function useUnread(s: Snapshot | null) {
  const sv = useSyncExternalStore(f => { ls.add(f); return () => { ls.delete(f); }; }, () => seen);
  const n = s ? s.activity.filter(a => a.actor !== s.me && a.createdAt > sv).length : 0;
  const markSeen = () => {
    const t = s?.activity[0]?.createdAt;
    if (!t || !s) return;
    seen = t; emit();
    AsyncStorage.setItem(KEY(s.me), t).catch(() => {});
  };
  return { n, seen: sv, markSeen };
}

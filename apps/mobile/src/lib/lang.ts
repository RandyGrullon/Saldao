// El idioma de la app: español, o inglés si se eligió en Cuenta. Al cambiarlo, las pantallas se vuelven a
// dibujar enteras (la raíz cambia de key), así no queda ningún texto en el idioma anterior.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { getLang, LANG_KEY, setLang, type Lang } from '@saldao/core';

const subs = new Set<(l: Lang) => void>();
let loaded: Promise<void> | null = null;
export const loadLang = () => (loaded ??= AsyncStorage.getItem(LANG_KEY).catch(() => null).then(v => setLang(v)));

export async function changeLang(l: Lang) {
  setLang(l);
  await AsyncStorage.setItem(LANG_KEY, l).catch(() => {});
  subs.forEach(f => f(l));
}

/** El idioma actual y si ya se leyó lo guardado. */
export function useLang() {
  const [state, set] = useState<{ lang: Lang; ready: boolean }>({ lang: getLang(), ready: false });
  useEffect(() => {
    loadLang().then(() => set({ lang: getLang(), ready: true }));
    const f = (l: Lang) => set({ lang: l, ready: true });
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return state;
}

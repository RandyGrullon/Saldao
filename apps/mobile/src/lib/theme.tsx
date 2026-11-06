// Estilo «De noche», igual que la web: oscuro de base, lima para lo que te deben y coral para lo que debes, títulos y
// saldos en Unbounded y el resto en Sora. En claro, el lima de relleno se queda y el texto en acento pasa a verde oliva.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';

const dark = {
  bg: '#0e0f13', surface: '#17181e', surface2: '#1f2027', segOn: '#2e2f38',
  fg: '#f4f1ea', fg2: '#d6d3cb', muted: '#8b8d98', faint: '#5d5f6a', line: '#25262e',
  accent: '#c8f169', accentFg: '#0e0f13', accentSoft: '#252e12', accentInk: '#c8f169',
  ok: '#c8f169', okSoft: '#252e12', warn: '#ffc56b', warnSoft: '#382a12',
  danger: '#ff7a59', dangerSoft: '#3a1f19', onDanger: '#0e0f13',
  scrim: 'rgba(0,0,0,0.62)', toastBg: '#f4f1ea', toastInk: '#0e0f13', toastAction: '#4d7c0f',
  av: { s: 42, l: 27, ink: 84 }, isDark: true,
};
export type Colors = typeof dark;
const light: Colors = {
  bg: '#f6f5f0', surface: '#ffffff', surface2: '#efeee8', segOn: '#ffffff',
  fg: '#121318', fg2: '#3b3d45', muted: '#6c6e78', faint: '#a5a7ae', line: '#e5e3db',
  accent: '#c8f169', accentFg: '#121318', accentSoft: '#eaf6cf', accentInk: '#4d7c0f',
  ok: '#3f7a0e', okSoft: '#e8f4d4', warn: '#9a5800', warnSoft: '#fcefd6',
  danger: '#d4462a', dangerSoft: '#fde5de', onDanger: '#ffffff',
  scrim: 'rgba(0,0,0,0.4)', toastBg: '#121318', toastInk: '#f4f1ea', toastAction: '#c8f169',
  av: { s: 70, l: 88, ink: 28 }, isDark: false,
};

/** Las fuentes, una por peso (en Android el peso no elige la variante de una fuente propia). */
export const F = {
  display: 'Unbounded_700Bold', displaySemi: 'Unbounded_600SemiBold',
  regular: 'Sora_400Regular', medium: 'Sora_500Medium', semi: 'Sora_600SemiBold', bold: 'Sora_700Bold',
} as const;
/**
 * Entradas animadas (Reanimated): en el teléfono sí; en el navegador (solo para probar) no, porque allí dejan los bloques
 * con position: absolute y se enciman.
 */
export const ANIM = Platform.OS !== 'web';
export const R = { card: 22, sheet: 28, btn: 16, control: 12, key: 16, toast: 16 } as const;
export const SIZE = { row: 64, btn: 56, key: 58, touch: 44, tabbar: 68, gut: 16 } as const;

export type ThemeMode = 'dark' | 'light' | 'auto';
const KEY = 'saldao:tema';
interface Ctx { c: Colors; mode: ThemeMode; setMode: (m: ThemeMode) => void; ready: boolean }
const ThemeCtx = createContext<Ctx>({ c: dark, mode: 'dark', setMode: () => {}, ready: false });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(m => { if (m === 'light' || m === 'auto') setModeState(m); }, () => {}).finally(() => setReady(true));
  }, []);
  const value = useMemo<Ctx>(() => ({
    c: mode === 'light' || (mode === 'auto' && system === 'light') ? light : dark,
    mode, ready,
    setMode: m => { setModeState(m); AsyncStorage.setItem(KEY, m).catch(() => {}); },
  }), [mode, system, ready]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
export const useC = () => useContext(ThemeCtx).c;

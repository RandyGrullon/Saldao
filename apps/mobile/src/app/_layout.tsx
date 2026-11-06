import '../lib/connect';
import '../lib/invite';
// Solo los pesos que se usan (el paquete completo trae nueve de cada una).
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { Unbounded_600SemiBold } from '@expo-google-fonts/unbounded/600SemiBold';
import { Unbounded_700Bold } from '@expo-google-fonts/unbounded/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { start, stop } from '@saldao/core';
import { sb, supabaseBackend } from '@saldao/core/supabase';
import { DEMO, isConfigured, storage } from '../lib/connect';
import { pendingInvite } from '../lib/invite';
import { errMsg, go } from '../lib/nav';
import { PhaseCtx, type Phase } from '../lib/phase';
import { useSnap } from '../lib/store';
import { ThemeProvider, useTheme } from '../lib/theme';
import { loadSeen } from '../lib/unread';
import { ToastProvider } from '../ui/toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Root() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function App() {
  const { c, ready: themeReady } = useTheme();
  const [fonts] = useFonts({ Unbounded_600SemiBold, Unbounded_700Bold, Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold });
  const [phase, setPhase] = useState<Phase>('boot');
  const [err, setErr] = useState('');
  const user = useRef<string | null | undefined>(undefined);
  const snap = useSnap();

  const boot = useCallback(async (uid: string | null) => {
    if (uid === user.current) return;
    user.current = uid;
    if (!uid) { stop(); setPhase('login'); return; }
    setPhase('loading');
    try { await start(supabaseBackend, { storage, key: uid }); setPhase('ready'); } catch (e) { setErr(errMsg(e)); setPhase('error'); }
  }, []);

  useEffect(() => {
    if (DEMO) { import('@saldao/core/demo').then(m => start(m.createDemoBackend(() => {}))).then(() => setPhase('ready')); return; }
    if (!isConfigured()) { setPhase('setup'); return; }
    // supabase-js recomienda no llamar a Supabase dentro del aviso de sesión: se difiere un momento.
    const { data } = sb().auth.onAuthStateChange((_ev, session) => { setTimeout(() => boot(session?.user.id ?? null), 0); });
    return () => data.subscription.unsubscribe();
  }, [boot]);

  const retry = useCallback(() => { const uid = user.current ?? null; user.current = undefined; boot(uid); }, [boot]);
  const ctx = useMemo(() => ({ phase, err, retry }), [phase, err, retry]);

  useEffect(() => { if (fonts && themeReady && phase !== 'boot') SplashScreen.hideAsync().catch(() => {}); }, [fonts, themeReady, phase]);
  useEffect(() => { if (Platform.OS !== 'web') SystemUI.setBackgroundColorAsync(c.bg).catch(() => {}); }, [c.bg]);
  // al entrar: lo nuevo en Actividad y, si llegaste con un enlace de invitación, la invitación
  const me = phase === 'ready' ? snap?.me : undefined;
  useEffect(() => {
    if (!me) return;
    loadSeen(me);
    const t = setTimeout(() => { pendingInvite().then(tk => { if (tk) go.join(tk); }); }, 600);
    return () => clearTimeout(t);
  }, [me]);

  if (!fonts || !themeReady || phase === 'boot') return null;
  const ready = phase === 'ready' && !!snap;
  const legal = ready && !snap!.legalOk;
  const modal = { presentation: 'modal', animation: Platform.OS === 'android' ? 'slide_from_bottom' : undefined } as const;
  return (
    <PhaseCtx.Provider value={ctx}>
      <StatusBar style={c.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
        <Stack.Protected guard={phase === 'login'}><Stack.Screen name="entrar" options={{ animation: 'fade' }} /></Stack.Protected>
        <Stack.Protected guard={phase === 'loading'}><Stack.Screen name="cargando" options={{ animation: 'fade' }} /></Stack.Protected>
        <Stack.Protected guard={phase === 'setup' || phase === 'error'}><Stack.Screen name="aviso" options={{ animation: 'fade' }} /></Stack.Protected>
        <Stack.Protected guard={legal}><Stack.Screen name="antes-de-seguir" options={{ animation: 'fade' }} /></Stack.Protected>
        <Stack.Protected guard={ready && !legal}>
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="grupo/[id]" />
          <Stack.Screen name="persona/[id]" />
          <Stack.Screen name="gasto/[id]" />
          <Stack.Screen name="nuevo-gasto" options={modal} />
          <Stack.Screen name="saldar" options={modal} />
          <Stack.Screen name="pagar" options={modal} />
          <Stack.Screen name="nuevo-grupo" options={modal} />
          <Stack.Screen name="invitar" options={modal} />
          <Stack.Screen name="unirse" options={modal} />
          <Stack.Screen name="borrar-cuenta" options={modal} />
          <Stack.Screen name="no-guardados" options={modal} />
        </Stack.Protected>
      </Stack>
    </PhaseCtx.Provider>
  );
}

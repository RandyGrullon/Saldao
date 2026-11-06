// Barra de abajo: ícono y nombre siempre; la elegida lleva una pastilla en acento suave detrás del ícono. Encima, el
// aviso de conexión (sin señal, por enviar o lo que la base no aceptó).
import type { Tabs } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { plural } from '@saldao/core';
import { buzz, go } from '../lib/nav';
import { useS, useSync } from '../lib/store';
import { ANIM, SIZE, useC } from '../lib/theme';
import { useUnread } from '../lib/unread';
import { Icon, type IconName } from './icons';
import { Txt } from './text';
import { tr } from '@saldao/core';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
const TABS: Record<string, [IconName, string]> = { index: ['home', 'Inicio'], grupos: ['users', 'Grupos'], actividad: ['bell', 'Actividad'], cuenta: ['user', 'Cuenta'] };

export function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const c = useC(), insets = useSafeAreaInsets(), unread = useUnread(useS());
  return (
    <View style={t.wrap} pointerEvents="box-none">
      <SyncPill />
      <View style={[t.bar, { backgroundColor: c.isDark ? 'rgba(23,24,30,0.96)' : 'rgba(255,255,255,0.96)', borderTopColor: c.line, paddingBottom: Math.max(8, insets.bottom - 6) }]}>
        {state.routes.map((r, i) => {
          const [icon, es] = TABS[r.name] ?? ['home', r.name], label = tr(es);
          const on = state.index === i;
          return (
            <Pressable key={r.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label}
              onPress={() => { if (!on) { buzz(); navigateToTab(r.key); } }} style={t.tab}>
              {({ pressed }) => <>
                <View style={[t.pip, on && { backgroundColor: c.accentSoft }, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                  <Icon n={icon} size={22} weight={on ? 2.2 : 2} color={on ? c.accentInk : c.muted} />
                </View>
                <Txt f="semi" s={12} lh={15} color={on ? c.fg : c.muted}>{label}</Txt>
                {r.name === 'actividad' && unread.n > 0 && (
                  <View style={[t.badge, { backgroundColor: c.danger, borderColor: c.surface }]} accessibilityLabel={tr("{0} sin leer", unread.n)}>
                    <Txt f="bold" s={10} lh={14} color={c.onDanger}>{unread.n > 99 ? '99+' : unread.n}</Txt>
                  </View>
                )}
              </>}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Con conexión, un guardado normal no la muestra (solo si tarda más de un segundo y medio). */
function SyncPill() {
  const st = useSync(), c = useC();
  const urgent = st.offline || st.failed.length > 0, want = urgent || st.pending > 0;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!want) { setShow(false); return; }
    const h = setTimeout(() => setShow(true), urgent ? 0 : 1500);
    return () => clearTimeout(h);
  }, [want, urgent]);
  if (!show) return null;
  const changes = plural(st.pending, tr("cambio"), tr("cambios"));
  const bad = st.failed.length > 0;
  const text = bad ? (st.failed.length === 1 ? tr("Un cambio no se guardó") : tr("{0} cambios no se guardaron", st.failed.length))
    : st.offline ? (st.pending ? tr("Sin conexión · {0} por enviar", changes) : tr("Sin conexión · ves lo último guardado")) : tr("Enviando {0}…", changes);
  const fg = bad ? c.danger : c.fg2, dot = bad ? c.danger : st.offline ? c.warn : c.accentInk;
  return (
    <Animated.View entering={ANIM ? FadeInDown.duration(260) : undefined} style={t.pillWrap} pointerEvents="box-none">
      <Pressable disabled={!bad} onPress={go.failed} accessibilityRole={bad ? 'button' : 'text'} accessibilityLiveRegion="polite"
        style={[t.pill, { backgroundColor: bad ? c.dangerSoft : c.surface2 }]}>
        <View style={[t.dot, { backgroundColor: dot }]} />
        <Txt f="semi" s={13} color={fg} lines={1} style={{ flexShrink: 1 }}>{text}</Txt>
        {bad && <Txt f="bold" s={13} color={fg}>{tr("Ver")}</Txt>}
      </Pressable>
    </Animated.View>
  );
}

const t = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { flexDirection: 'row', minHeight: SIZE.tabbar, paddingTop: 8, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth * 2,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(18px)' } as object : null) },
  tab: { flex: 1, alignItems: 'center', gap: 4, minHeight: 52 },
  pip: { width: 60, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, left: '50%', marginLeft: 6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pillWrap: { alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34, maxWidth: '100%', paddingHorizontal: 14, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});

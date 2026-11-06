// Avisos abajo, encima de las pestañas, con «Deshacer» cuando se puede. Uno a la vez; el nuevo reemplaza al anterior.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANIM, F, R, SIZE, useC } from '../lib/theme';
import { Txt } from './text';

type Toast = { key: number; text: string; undo?: () => void };
const Ctx = createContext<(text: string, undo?: () => void) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast | null>(null);
  const seq = useRef(0);
  const show = useCallback((text: string, undo?: () => void) => setT({ key: ++seq.current, text, undo }), []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(x => (x?.key === t.key ? null : x)), t.undo ? 6000 : 3200);
    return () => clearTimeout(h);
  }, [t]);
  return (
    <Ctx.Provider value={show}>
      {children}
      <ToastHost t={t} onDone={() => setT(null)} />
    </Ctx.Provider>
  );
}

function ToastHost({ t, onDone }: { t: Toast | null; onDone: () => void }) {
  const c = useC(), insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[s.host, { bottom: SIZE.tabbar + insets.bottom + 56 }]}>
      {t && (
        <Animated.View key={t.key} entering={ANIM ? FadeInDown.duration(320) : undefined} exiting={ANIM ? FadeOutDown.duration(200) : undefined}
          style={[s.toast, { backgroundColor: c.toastBg }]} accessibilityLiveRegion="polite">
          <Txt f="medium" s={15} color={c.toastInk} style={{ flexShrink: 1 }}>{t.text}</Txt>
          {t.undo && (
            <Pressable onPress={() => { t.undo?.(); onDone(); }} hitSlop={8} style={s.undo} accessibilityRole="button">
              <Txt f="bold" s={15} color={c.toastAction}>Deshacer</Txt>
            </Pressable>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16, zIndex: 20 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, maxWidth: '100%', paddingLeft: 18, paddingRight: 8, borderRadius: R.toast,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  undo: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12 },
});
export const toastFont = F.medium;

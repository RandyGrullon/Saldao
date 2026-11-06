// Las piezas de siempre con las medidas de la web: tarjetas de 22, filas de 64 con la línea a 20 px del borde, botones
// de 44 (56 los grandes), pastillas, segmentados, chips, campos y las entradas que suben un poco al aparecer.
import { Children, isValidElement, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { Keyframe, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { go } from '../lib/nav';
import { ANIM, F, R, SIZE, useC } from '../lib/theme';
import { Icon, type IconName } from './icons';
import { H1, Txt } from './text';

// ── movimiento: cada bloque sube 8 px y aparece, uno tras otro (28 ms) ──
const rise = (i: number) => new Keyframe({ 0: { opacity: 0, transform: [{ translateY: 8 }] }, 100: { opacity: 1, transform: [{ translateY: 0 }] } })
  .duration(350).delay(Math.min(i, 9) * 28);
export function Rise({ i = 0, children, style }: { i?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  return <Animated.View entering={reduce || !ANIM ? undefined : rise(i)} style={style}>{children}</Animated.View>;
}

// ── marcos de pantalla ──
const keyOf = (ch: ReactNode, i: number) => (isValidElement(ch) && ch.key != null ? ch.key : i);
/** Contenido con margen y separación de 14, cada bloque entrando en cascada. */
function Stagger({ children }: { children: ReactNode }) {
  return <>{Children.toArray(children).filter(Boolean).map((ch, i) => <Rise key={keyOf(ch, i)} i={i}>{ch}</Rise>)}</>;
}

/** Pestañas: arriba la zona segura, abajo libre de la barra de pestañas (que flota encima). */
export function TabScreen({ children }: { children: ReactNode }) {
  const c = useC(), insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[st.pad, { paddingTop: insets.top + 20, paddingBottom: SIZE.tabbar + insets.bottom + 96 }]}>
      <Stagger>{children}</Stagger>
    </ScrollView>
  );
}

/** «‹ Atrás» y lo de la pantalla a la derecha. */
export function Bar({ right }: { right?: ReactNode }) {
  const c = useC();
  return (
    <View style={st.bar}>
      <Pressable onPress={go.back} hitSlop={6} style={st.back} accessibilityRole="button" accessibilityLabel="Atrás">
        <Icon n="left" size={24} color={c.accentInk} /><Txt f="semi" c="accentInk">Atrás</Txt>
      </Pressable>
      {right}
    </View>
  );
}
/** Pantallas que entran (grupo, persona, gasto). */
export function StackScreen({ right, children, footer }: { right?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const c = useC(), insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Bar right={right} />
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
        contentContainerStyle={[st.pad, { paddingTop: 4, paddingBottom: insets.bottom + 48 }]}>
        <Stagger>{children}</Stagger>
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

/** Cabecera de hoja: a la izquierda «Cancelar» (o lo que se pase), el título al centro y la acción a la derecha. */
export function SheetHead({ title, left, right }: { title: string; left?: ReactNode | null; right?: ReactNode }) {
  return (
    <View style={st.sheetHead}>
      <View style={st.side}>{left === undefined ? <LinkBtn title="Cancelar" onPress={go.back} /> : left}</View>
      <Txt f="semi" s={17} lines={1} style={{ flexShrink: 1, textAlign: 'center' }}>{title}</Txt>
      <View style={[st.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}
/** Una hoja (pantalla modal): cabecera fija y contenido que se desplaza; el teclado no tapa los campos. */
export function Sheet({ head, children, footer, scroll = true }: { head: ReactNode; children: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const c = useC(), insets = useSafeAreaInsets();
  const top = Platform.OS === 'ios' ? 8 : insets.top + 4;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg, paddingTop: top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {Platform.OS === 'ios' && <View style={st.grab}><View style={[st.grabBar, { backgroundColor: c.line }]} /></View>}
      {head}
      {scroll ? (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={[st.pad, { paddingTop: 8, paddingBottom: (footer ? 16 : insets.bottom + 24) }]}>
          <Stagger>{children}</Stagger>
        </ScrollView>
      ) : <View style={{ flex: 1 }}>{children}</View>}
      {footer}
    </KeyboardAvoidingView>
  );
}

export const TitleRow = ({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) => (
  <View style={st.titleRow}>
    <View style={{ flexShrink: 1 }}>{sub && <Txt f="medium" s={15} c="muted">{sub}</Txt>}<H1>{title}</H1></View>
    {right}
  </View>
);
/** Encabezado de sección: «Personas · toca para ver por qué» o «Grupos · Ver todos ›». */
export const Sec = ({ title, hint, link }: { title: string; hint?: string; link?: { title: string; onPress: () => void } }) => (
  <View style={st.sec}>
    <Txt f="displaySemi" s={16}>{title}</Txt>
    {hint && <Txt f="medium" s={13} c="muted">{hint}</Txt>}
    {link && <LinkBtn title={link.title} iconRight="chevR" onPress={link.onPress} style={{ marginVertical: -12, marginRight: -8 }} />}
  </View>
);

// ── superficies ──
export function Card({ children, style, pad }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const c = useC();
  return <View style={[{ backgroundColor: c.surface, borderRadius: R.card }, !c.isDark && st.shadow, pad && st.cardPad, style]}>{children}</View>;
}
export const Section = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <Card pad style={style}>{children}</Card>;

/** Lista en tarjeta: una línea entre filas que empieza a 20 px del borde. */
export function List({ children, style, inset = 20, bg }: { children: ReactNode; style?: StyleProp<ViewStyle>; inset?: number; bg?: string }) {
  const c = useC();
  const items = Children.toArray(children).filter(Boolean);
  return (
    <Card style={[{ overflow: 'hidden' }, bg ? { backgroundColor: bg } : null, style]}>
      {items.map((ch, i) => (
        <View key={keyOf(ch, i)}>
          {i > 0 && <View pointerEvents="none" style={[st.sep, { left: inset, backgroundColor: c.line }]} />}
          {ch}
        </View>
      ))}
    </Card>
  );
}
/** Fila de 64: ícono o avatar, el texto en medio y el monto al final. */
export function Row({ onPress, children, style, label }: { onPress?: () => void; children: ReactNode; style?: StyleProp<ViewStyle>; label?: string }) {
  const c = useC();
  if (!onPress) return <View style={[st.row, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [st.row, pressed && { backgroundColor: c.surface2 }, style]}>{children}</Pressable>
  );
}
export const Main = ({ children, gap = 2 }: { children: ReactNode; gap?: number }) => <View style={{ flex: 1, minWidth: 0, gap }}>{children}</View>;
export const Sub = ({ children }: { children: ReactNode }) => <View style={st.sub}>{children}</View>;
export const End = ({ children, max = '48%' }: { children: ReactNode; max?: `${number}%` }) => <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0, maxWidth: max }}>{children}</View>;

// ── controles ──
type Kind = 'default' | 'primary' | 'soft' | 'danger' | 'dangerSolid';
export function Btn({ title, icon, kind = 'default', size = 'md', disabled, onPress, style, label }: {
  title: string; icon?: IconName | 'google'; kind?: Kind; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle>; label?: string;
}) {
  const c = useC();
  const bg = { default: c.surface2, primary: c.accent, soft: c.accentSoft, danger: c.dangerSoft, dangerSolid: c.danger }[kind];
  const fg = { default: c.fg, primary: c.accentFg, soft: c.accentInk, danger: c.danger, dangerSolid: c.onDanger }[kind];
  const h = size === 'sm' ? 36 : size === 'lg' ? SIZE.btn : SIZE.touch;
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [st.btn, { minHeight: h, borderRadius: size === 'lg' ? R.btn : size === 'sm' ? 12 : 14, paddingHorizontal: size === 'sm' ? 14 : size === 'lg' ? 22 : 18,
        backgroundColor: bg, opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed && !disabled ? 0.97 : 1 }] },
        kind === 'primary' && !disabled && st.glow, style]}>
      {icon && <Icon n={icon} sm={size === 'sm'} color={fg} />}
      <Txt f="semi" s={size === 'sm' ? 14 : size === 'lg' ? 17 : 15} color={fg} lines={1} style={{ flexShrink: 1 }}>{title}</Txt>
    </Pressable>
  );
}
/** La acción principal sola a lo ancho; las demás, de a dos debajo. Con `A.full` y `A.half` en cada botón. */
export const Actions = ({ children }: { children: ReactNode }) => <View style={st.actions}>{children}</View>;
export const A = StyleSheet.create({ full: { flexBasis: '100%', flexGrow: 1 }, half: { flexBasis: '40%', flexGrow: 1 } });

export function LinkBtn({ title, icon, iconRight, onPress, disabled, strong, color, style }: {
  title: string; icon?: IconName; iconRight?: IconName; onPress?: () => void; disabled?: boolean; strong?: boolean; color?: string; style?: StyleProp<ViewStyle>;
}) {
  const c = useC(), fg = disabled ? c.faint : color ?? c.accentInk;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [st.link, { opacity: pressed ? 0.6 : 1 }, style]}>
      {icon && <Icon n={icon} sm color={fg} />}
      <Txt f={strong ? 'bold' : 'semi'} s={15} color={fg}>{title}</Txt>
      {iconRight && <Icon n={iconRight} sm color={fg} />}
    </Pressable>
  );
}

export function Pill({ tone, children }: { tone?: 'ok' | 'warn' | 'accent'; children: ReactNode }) {
  const c = useC();
  const [bg, fg] = tone === 'ok' ? [c.okSoft, c.ok] : tone === 'warn' ? [c.warnSoft, c.warn] : tone === 'accent' ? [c.accentSoft, c.accentInk] : [c.surface2, c.muted];
  return <View style={[st.pill, { backgroundColor: bg }]}><Txt f="semi" s={12} lh={16} color={fg} lines={1} style={{ flexShrink: 1 }}>{children}</Txt></View>;
}

/** Segmentado: barra gris y la opción elegida resaltada. */
export function Seg<T extends string>({ value, options, onChange, scroll, label }: {
  value: T; options: readonly (readonly [T, string, IconName?])[]; onChange: (v: T) => void; scroll?: boolean; label: string;
}) {
  const c = useC();
  const body = options.map(([k, l, ic]) => {
    const on = value === k;
    return (
      <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="radio" accessibilityState={{ checked: on }}
        style={[st.segBtn, !scroll && { flex: 1, paddingHorizontal: 6 }, on && { backgroundColor: c.segOn }, on && st.segShadow]}>
        {ic && <Icon n={ic} sm color={on ? c.accentInk : c.muted} />}
        <Txt f="semi" s={15} color={on ? c.fg : c.muted} lines={1}>{l}</Txt>
      </Pressable>
    );
  });
  return scroll
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" accessibilityLabel={label} style={[st.seg, { backgroundColor: c.surface2 }]} contentContainerStyle={{ gap: 2 }}>{body}</ScrollView>
    : <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[st.seg, { backgroundColor: c.surface2, flexDirection: 'row', gap: 2 }]}>{body}</View>;
}

export function Chip({ title, on, onPress, left, right, label }: { title: string; on?: boolean; onPress?: () => void; left?: ReactNode; right?: ReactNode; label?: string }) {
  const c = useC();
  return (
    <Pressable onPress={onPress} accessibilityRole={on === undefined ? 'button' : 'checkbox'} accessibilityState={on === undefined ? undefined : { checked: on }} accessibilityLabel={label ?? title}
      style={({ pressed }) => [st.chip, { backgroundColor: on ? c.accentSoft : c.surface, borderColor: on ? c.accentInk : c.line, paddingLeft: left ? 6 : 14,
        transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      {left}<Txt f="medium" s={15} color={on ? c.accentInk : c.fg} lines={1} style={{ flexShrink: 1 }}>{title}</Txt>{right}
    </Pressable>
  );
}
export const Chips = ({ children }: { children: ReactNode }) => <View style={st.chips}>{children}</View>;

/** Campo de texto: borde fino, acento al enfocarlo. Dentro de una tarjeta va con el fondo de la página. */
export function Field({ inCard, style, multiline, ...p }: TextInputProps & { inCard?: boolean }) {
  const c = useC();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput placeholderTextColor={c.faint} {...p} multiline={multiline}
      onFocus={e => { setFocus(true); p.onFocus?.(e); }} onBlur={e => { setFocus(false); p.onBlur?.(e); }}
      style={[st.field, { backgroundColor: inCard ? c.bg : c.surface, borderColor: focus ? c.accentInk : c.line, color: c.fg },
        multiline && { minHeight: 84, paddingTop: 12, textAlignVertical: 'top' }, style]} />
  );
}
export const Label = ({ title, children }: { title: string; children: ReactNode }) => (
  <View style={{ gap: 6 }}><Txt f="semi" s={13} c="muted">{title}</Txt>{children}</View>
);

export function SplitStatus({ ok, children }: { ok: boolean; children: ReactNode }) {
  const c = useC();
  return (
    <View style={[st.status, { backgroundColor: ok ? c.okSoft : c.warnSoft }]} accessibilityLiveRegion="polite">
      {ok && <Icon n="check" sm color={c.ok} />}
      <Txt f="semi" s={15} color={ok ? c.ok : c.warn} center style={{ flexShrink: 1 }}>{children}</Txt>
    </View>
  );
}

/** Vacío: borde punteado, el ícono en acento suave y una línea de qué hacer. */
export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  const c = useC();
  return (
    <View style={[st.empty, { borderColor: c.line }]}>
      <View style={[st.emptyIc, { backgroundColor: c.accentSoft }]}><Icon n={icon} size={26} color={c.accentInk} /></View>
      <Txt f="semi" center>{title}</Txt>
      {children ? <Txt s={15} c="muted" center style={{ maxWidth: 280 }}>{children}</Txt> : null}
      {action ? <View style={{ alignSelf: 'stretch', marginTop: 8 }}>{action}</View> : null}
    </View>
  );
}

export const Note = ({ children, center }: { children: ReactNode; center?: boolean }) => <Txt s={15} c="muted" center={center}>{children}</Txt>;
export const Finding = ({ children }: { children: ReactNode }) => <Txt f="medium" s={18}>{children}</Txt>;
export const SheetH3 = ({ children }: { children: ReactNode }) => <Txt f="semi" s={13} c="muted" style={{ marginTop: 8, marginHorizontal: 4, letterSpacing: 0.3 }}>{children}</Txt>;

export const st = StyleSheet.create({
  pad: { paddingHorizontal: SIZE.gut, gap: 14 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: SIZE.touch, paddingLeft: 4, paddingRight: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 8, paddingBottom: 6 },
  side: { flex: 1, alignItems: 'flex-start' },
  grab: { height: 14, alignItems: 'center', justifyContent: 'center' },
  grabBar: { width: 40, height: 5, borderRadius: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  sec: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12, rowGap: 2, marginTop: 14, marginHorizontal: 4, marginBottom: -2 },
  shadow: { shadowColor: '#0e0f13', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  cardPad: { padding: 22, gap: 12 },
  sep: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth * 2, zIndex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: SIZE.row, paddingVertical: 10, paddingLeft: 20, paddingRight: 18 },
  sub: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  glow: { shadowColor: '#c8f169', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: SIZE.touch, paddingHorizontal: 8, borderRadius: 12 },
  pill: { alignSelf: 'flex-start', maxWidth: '100%', height: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderRadius: 999 },
  seg: { padding: 4, borderRadius: 14, flexGrow: 0 },
  segBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 10 },
  segShadow: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingRight: 14, borderRadius: 999, borderWidth: 1, maxWidth: '100%' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { minHeight: 50, paddingHorizontal: 14, borderRadius: R.control, borderWidth: 1, fontFamily: F.regular, fontSize: 16 },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 20 },
  emptyIc: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  canEdit, cat, curSym, dayNum, fdate, groupOf, hueOf, initials, involves, mineOf, moneyT, monShort, myStatus, paidText, parts, run, short,
  type Backend, type Expense, type Id, type LedgerItem, type Snapshot,
} from '@saldao/core';
import { buzz, errMsg, go } from '../lib/nav';
import { useS } from '../lib/store';
import { F, SIZE, useC } from '../lib/theme';
import { Card, End, Main, Pill, Row, Sub, st } from './base';
import { Icon, type IconName } from './icons';
import { B, Txt } from './text';
import { useToast } from './toast';
import { tr } from '@saldao/core';

/** Ejecuta una acción, avisa y ofrece deshacer cuando se puede. */
export function useAct() {
  const toast = useToast();
  return async (fn: (b: Backend) => Promise<unknown>, okText?: string, undo?: (b: Backend) => Promise<unknown>) => {
    try {
      await run(fn); buzz();
      if (okText) toast(okText, undo ? () => { run(undo).catch(e => toast(errMsg(e))); } : undefined);
      return true;
    } catch (e) { toast(errMsg(e)); return false; }
  };
}

// ── dinero: cifras del mismo ancho y los centavos más chicos ──
/** `fit`: cuántos caracteres caben al tamaño `s`; si el monto es más largo, la letra se achica en vez de cortarse. */
export function Money({ c, cur = 'DOP', sign = false, s = 16, f = 'semi', color, style, fit }: {
  c: number; cur?: string; sign?: boolean; s?: number; f?: keyof typeof F; color?: string; style?: StyleProp<TextStyle>; fit?: number;
}) {
  const t = useC();
  const [i, d] = parts(c, cur), pre = c < 0 ? '−' : sign && c > 0 ? '+' : '';
  const len = `${pre}${curSym(cur)} ${i}${d ? `.${d}` : ''}`.length;
  const size = fit && len > fit ? Math.max(Math.round(s * 0.6), Math.floor((s * fit) / len)) : s;
  return (
    <Text numberOfLines={1} style={[{ fontFamily: F[f], fontSize: size, color: color ?? t.fg, fontVariant: ['tabular-nums'], letterSpacing: -0.02 * size,
      lineHeight: Math.round(size * 1.25) }, style, fit ? { letterSpacing: -0.04 * size, lineHeight: Math.round(size * 1.15) } : null]}>
      {pre}{curSym(cur)}{' '}{i}{d ? <Text style={{ fontSize: Math.round(size * 0.72), opacity: 0.6 }}>.{d}</Text> : null}
    </Text>
  );
}
/** Un saldo que cuenta hasta su valor al aparecer o cambiar. Quieto con «reducir movimiento». */
export function AnimMoney({ c, sign, s = 40, color }: { c: number; sign?: boolean; s?: number; color?: string }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? c : 0);
  const from = useRef(reduce ? c : 0);
  useEffect(() => {
    if (reduce) { from.current = c; setShown(c); return; }
    const start = Date.now(), origin = from.current, ms = 700;
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / ms);
      setShown(Math.round(origin + (c - origin) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = c;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [c, reduce]);
  return <Money c={shown} sign={sign && c > 0} s={s} f="display" color={color} fit={11.5} />;
}
/** Verde lo que te deben, coral lo que debes. */
export function useBalColor() {
  const c = useC();
  return (x: number) => (x > 0 ? c.ok : x < 0 ? c.danger : c.muted);
}

// ── personas: cada una con su tono; tú, en el acento ──
const AV = { xs: [24, 10], sm: [30, 11], md: [40, 14], lg: [64, 22], head: [32, 12] } as const;
export function Av({ id, size = 'md', ring, dim }: { id: Id; size?: keyof typeof AV; ring?: string; dim?: boolean }) {
  const s = useS(), c = useC(), h = hueOf(s, id) ?? 0, me = id === s.me;
  const [d, fs] = AV[size];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: d, height: d, borderRadius: d / 2, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.35 : 1,
        backgroundColor: me ? c.accent : `hsl(${h}, ${c.av.s}%, ${c.av.l}%)`, borderWidth: ring ? 2 : 0, borderColor: ring }}>
      <Text style={{ fontFamily: F.semi, fontSize: fs, color: me ? c.accentFg : `hsl(${h}, 55%, ${c.av.ink}%)` }}>{initials(s, id)}</Text>
    </View>
  );
}
export function Avs({ ids, size = 'xs', ring }: { ids: Id[]; size?: keyof typeof AV; ring?: string }) {
  const c = useC();
  return <View style={{ flexDirection: 'row' }}>{ids.slice(0, 5).map((k, i) => <View key={k} style={{ marginLeft: i ? -7 : 0 }}><Av id={k} size={size} ring={ring ?? c.surface} /></View>)}</View>;
}

/** La fecha de las listas: el mes arriba, en el acento, y el día grande. */
export function LeadDate({ date, bg }: { date: string; bg?: string }) {
  const c = useC();
  return (
    <View style={[k.lead, { backgroundColor: bg ?? c.surface2 }]}>
      <Txt f="bold" s={10} lh={12} c="accentInk" style={{ letterSpacing: 0.8, textTransform: 'uppercase' }}>{monShort(date)}</Txt>
      <Txt f="display" s={17} lh={20} style={{ marginTop: 2 }}>{dayNum(date)}</Txt>
    </View>
  );
}
/** Ícono en caja de 40 px al principio de una fila. */
export function RowIc({ n, tone }: { n: IconName; tone?: 'accent' | 'ok' }) {
  const c = useC();
  const [bg, fg] = tone === 'accent' ? [c.accentSoft, c.accentInk] : tone === 'ok' ? [c.okSoft, c.ok] : [c.surface2, c.fg2];
  return <View style={[k.rowIc, { backgroundColor: bg }]}><Icon n={n} color={fg} /></View>;
}

/** La forma de Inicio mientras llegan tus cuentas: el saldo y unas filas que brillan. */
export function HomeSkeleton() {
  const c = useC(), insets = useSafeAreaInsets(), reduce = useReducedMotion();
  const o = useSharedValue(0.55);
  useEffect(() => { if (!reduce) o.value = withRepeat(withTiming(1, { duration: 900 }), -1, true); }, [o, reduce]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  const box = (w: number | `${number}%`, h: number, r = 8, extra?: object) => <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: c.surface2 }, extra]} />;
  return (
    <Animated.View accessibilityLabel={tr("Cargando")} style={[{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 20, paddingHorizontal: SIZE.gut, gap: 14 }, pulse]}>
      {box(120, 14)}{box(200, 30, 8, { marginBottom: 6 })}{box('100%', 250, 22)}{box(110, 18, 8, { marginTop: 14 })}
      <Card>{[0, 1, 2, 3].map(i => (
        <View key={i} style={[st.row, { gap: 14 }]}>{box(40, 40, 12)}
          <View style={{ flex: 1, gap: 8 }}>{box(`${62 - i * 9}%`, 13)}{box('35%', 11)}</View>{box(54, 16)}</View>))}</Card>
    </Animated.View>
  );
}

/** Saldo con alguien o en un grupo: + te deben, − debes, cero a mano. */
export function BalText({ c: x, who }: { c: number; who?: boolean }) {
  const color = useBalColor()(x);
  return (
    <End>
      <Txt s={13} c="muted">{x > 0 ? (who ? tr("te debe") : tr("te deben")) : x < 0 ? (who ? tr("le debes") : tr("debes")) : tr("a mano")}</Txt>
      {x !== 0 && <Money c={Math.abs(x)} sign={x > 0} s={17} color={color} />}
    </End>
  );
}

/** «Le pagaste a Ana», «Ana te pagó», «Ana le pagó a Beto» (dentro de un texto). */
export function PayText({ s, e }: { s: Snapshot; e: Expense }) {
  const from = Object.keys(e.payers)[0], to = Object.keys(e.shares)[0];
  if (from === s.me) return <>{tr("Le pagaste a")}{" "}<B>{short(s, to)}</B></>;
  if (to === s.me) return <><B>{short(s, from)}</B>{" "}{tr("te pagó")}</>;
  return <><B>{short(s, from)}</B>{" "}{tr("le pagó a")}{" "}<B>{short(s, to)}</B></>;
}

/** Cuánto mueve este gasto tu saldo. */
export function Impact({ e }: { e: Expense }) {
  const s = useS(), c = useC(), m = mineOf(s, e);
  const line = (lbl: string, x?: number, color?: string, sign?: boolean) => (
    <End><Txt s={13} c="muted">{lbl}</Txt>{x !== undefined && <Money c={x} sign={sign} s={17} color={color} />}</End>
  );
  if (e.isPayment) return m > 0 ? line('pagaste', m, c.ok) : m < 0 ? line('recibiste', -m) : line(tr("no participas"));
  if (m > 0) return line('prestaste', m, c.ok, true);
  if (m < 0) return line(tr("te prestaron"), -m, c.danger);
  return line(involves(e, s.me) ? tr("pagaste lo tuyo") : tr("no participas"));
}

/** ¿Ya se saldó este movimiento? */
export function ItemStatus({ it }: { it: LedgerItem }) {
  if (!it.left) return <Pill tone="ok">{it.e.isPayment ? tr("aplicado") : tr("saldado")}{it.closedAt ? ` ${fdate(it.closedAt)}` : ''}</Pill>;
  if (it.e.isPayment) return <Pill>{it.covers.length ? tr("sobran {0}", moneyT(it.left)) : tr("a favor")}</Pill>;
  if (it.left < Math.abs(it.x)) return <Pill tone="warn">{tr("quedan {0}", moneyT(it.left))}</Pill>;
  return <Pill tone="warn">{tr("pendiente")}</Pill>;
}

/** Un renglón del porqué, visto desde a: + suma a lo que b le debe a a. */
export function WhyRow({ it, a, b, showGroup, bg }: { it: LedgerItem & { groupId?: Id }; a: Id; b: Id; showGroup?: boolean; bg?: string }) {
  const s = useS(), e = it.e, debtor = it.x > 0 ? b : a, share = e.shares[debtor] || 0;
  const g = showGroup && it.groupId ? groupOf(s, it.groupId) : null;
  const sub = e.isPayment
    ? (it.covers.length ? tr("Cubrió {0}{1}", it.covers.map(x => `«${x.description}»`).join(', '), it.left ? tr(" y sobraron {0}", moneyT(it.left)) : '') : tr("Quedó como saldo a favor"))
    : `${paidText(s, e)} · ${debtor === s.me ? tr("tu parte") : tr("parte de {0}", short(s, debtor))} ${moneyT(share, e.currency)}${g && g.kind !== 'directo' ? ` · ${g.name}` : ''}`;
  const closed = it.closedBy && !it.left && !e.isPayment
    ? tr(" · se saldó con {0}", it.closedBy.isPayment ? tr("el pago del {0}", fdate(it.closedBy.date)) : `«${it.closedBy.description}»`) : '';
  return (
    <Row onPress={() => go.expense(e.id)} style={{ alignItems: 'flex-start', padding: 12, paddingLeft: 12, paddingRight: 12, minHeight: 0, gap: 12 }}>
      <LeadDate date={e.date} bg={bg} />
      <Main>
        <Txt f="semi">{e.isPayment ? <PayText s={s} e={e} /> : `«${e.description}»`}</Txt>
        <Txt s={14} c="muted">{sub}{closed}</Txt>
      </Main>
      <End max="42%"><Money c={it.x} sign s={16} /><ItemStatus it={it} /></End>
    </Row>
  );
}

/** Fila de gasto en una lista. Se desliza a la izquierda para borrar (si puedes). */
export function ExpRow({ e, showGroup }: { e: Expense; showGroup?: boolean }) {
  const s = useS(), c = useC(), act = useAct(), ct = cat(e.category);
  const g = groupOf(s, e.groupId), status = myStatus(s, e);
  const row = (
    <Row onPress={() => go.expense(e.id)} style={{ backgroundColor: c.surface }} label={e.isPayment ? undefined : e.description}>
      <RowIc n={ct.icon} tone={e.isPayment ? 'ok' : undefined} />
      <Main>
        <Txt f="semi" lines={1}>{e.isPayment ? <PayText s={s} e={e} /> : e.description}</Txt>
        <Sub>
          {e.pending && <Pill>{tr("sin enviar")}</Pill>}
          {e.isPayment ? <>
            <Txt s={14} c="muted">{moneyT(e.amount, e.currency)} · {fdate(e.date)}</Txt>
            {e.paymentStatus === 'pendiente' && <Pill tone="warn">{tr("por confirmar")}</Pill>}
          </> : <>
            <Txt s={14} c="muted">{paidText(s, e)} · {fdate(e.date)}{showGroup && g && g.kind !== 'directo' ? ` · ${g.name}` : ''}</Txt>
            {status && <Pill tone={status.done === status.total ? 'ok' : undefined}>{status.done === status.total ? tr("saldado") : tr("{0} de {1} saldados", status.done, status.total)}</Pill>}
          </>}
        </Sub>
      </Main>
      <Impact e={e} />
    </Row>
  );
  if (!canEdit(s, e)) return row;
  const del = () => act(b => b.deleteExpense(e.id), e.isPayment ? tr("Pago eliminado") : tr("Gasto eliminado"), b => b.restoreExpense(e.id));
  return (
    <ReanimatedSwipeable friction={2} rightThreshold={48} overshootRight={false}
      renderRightActions={() => (
        <Pressable onPress={del} accessibilityRole="button" accessibilityLabel={tr("Eliminar {0}", e.description)} style={[k.swipeAct, { backgroundColor: c.danger }]}>
          <Icon n="trash" color={c.onDanger} /><Txt f="semi" s={12} color={c.onDanger}>{tr("Eliminar")}</Txt>
        </Pressable>
      )}>
      {row}
    </ReanimatedSwipeable>
  );
}

/** Un bloque de texto que se lee en la tarjeta: «Miguel es quien más te debe…». */
export function Finding({ children }: { children: ReactNode }) {
  const c = useC();
  return <View style={[k.finding, { backgroundColor: c.surface2 }]}><Txt s={15} c="fg2">{children}</Txt></View>;
}

export { fullName, short } from '@saldao/core';

const k = StyleSheet.create({
  lead: { width: 46, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowIc: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swipeAct: { width: 96, alignItems: 'center', justifyContent: 'center', gap: 2 },
  finding: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
});

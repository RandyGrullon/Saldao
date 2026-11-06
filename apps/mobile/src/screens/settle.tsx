import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import {
  debts, fdate, friendBal, friends, groupOf, isFund, listOf, nets, parseMoney, plural, recordPay, reminderText, run, short, simplify, whyItems, xferTitle,
  type Id, type Snapshot, type Transfer,
} from '@saldao/core';
import { buzz, errMsg, go } from '../lib/nav';
import { useS } from '../lib/store';
import { ANIM, F, useC } from '../lib/theme';
import { Btn, Finding, List, Main, Note, Section, Seg, Sheet, SheetHead } from '../ui/base';
import { Icon } from '../ui/icons';
import { Av, Money, WhyRow } from '../ui/kit';
import { B, H2, Txt } from '../ui/text';
import { useToast } from '../ui/toast';

/** Recordatorio amable por WhatsApp (o lo que el teléfono ofrezca para compartir). */
export const remind = (s: Snapshot, p: Id, amount: number) => Share.share({ message: reminderText(s, p, amount) }).catch(() => {});

/** Una deuda directa que se despliega para mostrar de qué gastos sale, cuándo fue y qué ya se saldó. */
export function XferRow({ t, groupId }: { t: Transfer; groupId?: Id }) {
  const s = useS(), c = useC(), toast = useToast();
  const [open, setOpen] = useState(false);
  const its = whyItems(s, t.to, t.from, groupId);
  const pend = its.filter(it => it.left && !it.e.isPayment), over = its.find(it => it.left && it.e.isPayment);
  const since = pend.map(it => it.e.date).sort()[0];
  const title = xferTitle(s, t), fromFund = isFund(s, t.from), toFund = isFund(s, t.to);
  const gotPaid = async () => {
    try {
      let ids: Id[] = [];
      await run(async b => { ids = await recordPay(b, s, t.from, s.me, t.amount, groupId); });
      buzz();
      toast(`Pago de ${short(s, t.from)} registrado`, () => { run(b => Promise.all(ids.map(id => b.deleteExpense(id)))).catch(e => toast(errMsg(e))); });
    } catch (e) { toast(errMsg(e)); }
  };
  const color = t.to === s.me ? c.ok : t.from === s.me ? c.danger : c.fg;
  return (
    <View>
      <Pressable onPress={() => { buzz(); setOpen(o => !o); }} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={title}
        style={({ pressed }) => [x.row, pressed && { backgroundColor: c.surface2 }]}>
        <View style={x.pair}><Av id={t.from} size="sm" /><Icon n="right" size={12} color={c.faint} /><Av id={t.to} size="sm" /></View>
        <Main>
          <Txt f="semi">{title}</Txt>
          <Txt s={14} c="muted">{pend.length ? `${plural(pend.length, 'gasto sin saldar', 'gastos sin saldar')} · desde el ${fdate(since)}` : over ? `Pagó de más el ${fdate(over.e.date)}` : ''}</Txt>
        </Main>
        <View style={{ alignItems: 'flex-end', gap: 4, maxWidth: '40%' }}>
          <Money c={t.amount} s={16} color={color} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <View style={{ transform: [{ rotate: open ? '90deg' : '-90deg' }] }}><Icon n="left" sm color={c.accentInk} /></View>
            <Txt f="semi" s={13} c="accentInk">Por qué</Txt>
          </View>
        </View>
      </Pressable>
      {open && (
        <Animated.View entering={ANIM ? FadeIn.duration(260) : undefined} style={{ marginHorizontal: 14, marginBottom: 12 }}>
          <List bg={c.surface2} inset={12} style={{ borderRadius: 16 }}>
            {its.length ? its.map(it => <WhyRow key={it.e.id} it={it} a={t.to} b={t.from} showGroup={!groupId} bg={c.surface} />)
              : <View style={{ padding: 12 }}><Txt s={14} c="muted">Con las deudas simplificadas este pago sale de los saldos de todo el grupo, no de gastos entre ustedes dos.</Txt></View>}
          </List>
        </Animated.View>
      )}
      {t.from === s.me && <View style={x.act}><Btn title={toFund ? 'Aportar' : 'Pagar'} kind="primary" size="sm" onPress={() => go.pay(t.to, t.amount, groupId, toFund)} /></View>}
      {t.to === s.me && !fromFund && <View style={x.act}>
        <Btn title="Recordar" size="sm" onPress={() => remind(s, t.from, t.amount)} />
        <Btn title="Me pagó" size="sm" onPress={gotPaid} />
      </View>}
    </View>
  );
}

/** Saldar un grupo, o todas tus cuentas si no viene grupo. */
export function SettleSheet() {
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  return groupId ? <GroupSettle groupId={groupId} /> : <MySettle />;
}

function GroupSettle({ groupId }: { groupId: Id }) {
  const s = useS(), g = groupOf(s, groupId);
  if (!g) return <Sheet head={<SheetHead title="Saldar" />}><Finding>Este grupo ya no existe.</Finding></Sheet>;
  const d = debts(s, groupId), simple = simplify(nets(listOf(s, groupId))).length;
  return (
    <Sheet head={<SheetHead title={`Saldar ${g.name}`} left={null} right={<CloseLink />} />}>
      {d.length ? <Finding><B>{plural(d.length, 'deuda abierta', 'deudas abiertas')}</B> en {g.name}.</Finding> : <Finding>Todo el mundo está a mano en {g.name}.</Finding>}
      {d.length ? <Note>Toca una para ver de qué gastos sale, cuándo fue y qué ya se saldó.{simple < d.length ? ` Con «Simplificar deudas» bastarían ${simple} pagos.` : ''}</Note> : null}
      {d.length ? <List>{d.map(t => <XferRow key={t.from + t.to} t={t} groupId={groupId} />)}</List> : null}
    </Sheet>
  );
}

function MySettle() {
  const s = useS();
  const rows: Transfer[] = friends(s).map(p => ({ p, b: friendBal(s, p).b })).filter(r => r.b)
    .map(r => (r.b < 0 ? { from: s.me, to: r.p, amount: -r.b } : { from: r.p, to: s.me, amount: r.b }));
  return (
    <Sheet head={<SheetHead title="Saldar cuentas" left={null} right={<CloseLink />} />}>
      {rows.length ? <Note>Sumando todos tus grupos y los gastos de a dos.</Note> : <Finding>Estás a mano con todo el mundo.</Finding>}
      {rows.length ? <List>{rows.map(t => <XferRow key={t.from + t.to} t={t} />)}</List> : null}
    </Sheet>
  );
}

const CloseLink = () => {
  const c = useC();
  return <Pressable onPress={go.back} hitSlop={8} accessibilityRole="button" accessibilityLabel="Listo" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
    <Txt f="bold" s={15} color={c.accentInk}>Listo</Txt></Pressable>;
};

export function PaySheet() {
  const { to, amount, groupId, fondo } = useLocalSearchParams<{ to: string; amount: string; groupId?: string; fondo?: string }>();
  const contribution = !!fondo;
  const s = useS(), c = useC(), toast = useToast(), p = s.profiles[to];
  const [val, setVal] = useState(Number(amount) ? (Number(amount) / 100).toFixed(2) : '');
  const [method, setMethod] = useState<'transferencia' | 'efectivo'>('transferencia');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!p) return <Sheet head={<SheetHead title="Pagar" />}><Finding>Ya no compartes grupos con esta persona.</Finding></Sheet>;
  const save = async () => {
    const amt = parseMoney(val);
    if (amt <= 0) return setErr('Escribe un monto mayor que cero');
    setBusy(true); setErr('');
    try {
      let ids: Id[] = [];
      await run(async b => { ids = await recordPay(b, s, s.me, to, amt, groupId || undefined, method); });
      buzz(); go.back();
      toast(contribution ? 'Aporte anotado' : `Pago registrado. ${short(s, to)} debe confirmarlo.`, () => { run(b => Promise.all(ids.map(id => b.deleteExpense(id)))).catch(e => toast(errMsg(e))); });
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  const copy = () => Clipboard.setStringAsync(p.payout!).then(() => toast('Cuenta copiada'), () => toast('No se pudo copiar'));
  return (
    <Sheet head={<SheetHead title={contribution ? 'Aportar al fondo común' : `Pagar a ${short(s, to)}`} />}>
      <View style={x.amountIn}>
        <Txt f="semi" s={20} c="muted">RD$</Txt>
        <TextInput value={val} onChangeText={setVal} keyboardType="decimal-pad" selectTextOnFocus accessibilityLabel="Monto a pagar"
          style={[x.amountField, { color: c.fg, fontFamily: F.display }]} />
      </View>
      {!contribution && <Section>
        <H2>Dónde pagarle a {short(s, to)}</H2>
        {p.payout ? <>
          <Txt f="semi" selectable>{p.payout}</Txt><Txt s={15} c="muted">{p.name}</Txt>
          <Btn title="Copiar cuenta" icon="copy" size="sm" style={{ alignSelf: 'flex-start' }} onPress={copy} />
        </> : <Txt s={15} c="muted">{short(s, to)} todavía no ha puesto sus datos de cobro. Pídeselos o págale en efectivo.</Txt>}
      </Section>}
      <Seg label="Cómo pagas" value={method} onChange={setMethod} options={[['transferencia', 'Transferencia'], ['efectivo', 'Efectivo']]} />
      {err ? <Txt f="medium" s={15} c="danger">{err}</Txt> : null}
      <Btn title={busy ? 'Guardando…' : contribution ? 'Registrar aporte' : 'Registrar pago'} kind="primary" size="lg" disabled={busy} onPress={save} />
      <Note center>{contribution ? 'El aporte queda en el fondo: los gastos del fondo salen de ahí.' : `A ${short(s, to)} le aparece en Actividad para que confirme que le llegó.`}</Note>
    </Sheet>
  );
}

const x = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingLeft: 20, paddingRight: 18 },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  act: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 18, paddingBottom: 14 },
  amountIn: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  amountField: { minWidth: 160, fontSize: 44, letterSpacing: -1.3, textAlign: 'center', padding: 0 },
});

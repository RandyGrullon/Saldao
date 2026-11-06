import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  ago, budgetUse, byNewest, canEdit, cat, debts, expensePhotoPath, fdate, fday, friendBal, ftime, fundLeft, fundOf, getBackend, groupBal, groupDates,
  groupEnded, groupOf, groupUpcoming, involves, ledger, listOf, mineOf, moneyT, pairVal, pendingInfo, plural, recordPay, repeatText, run, sharedGroups,
  short, spent, splitText, toBase, type Id,
} from '@saldao/core';
import { pickPhoto } from '../lib/photo';
import { GroupPhoto, usePhotoUrl } from '../ui/photo';
import { buzz, errMsg, go } from '../lib/nav';
import { useS } from '../lib/store';
import { F, useC } from '../lib/theme';
import { A, Actions, Btn, Card, Empty, LinkBtn, List, Main, Note, Pill, Row, Sec, Section, StackScreen } from '../ui/base';
import { Icon } from '../ui/icons';
import { AnimMoney, Av, Avs, ExpRow, ItemStatus, Money, PayText, RowIc, useAct, useBalColor, WhyRow } from '../ui/kit';
import { H1, H2, Txt } from '../ui/text';
import { useToast } from '../ui/toast';
import { remind, XferRow } from './settle';

const Gone = ({ text }: { text: string }) => <StackScreen><Empty icon="receipt" title={text} /></StackScreen>;
const Day = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <View style={d.day}><Txt f="semi" s={13} c="muted">{title}</Txt>{right}</View>
);

export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useS(), c = useC(), bal = useBalColor(), toast = useToast(), g = groupOf(s, id);
  if (!g) return <Gone text="Este grupo ya no existe o saliste de él." />;
  const list = listOf(s, id).sort(byNewest), me = groupBal(s, id), dts = debts(s, id), bu = budgetUse(s, id), fund = fundOf(s, id);
  const people = g.members.filter(m => !s.profiles[m]?.fundOf), pendingItems = s.items.filter(i => i.groupId === id && !i.doneAt).length;
  const days = [...new Set(list.map(e => e.date))];
  return (
    <StackScreen right={<View style={{ flexDirection: 'row' }}><LinkBtn title="Invitar" icon="users" onPress={() => go.invite(id)} /><LinkBtn title="Ajustes" icon="edit" onPress={() => go.groupSettings(id)} /></View>}>
      <View style={d.head}>{g.photoPath ? <GroupPhoto g={g} size={64} /> : <Avs ids={people} size="head" ring={c.bg} />}<H1>{g.name}</H1>
        <Txt f="medium" s={15} c="muted">{plural(people.length, 'persona', 'personas')}{groupDates(g) ? ` · ${groupDates(g)}` : ''}{g.archivedAt ? ' · archivado' : ''}{g.simplify ? ' · deudas simplificadas' : ''}</Txt></View>
      {groupEnded(g) && <Section style={{ borderWidth: 1.5, borderColor: c.warn }}>
        <Txt f="displaySemi" s={16} color={c.warn}>Terminó el {fdate(g.endsOn!)}</Txt>
        <Txt s={15} c="muted">{dts.length ? 'Toca saldar las cuentas. Cuando todos estén a mano, archiva el grupo para que no estorbe en la lista.' : 'Todos están a mano: ya se puede archivar.'}</Txt>
        <Actions>
          {dts.length > 0 && <Btn title="Saldar" kind="primary" style={A.half} onPress={() => go.settle(id)} />}
          {g.roles[s.me] === 'admin' && <Btn title="Archivar" style={A.half} onPress={() => run(b => b.updateGroup(id, { archived: true })).then(() => { toast('Grupo archivado'); go.back(); }, e => toast(errMsg(e)))} />}
        </Actions>
      </Section>}
      {groupUpcoming(g) && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Pill>empieza el {fdate(g.startsOn!)}</Pill><Txt s={15} c="muted">Ya pueden ir anotando lo que se paga antes.</Txt></View>}
      <Section style={{ gap: 8 }}>
        <Txt s={15} c="muted">{me > 0 ? 'En este grupo te deben' : me < 0 ? 'En este grupo debes' : 'En este grupo estás a mano'}</Txt>
        <AnimMoney c={Math.abs(me)} sign={me > 0} color={me ? bal(me) : c.fg} />
        <Note>Gastado entre todos: {moneyT(spent(list))} · {dts.length ? plural(dts.length, 'deuda abierta', 'deudas abiertas') : 'nadie le debe a nadie'}</Note>
        {bu && <View style={[d.budget, { backgroundColor: c.surface2 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Txt s={14} c="muted">Presupuesto del mes</Txt>
            <Txt s={14} c="muted"><Money c={bu.spent} s={14} /> de <Money c={bu.budget} s={14} /></Txt></View>
          <View style={[d.track, { backgroundColor: c.line }]}><View style={[d.fill, { width: `${Math.min(100, bu.ratio * 100)}%`, backgroundColor: bu.ratio >= 1 ? c.danger : bu.ratio >= 0.8 ? c.warn : c.accent }]} /></View>
          {bu.ratio >= 0.8 && <Txt s={14} color={bu.ratio >= 1 ? c.danger : c.muted}>{bu.ratio >= 1 ? `Se pasaron por ${moneyT(bu.spent - bu.budget)}.` : `Van por el ${Math.round(bu.ratio * 100)} %: quedan ${moneyT(bu.budget - bu.spent)}.`}</Txt>}
        </View>}
        <Actions>
          <Btn title="Añadir gasto" icon="plus" kind="primary" size="lg" style={A.full} onPress={() => go.addExpense({ groupId: id })} />
          <Btn title="Saldar" size="lg" style={A.full} disabled={!dts.length} onPress={() => go.settle(id)} />
        </Actions>
      </Section>
      {fund && <Section>
        <H2>Fondo común</H2>
        <Txt f="semi">Quedan <Money c={fundLeft(s, id)} s={22} f="display" /></Txt>
        <Txt s={15} c="muted">Lo que se aportó menos lo que pagó el fondo.</Txt>
        <Actions>
          <Btn title="Aportar" kind="primary" size="sm" style={A.half} onPress={() => go.pay(fund, 0, id, true)} />
          <Btn title="Gasto del fondo" size="sm" style={A.half} onPress={() => go.addExpense({ groupId: id, payer: fund })} />
        </Actions>
      </Section>}
      <Card><Row onPress={() => go.list(id)} label="Lista de compras"><RowIc n="cart" tone="accent" />
        <Main><Txt f="semi">Lista de compras</Txt><Txt s={14} c="muted">{pendingItems ? plural(pendingItems, 'cosa por comprar', 'cosas por comprar') : 'No falta nada'}</Txt></Main>
        <Icon n="chevR" color={c.faint} /></Row></Card>
      {people.length < 2 && <Section><H2>Falta gente</H2><Txt s={15} c="muted">Invita a los demás con el enlace del grupo o agrégalos por nombre.</Txt>
        <Btn title="Invitar" icon="users" style={{ alignSelf: 'flex-start' }} onPress={() => go.invite(id)} /></Section>}
      {dts.length > 0 && <Sec title="Quién le debe a quién" hint="toca para ver por qué" />}
      {dts.length > 0 && <List>{dts.map(t => <XferRow key={t.from + t.to} t={t} groupId={id} />)}</List>}
      <Sec title="Gastos" hint={list.length ? 'desliza una fila para borrarla' : undefined} />
      {list.length ? days.map(day => (
        <View key={day} style={{ gap: 6 }}>
          <Day title={fday(day)} />
          <List>{list.filter(e => e.date === day).map(e => <ExpRow key={e.id} e={e} />)}</List>
        </View>
      )) : <Empty icon="receipt" title="Todavía no hay gastos">Toca «Añadir gasto» para anotar el primero.</Empty>}
    </StackScreen>
  );
}

export function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useS(), c = useC(), bal = useBalColor(), toast = useToast(), p = s.profiles[id];
  if (!p) return <Gone text="Ya no compartes grupos con esta persona." />;
  const { b, by } = friendBal(s, id), info = pendingInfo(s, id), gs = sharedGroups(s, s.me, id);
  const gotPaid = async () => {
    try {
      let ids: Id[] = [];
      await run(async be => { ids = await recordPay(be, s, id, s.me, b); });
      buzz(); toast(`Pago de ${short(s, id)} registrado`, () => { run(be => Promise.all(ids.map(x => be.deleteExpense(x)))).catch(e => toast(errMsg(e))); });
    } catch (e) { toast(errMsg(e)); }
  };
  const ledgers = gs.map(g => ({ g, its: ledger(s.me, id, listOf(s, g)) })).filter(x => x.its.length);
  return (
    <StackScreen>
      <View style={d.head}><Av id={id} size="lg" /><H1>{p.name}</H1>
        {p.deletedAt ? <Txt f="medium" s={15} c="muted">Borró su cuenta. Lo que compartieron sigue aquí.</Txt>
          : !p.userId ? <Txt f="medium" s={15} c="muted">Todavía no tiene cuenta: mándale el enlace del grupo.</Txt> : null}</View>
      <Section style={{ gap: 8 }}>
        <Txt s={15} c="muted">{b > 0 ? `${short(s, id)} te debe` : b < 0 ? `Le debes a ${short(s, id)}` : 'Están a mano'}</Txt>
        <AnimMoney c={Math.abs(b)} sign={b > 0} color={b ? bal(b) : c.fg} />
        {b !== 0 && info.n > 0 && <Note>{plural(info.n, 'gasto sin saldar', 'gastos sin saldar')}, el más viejo del {fday(info.since!).toLowerCase()}</Note>}
        {Object.keys(by).length > 1 && <View style={[d.breakdown, { borderTopColor: c.line }]}>{Object.entries(by).map(([g, x]) => (
          <View key={g} style={d.breakRow}><Txt s={15} c="muted">{groupOf(s, g)?.kind === 'directo' ? 'Entre ustedes dos' : groupOf(s, g)?.name}</Txt><Money c={x} sign s={15} /></View>))}</View>}
        <Actions>
          {b < 0 && <Btn title="Pagar" kind="primary" size="lg" style={A.full} onPress={() => go.pay(id, -b)} />}
          {b > 0 && <Btn title="Recordar" kind="primary" size="lg" style={A.full} onPress={() => remind(s, id, b)} />}
          {b > 0 && <Btn title="Me pagó" size="lg" style={A.half} onPress={gotPaid} />}
          {b > 0 && <Btn title="Mi QR" size="lg" style={A.half} onPress={() => go.qr(b, id)} />}
          <Btn title={b ? 'Gasto' : 'Añadir gasto'} icon="plus" kind={b ? 'default' : 'primary'} size="lg" style={b ? A.half : A.full} onPress={() => go.addExpense({ friendId: id })} />
        </Actions>
      </Section>
      {p.payout && <Section><H2>Dónde pagarle</H2><Txt f="semi" selectable>{p.payout}</Txt>
        <Btn title="Copiar" icon="copy" size="sm" style={{ alignSelf: 'flex-start' }}
          onPress={() => Clipboard.setStringAsync(p.payout!).then(() => toast('Cuenta copiada'), () => toast('No se pudo copiar'))} /></Section>}
      <Sec title="Por qué" />
      <Note>Con + {short(s, id)} te debe más; con − le debes tú o ya te pagó. Toca un renglón para ver el gasto.</Note>
      {ledgers.map(({ g, its }) => {
        const sum = its.reduce((a, it) => a + it.x, 0), grp = groupOf(s, g)!;
        return (
          <View key={g} style={{ gap: 6 }}>
            <Day title={grp.kind === 'directo' ? 'Entre ustedes dos' : grp.name} right={sum ? <Money c={sum} sign s={13} /> : <Txt f="semi" s={13} c="muted">a mano</Txt>} />
            <List inset={12}>{[...its].reverse().map(it => <WhyRow key={it.e.id} it={it} a={s.me} b={id} />)}</List>
          </View>
        );
      })}
      {!ledgers.length && <Empty icon="receipt" title="Todavía no comparten gastos" />}
    </StackScreen>
  );
}

export function ExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useS(), c = useC(), act = useAct(), toast = useToast(), e = s.expenses.find(x => x.id === id);
  const [text, setText] = useState('');
  if (!e) return <Gone text="Este gasto ya no existe." />;
  const ct = cat(e.category), g = groupOf(s, e.groupId), m = mineOf(s, e);
  const people = [...new Set([...Object.keys(e.payers), ...Object.keys(e.shares)])];
  const owner = Object.keys(e.payers).length === 1 ? Object.keys(e.payers)[0] : null;
  const editable = canEdit(s, e);
  const comments = s.comments.filter(x => x.expenseId === id);
  const you = e.isPayment ? null : m > 0 ? `Te deben ${moneyT(m)} por este gasto.` : m < 0 ? `Tu parte: ${moneyT(-m)}${owner && owner !== s.me ? `, se la debes a ${short(s, owner)}` : ''}.`
    : involves(e, s.me) ? 'Pagaste justo lo tuyo.' : 'No participas en este gasto.';
  const recipient = e.isPayment ? Object.keys(e.shares)[0] : null;
  const send = async () => {
    const t = text.trim(); if (!t) return;
    setText('');
    try { await run(b => b.addComment(id, t)); buzz(); } catch (err) { setText(t); toast(errMsg(err)); }
  };
  const sub = e.items ? e.items.reduce((a, i) => a + i.price, 0) : 0;
  return (
    <StackScreen right={editable && !e.deletedAt && !e.isPayment ? <LinkBtn title="Editar" icon="edit" onPress={() => go.addExpense({ edit: id })} /> : undefined}>
      <View style={d.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Icon n={ct.icon} sm color={c.muted} /><Txt f="medium" s={15} c="muted">{ct.name} · {fday(e.date)}{g && g.kind !== 'directo' ? ` · ${g.name}` : ''}</Txt>
        </View>
        <H1>{e.isPayment ? <PayText s={s} e={e} /> : e.description}</H1>
        <Money c={e.amount} cur={e.currency} s={40} f="display" />
        {e.currency !== 'DOP' && <Note>Equivale a {moneyT(toBase(e).total)} · US$ 1 = RD$ {e.fxRate.toFixed(2)} ese día</Note>}
        {e.pending && <Status pill={<Pill>sin enviar</Pill>} text="Guardado en este teléfono: se envía solo cuando haya conexión." />}
        {e.repeat && !e.deletedAt && <View style={{ gap: 4 }}><Status pill={<Pill tone="ok">{repeatText(e.repeat).toLowerCase()}</Pill>} text="Se anota solo cuando toca." />
          {editable && <LinkBtn title="Dejar de repetir" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => act(b => b.saveExpense({ ...e, repeat: null }), 'Ya no se repite')} />}</View>}
        {e.repeatFrom && <Status pill={<Pill>repetido</Pill>} text={`Se anotó solo, como ${s.expenses.find(x => x.id === e.repeatFrom) ? `«${s.expenses.find(x => x.id === e.repeatFrom)!.description}»` : 'el original'}.`} />}
        {e.deletedAt && <Status pill={<Pill tone="warn">borrado</Pill>} text="No cuenta en los saldos." />}
        {e.isPayment && e.paymentStatus === 'pendiente' && !e.deletedAt && <Status pill={<Pill tone="warn">por confirmar</Pill>}
          text={recipient === s.me ? 'Confirma si te llegó.' : `${short(s, recipient!)} todavía no confirma que le llegó.`} />}
        {e.isPayment && e.paymentStatus === 'confirmado' && <Status pill={<Pill tone="ok">confirmado</Pill>} text={e.splitParams.method === 'efectivo' ? 'En efectivo.' : 'Por transferencia.'} />}
      </View>
      {e.isPayment && e.paymentStatus === 'pendiente' && recipient === s.me && !e.deletedAt &&
        <Btn title="Sí, me llegó" icon="check" kind="primary" size="lg" onPress={() => act(b => b.confirmPayment(id), 'Pago confirmado')} />}
      {e.deletedAt && editable && <Btn title="Restaurar" kind="primary" size="lg" onPress={() => act(b => b.restoreExpense(id), 'Restaurado')} />}
      <Section>
        <H2>{e.isPayment ? 'Detalle' : 'Quién pagó y cuánto le toca'}</H2>
        {!e.isPayment && <Note>{splitText(e, k => short(s, k))}</Note>}
        <View>{people.map((k, i) => {
          const xv = k === s.me || e.isPayment ? 0 : pairVal(e, s.me, k);
          const it = xv ? ledger(s.me, k, listOf(s, e.groupId)).find(l => l.e.id === e.id) : undefined;
          return (
            <View key={k} style={[d.share, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.line }]}>
              <Av id={k} />
              <Main>
                <Txt f="semi">{k === s.me ? 'Tú' : s.profiles[k]?.name}</Txt>
                {e.payers[k] != null && <Txt s={14} c="muted">pagó {moneyT(e.payers[k], e.currency)}</Txt>}
                {xv !== 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Txt s={14} c="muted">{xv > 0 ? `te debe ${moneyT(xv)}` : `le debes ${moneyT(-xv)}`}</Txt>{it && <ItemStatus it={it} />}</View>}
              </Main>
              {e.isPayment ? <Txt c="muted">{e.payers[k] ? 'envió' : 'recibió'}</Txt> : <Money c={e.shares[k] || 0} cur={e.currency} />}
            </View>
          );
        })}</View>
        {you && <View style={[d.you, { backgroundColor: c.accentSoft }]}><Txt f="semi" c="accentInk">{you}</Txt></View>}
      </Section>
      {e.items && <Section>
        <H2>Recibo</H2>
        <View>{e.items.map((it, i) => (
          <View key={i} style={[d.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.line }]}>
            <Main gap={6}><Txt f="semi">{it.name}</Txt><Avs ids={it.to} /></Main><Money c={it.price} cur={e.currency} />
          </View>))}</View>
        <Totals cur={e.currency} rows={[['Subtotal', sub], ...(e.tax > 0 ? [[`ITBIS ${e.tax} %`, Math.round(sub * e.tax / 100)] as [string, number]] : []),
          ...(e.tip > 0 ? [[`Ley ${e.tip} %`, Math.round(sub * e.tip / 100)] as [string, number]] : [])]} total={e.amount} />
      </Section>}
      {e.note && <Section><H2>Nota</H2><Txt selectable>{e.note}</Txt></Section>}
      <ReceiptPhoto id={e.id} groupId={e.groupId} path={e.photoPath ?? null} editable={editable && !e.deletedAt} />
      <Section>
        <H2>Comentarios</H2>
        {comments.length ? <View style={{ gap: 14 }}>{comments.map(x => (
          <View key={x.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Av id={x.profileId} size="sm" />
            <View style={{ flex: 1 }}><Txt s={13} c="muted">{short(s, x.profileId)} · {x.pending ? 'sin enviar' : ago(x.createdAt)}</Txt><Txt selectable>{x.body}</Txt></View>
          </View>))}</View> : <Note>Todavía nadie comenta.</Note>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={text} onChangeText={setText} placeholder="Escribe un comentario" placeholderTextColor={c.faint} maxLength={1000}
            returnKeyType="send" onSubmitEditing={send} accessibilityLabel="Comentario"
            style={[d.composer, { borderColor: c.line, backgroundColor: c.bg, color: c.fg, fontFamily: F.regular }]} />
          <Pressable onPress={send} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel="Enviar comentario"
            style={[d.send, { backgroundColor: c.accent, opacity: text.trim() ? 1 : 0.45 }]}><Icon n="send" color={c.accentFg} /></Pressable>
        </View>
      </Section>
      <Txt s={13} c="muted" center>{e.createdBy === s.me ? 'Lo añadiste tú' : `Lo añadió ${short(s, e.createdBy)}`} el {fdate(e.createdAt)} a las {ftime(e.createdAt)}</Txt>
      {editable && !e.deletedAt && <Btn title={`Eliminar ${e.isPayment ? 'pago' : 'gasto'}`} icon="trash" kind="danger" size="lg"
        onPress={() => { go.back(); act(b => b.deleteExpense(id), e.isPayment ? 'Pago eliminado' : 'Gasto eliminado', b => b.restoreExpense(id)); }} />}
    </StackScreen>
  );
}

const Status = ({ pill, text }: { pill: React.ReactNode; text: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{pill}<Txt s={15} c="muted" style={{ flexShrink: 1 }}>{text}</Txt></View>
);

export function Totals({ rows, total, cur }: { rows: [string, number][]; total: number; cur: string }) {
  const c = useC();
  return (
    <View style={[d.totals, { borderTopColor: c.line }]}>
      {rows.map(([k, v]) => <View key={k} style={d.tRow}><Txt s={15} c="muted">{k}</Txt><Money c={v} cur={cur} s={15} color={c.muted} /></View>)}
      <View style={d.tRow}><Txt f="semi" s={17}>Total</Txt><Money c={total} cur={cur} s={17} /></View>
    </View>
  );
}

/** La foto del comprobante: verla, cambiarla o quitarla. */
function ReceiptPhoto({ id, groupId, path, editable }: { id: Id; groupId: Id; path: string | null; editable: boolean }) {
  const toast = useToast(), url = usePhotoUrl(path);
  const [busy, setBusy] = useState(false);
  if (!path && !editable) return null;
  const change = async () => {
    try {
      const p = await pickPhoto(); if (!p) return;
      setBusy(true);
      const np = expensePhotoPath(groupId, id), b = getBackend()!;
      await run(async () => { await b.uploadPhoto(np, { data: p.data, type: 'image/jpeg', uri: p.uri }); await b.setExpensePhoto(id, np); });
      buzz(); toast('Foto guardada');
    } catch (e) { toast(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Section>
      <H2>Comprobante</H2>
      {path ? (url ? <Image source={{ uri: url }} style={d.receipt} resizeMode="contain" accessibilityLabel="Foto del comprobante" /> : <Note>Cargando la foto…</Note>)
        : <Note>La factura o la captura de la transferencia, para que nadie tenga dudas.</Note>}
      {editable && <Actions>
        <Btn title={busy ? 'Subiendo…' : path ? 'Cambiar foto' : 'Agregar foto'} icon="plus" size="sm" disabled={busy} onPress={change} />
        {path && <Btn title="Quitar" size="sm" disabled={busy} onPress={() => run(b => b.setExpensePhoto(id, null)).then(() => toast('Foto quitada'), err => toast(errMsg(err)))} />}
      </Actions>}
    </Section>
  );
}

export { Card };
const d = StyleSheet.create({
  head: { gap: 6, paddingTop: 4, paddingBottom: 2 },
  day: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 6, marginHorizontal: 4 },
  breakdown: { gap: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  share: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  you: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 12 },
  totals: { gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  budget: { gap: 6, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  receipt: { width: '100%', height: 360, borderRadius: 16 },
  composer: { flex: 1, minHeight: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

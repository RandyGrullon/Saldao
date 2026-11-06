import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState, type ReactNode } from 'react';
import { DevSettings, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ago, APP, canEdit, fdate, friendBal, friends, groupBal, groupOf, moneyT, myTotals, pendingInfo, plural, PRIVACY_URL, run, short, TERMS_URL,
  typedUser, USERNAME, USERNAME_RULE, visibleGroups, type Activity, type Group, type Snapshot,
} from '@saldao/core';
import { DEMO } from '../lib/connect';
import { buzz, errMsg, go } from '../lib/nav';
import { useS, useSync } from '../lib/store';
import { SIZE, useC, useTheme, type ThemeMode } from '../lib/theme';
import { useUnread } from '../lib/unread';
import { A, Actions, Btn, Card, Empty, Field, Label, LinkBtn, List, Main, Note, Row, Sec, Section, Seg, SplitStatus, TabScreen, TitleRow } from '../ui/base';
import { Icon, type IconName } from '../ui/icons';
import { AnimMoney, Av, BalText, Finding, Impact, Money, PayText, RowIc, useAct, useBalColor } from '../ui/kit';
import { B, H2, Txt } from '../ui/text';
import { useToast } from '../ui/toast';

const KIND: Record<string, string> = { casa: 'Casa', viaje: 'Viaje', pareja: 'Pareja', otro: 'Grupo', directo: 'Entre dos' };
const KIND_IC: Record<string, IconName> = { casa: 'home', viaje: 'compass', pareja: 'heart', otro: 'users', directo: 'swap' };

export function GroupRow({ g }: { g: Group }) {
  const s = useS();
  return (
    <Row onPress={() => go.group(g.id)} label={g.name}>
      <RowIc n={KIND_IC[g.kind]} tone="accent" />
      <Main><Txt f="semi" lines={1}>{g.name}</Txt><Txt s={14} c="muted">{KIND[g.kind]} · {plural(g.members.length, 'persona', 'personas')}</Txt></Main>
      <BalText c={groupBal(s, g.id)} />
    </Row>
  );
}

function FirstRun() {
  return (
    <Empty icon="users" title="Empieza con un grupo" action={<Btn title="Crear grupo" icon="plus" kind="primary" size="lg" onPress={go.newGroup} />}>
      El apartamento, el viaje, la pareja. Anota los gastos y {APP.name} te dice quién le debe a quién, por qué y desde cuándo.
    </Empty>
  );
}

const DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const todayLabel = (d = new Date()) => `${DIA[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}`;

export function Home() {
  const s = useS(), c = useC(), bal = useBalColor();
  const t = myTotals(s);
  const people = friends(s).map(p => ({ p, b: friendBal(s, p).b, i: pendingInfo(s, p) })).sort((a, b) => b.b - a.b);
  const top = people[0]?.b > 0 ? people[0] : null;
  const owe = people.filter(x => x.b < 0).sort((a, b) => a.b - b.b)[0];
  const groups = visibleGroups(s);
  return (
    <TabScreen>
      <TitleRow sub={todayLabel()} title={`Hola, ${s.profiles[s.me].name.split(' ')[0]}`}
        right={<Pressable onPress={() => go.tab('cuenta')} accessibilityRole="button" accessibilityLabel="Tu cuenta" style={[h.round, { backgroundColor: c.surface }]}><Av id={s.me} size="sm" /></Pressable>} />
      {!groups.length && !people.length ? <FirstRun /> : null}
      {groups.length || people.length ? (
        <Section style={{ gap: 8 }}>
          <Txt s={15} c="muted">{t.net > 0 ? 'En total te deben' : t.net < 0 ? 'En total debes' : 'Estás a mano con todo el mundo'}</Txt>
          <View style={{ marginTop: 2, marginBottom: 4 }}><AnimMoney c={Math.abs(t.net)} sign={t.net > 0} color={bal(t.net) === c.muted ? c.fg : bal(t.net)} /></View>
          <View style={h.split2}>
            <View style={h.half}><Txt s={15} c="muted">Te deben</Txt><Money c={t.owed} s={17} f="display" color={c.ok} /></View>
            <View style={[h.divider, { backgroundColor: c.line }]} />
            <View style={[h.half, { paddingLeft: 18 }]}><Txt s={15} c="muted">Debes</Txt><Money c={t.owe} s={17} f="display" color={c.danger} /></View>
          </View>
          {(top || owe) && <Finding>
            {top && <><B>{short(s, top.p)}</B> es quien más te debe: {moneyT(top.b)}{top.i.since ? `, sin saldar desde el ${fdate(top.i.since)}` : ''}. </>}
            {owe && <>A quien más le debes es a <B>{short(s, owe.p)}</B>: {moneyT(-owe.b)}.</>}
          </Finding>}
          <Actions>
            <Btn title="Añadir gasto" icon="plus" kind="primary" size="lg" style={A.full} onPress={() => go.addExpense()} />
            <Btn title="Saldar cuentas" size="lg" style={A.full} disabled={!t.owed && !t.owe} onPress={() => go.settle()} />
          </Actions>
        </Section>
      ) : null}
      {people.length > 0 && <Sec title="Personas" hint="toca para ver por qué" />}
      {people.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SIZE.gut }} contentContainerStyle={{ gap: 12, paddingHorizontal: SIZE.gut }}
          snapToInterval={184} decelerationRate="fast">
          {people.map(x => (
            <Pressable key={x.p} onPress={() => go.person(x.p)} accessibilityRole="button" accessibilityLabel={s.profiles[x.p]?.name}
              style={({ pressed }) => [h.tile, { backgroundColor: c.surface, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              <View style={{ marginBottom: 10 }}><Av id={x.p} /></View>
              <Txt f="semi" lines={1}>{short(s, x.p)}</Txt>
              <Txt s={13} c="muted">{x.b > 0 ? 'te debe' : x.b < 0 ? 'le debes' : 'están a mano'}</Txt>
              {x.b ? <Money c={Math.abs(x.b)} sign={x.b > 0} s={18} f="display" color={bal(x.b)} fit={12.5} /> : null}
              <Txt s={12} c="muted" style={{ marginTop: 8 }}>{x.i.n ? `${plural(x.i.n, 'gasto', 'gastos')} sin saldar · desde ${fdate(x.i.since!)}` : 'todo saldado'}</Txt>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {groups.length > 0 && <Sec title="Grupos" link={{ title: 'Ver todos', onPress: () => go.tab('grupos') }} />}
      {groups.length > 0 && <List>{groups.slice(0, 4).map(g => <GroupRow key={g.id} g={g} />)}</List>}
      {s.activity.length > 0 && <Sec title="Reciente" link={{ title: 'Actividad', onPress: () => go.tab('actividad') }} />}
      {s.activity.length > 0 && <List>{s.activity.slice(0, 4).map(a => <EvRow key={a.id} a={a} />)}</List>}
    </TabScreen>
  );
}

export function Groups() {
  const s = useS();
  const duo = friends(s).filter(p => s.groups.some(g => g.kind === 'directo' && g.members.includes(p)));
  const groups = visibleGroups(s);
  return (
    <TabScreen>
      <TitleRow title="Grupos" right={<Btn title="Nuevo" icon="plus" kind="soft" size="sm" onPress={go.newGroup} />} />
      {groups.length ? <List>{groups.map(g => <GroupRow key={g.id} g={g} />)}</List> : <FirstRun />}
      {duo.length > 0 && <Sec title="Entre dos" />}
      {duo.length > 0 && <List>{duo.map(p => {
        const d = s.groups.find(g => g.kind === 'directo' && g.members.includes(p))!;
        return (
          <Row key={p} onPress={() => go.person(p)} label={s.profiles[p].name}>
            <Av id={p} />
            <Main><Txt f="semi" lines={1}>{s.profiles[p].name}</Txt><Txt s={14} c="muted">Gastos entre ustedes dos</Txt></Main>
            <BalText c={friendBal(s, p).by[d.id] || 0} who />
          </Row>
        );
      })}</List>}
    </TabScreen>
  );
}

function evText(s: Snapshot, a: Activity): ReactNode {
  const who = <B>{a.actor === s.me ? 'Tú' : short(s, a.actor)}</B>;
  const e = a.expenseId ? s.expenses.find(x => x.id === a.expenseId) : undefined;
  const desc = `«${e?.description ?? (a.payload.descripcion as string) ?? 'un gasto'}»`;
  const g = groupOf(s, a.groupId), where = g && g.kind !== 'directo' ? ` en ${g.name}` : '';
  const me = a.actor === s.me;
  switch (a.verb) {
    case 'grupo_creado': return <>{who} {me ? 'creaste' : 'creó'} el grupo{where}</>;
    case 'miembro_agregado': return <>{who} {me ? 'agregaste' : 'agregó'} a {String(a.payload.nombre ?? 'alguien')}{where}</>;
    case 'se_unio': return <>{who} {me ? 'te uniste' : 'se unió'}{where}</>;
    case 'gasto_creado': return <>{who} {me ? 'añadiste' : 'añadió'} {desc}{where}</>;
    case 'gasto_editado': {
      const an = a.payload.antes as { monto?: number; moneda?: string } | undefined, de = a.payload.despues as { monto?: number; moneda?: string } | undefined;
      const changed = an && de && an.monto !== de.monto ? `: el monto pasó de ${moneyT(Number(an.monto), an.moneda)} a ${moneyT(Number(de.monto), de.moneda)}` : '';
      return <>{who} {me ? 'editaste' : 'editó'} {desc}{where}{changed}</>;
    }
    case 'gasto_borrado': return <>{who} {me ? 'borraste' : 'borró'} {desc}{where}</>;
    case 'gasto_restaurado': return <>{who} {me ? 'restauraste' : 'restauró'} {desc}{where}</>;
    case 'pago_registrado': return e ? <><PayText s={s} e={e} /> {moneyT(e.amount)}{where}</> : <>{who} registró un pago</>;
    case 'pago_confirmado': return <>{who} {me ? 'confirmaste' : 'confirmó'} que le llegó el pago{where}</>;
    case 'comentario': return <>{who} {me ? 'comentaste' : 'comentó'} en {desc}: “{String(a.payload.texto ?? '')}”</>;
  }
}

export function EvRow({ a, fresh }: { a: Activity; fresh?: boolean }) {
  const s = useS(), c = useC(), act = useAct();
  const e = a.expenseId ? s.expenses.find(x => x.id === a.expenseId) : undefined;
  const pendingForMe = e?.isPayment && !e.deletedAt && e.paymentStatus === 'pendiente' && e.shares[s.me] != null;
  const restorable = a.verb === 'gasto_borrado' && !!e?.deletedAt && canEdit(s, e);
  const live = !!e && !e.deletedAt;
  return (
    <Row onPress={live ? () => go.expense(e!.id) : undefined} style={fresh ? { backgroundColor: c.isDark ? 'rgba(37,46,18,0.45)' : 'rgba(234,246,207,0.6)' } : undefined}>
      <Av id={a.actor} />
      <Main>
        <Txt f="semi">{evText(s, a)}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Txt s={14} c="muted">{ago(a.createdAt)}</Txt>{fresh && <View style={[h.newPill, { backgroundColor: c.surface2 }]}><Txt f="semi" s={12} c="muted">nuevo</Txt></View>}</View>
      </Main>
      {pendingForMe ? <Btn title="Confirmar" kind="primary" size="sm" onPress={() => act(b => b.confirmPayment(e!.id), 'Pago confirmado')} />
        : restorable ? <Btn title="Restaurar" size="sm" onPress={() => act(b => b.restoreExpense(e!.id), 'Gasto restaurado')} />
        : live && (a.verb === 'gasto_creado' || a.verb === 'pago_registrado') ? <Impact e={e!} /> : null}
    </Row>
  );
}

export function ActivityTab() {
  const s = useS(), unread = useUnread(s);
  // al mirar la pestaña, lo nuevo deja de serlo (después de un momento, para que se alcance a ver qué era)
  useFocusEffect(useCallback(() => { const t = setTimeout(unread.markSeen, 1500); return () => clearTimeout(t); }, [s])); // eslint-disable-line react-hooks/exhaustive-deps
  const toConfirm = s.expenses.filter(e => e.isPayment && !e.deletedAt && e.paymentStatus === 'pendiente' && e.shares[s.me] != null);
  return (
    <TabScreen>
      <TitleRow title="Actividad" />
      {toConfirm.length > 0 && <Note><B>{plural(toConfirm.length, 'pago espera', 'pagos esperan')}</B> que confirmes que te llegaron.</Note>}
      {s.activity.length ? <List>{s.activity.map(a => <EvRow key={a.id} a={a} fresh={a.actor !== s.me && a.createdAt > unread.seen} />)}</List>
        : <Empty icon="bell" title="Todavía no hay movimiento">Aquí verás cada gasto, pago y comentario de tus grupos.</Empty>}
    </TabScreen>
  );
}

const openPage = (path: string) => WebBrowser.openBrowserAsync(`${APP.site}${path}`).catch(() => {});

export function Account() {
  const s = useS(), c = useC(), toast = useToast(), me = s.profiles[s.me];
  const { mode, setMode } = useTheme();
  const [name, setName] = useState(me.name);
  const [payout, setPayout] = useState(me.payout ?? '');
  const [username, setUsername] = useState(me.username ?? '');
  const [busy, setBusy] = useState(false);
  const { pending } = useSync();
  const [sure, setSure] = useState(false);
  const userOk = !username || USERNAME.test(username);
  const dirty = name.trim() !== me.name || payout.trim() !== (me.payout ?? '') || username !== (me.username ?? '');
  const save = async () => {
    setBusy(true);
    try { await run(b => b.updateProfile({ name: name.trim(), payout: payout.trim(), username })); buzz(); toast('Guardado'); }
    catch (e) { toast(errMsg(e)); } finally { setBusy(false); }
  };
  const signOut = () => {
    if (pending && !DEMO && !sure) { setSure(true); return; } // primero avisa: lo pendiente solo está en este teléfono
    if (DEMO) { if (Platform.OS === 'web') location.reload(); else DevSettings.reload(); return; }
    run(b => b.signOut()).catch(e => toast(errMsg(e)));
  };
  return (
    <TabScreen>
      <TitleRow title="Cuenta" />
      <Card pad style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Av id={s.me} size="lg" />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt f="display" s={19} lines={2}>{me.name}</Txt>
          {me.username ? <Txt s={15} c="muted">@{me.username}</Txt> : null}
          {me.email ? <Txt s={15} c="muted" lines={1}>{me.email}</Txt> : null}
        </View>
      </Card>
      <Section>
        <Label title="Tu nombre"><Field inCard value={name} maxLength={80} onChangeText={setName} autoComplete="name" textContentType="name" returnKeyType="next" /></Label>
        <Label title="Usuario"><Field inCard value={username} maxLength={20} onChangeText={v => setUsername(typedUser(v))} placeholder="Para entrar sin escribir tu correo"
          autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" /></Label>
        {!userOk && <Txt f="medium" s={15} c="danger">{USERNAME_RULE}</Txt>}
        <Label title="Dónde te pagan"><Field inCard multiline value={payout} maxLength={200} onChangeText={setPayout} placeholder="Ej.: Banco Popular · ahorro · 123456789 · a nombre de …" /></Label>
        <Note>Lo ve la gente de tus grupos cuando te va a pagar, con un botón para copiarlo.</Note>
        <Btn title={busy ? 'Guardando…' : 'Guardar'} kind="primary" disabled={!dirty || !name.trim() || !userOk || busy} onPress={save} />
      </Section>
      <List>
        <View style={{ paddingVertical: 18, paddingHorizontal: 20, gap: 10 }}>
          <Txt f="semi">Tema</Txt>
          <Seg<ThemeMode> label="Tema" value={mode} onChange={m => { setMode(m); buzz(); }}
            options={[['dark', 'De noche'], ['light', 'Claro'], ['auto', 'Auto']]} />
        </View>
        <Pref k="Moneda principal" v="Peso dominicano (RD$)" />
        <Pref k="Idioma" v="Español" />
      </List>
      <List>
        <Row onPress={() => openPage(TERMS_URL)}><RowIc n="receipt" /><Main><Txt f="semi">Términos de uso</Txt></Main><Icon n="chevR" color={c.faint} /></Row>
        <Row onPress={() => openPage(PRIVACY_URL)}><RowIc n="eye" /><Main><Txt f="semi">Política de privacidad</Txt></Main><Icon n="chevR" color={c.faint} /></Row>
      </List>
      {sure ? <SplitStatus ok={false}>Tienes {plural(pending, 'cambio', 'cambios')} sin enviar. Si sales ahora, se pierden.</SplitStatus> : null}
      <Btn title={DEMO ? 'Reiniciar demostración' : sure ? 'Salir igual' : 'Cerrar sesión'} icon="out" kind="danger" size="lg" onPress={signOut} />
      {!DEMO ? <LinkBtn title="Borrar mi cuenta" color={c.danger} style={{ alignSelf: 'center' }} onPress={go.deleteAccount} /> : null}
      {DEMO ? <Txt s={13} c="muted" center>Modo demostración: personas, montos y cuentas son de ejemplo y nada se guarda.</Txt> : null}
    </TabScreen>
  );
}

function Pref({ k, v }: { k: string; v: string }) {
  return <View style={h.pref}><Txt f="semi">{k}</Txt><Txt c="muted" style={{ textAlign: 'right', flexShrink: 1 }}>{v}</Txt></View>;
}

export { H2 };
const h = StyleSheet.create({
  round: { width: SIZE.touch, height: SIZE.touch, borderRadius: SIZE.touch / 2, alignItems: 'center', justifyContent: 'center' },
  split2: { flexDirection: 'row', alignItems: 'stretch', marginTop: 6, marginHorizontal: -4 },
  half: { flex: 1, gap: 4, paddingVertical: 6, paddingHorizontal: 4, minWidth: 0 },
  divider: { width: StyleSheet.hairlineWidth * 2, marginVertical: 6 },
  tile: { width: 172, padding: 16, borderRadius: 20, gap: 2 },
  newPill: { height: 22, paddingHorizontal: 8, borderRadius: 999, justifyContent: 'center' },
  pref: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: SIZE.row, paddingVertical: 10, paddingLeft: 20, paddingRight: 18 },
});

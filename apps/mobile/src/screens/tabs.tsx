import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { DevSettings, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import {
  ago, APP, archivedGroups, canEdit, exportCsv, exportHtml, exportName, fdate, friendBal, friends, groupBal, groupDates, groupEnded, groupOf, monthName,
  monthStats, moneyT, myTotals, overdue, pendingInfo, plural, PRIVACY_URL, run, short, TERMS_URL, thisMonth, typedUser, USERNAME, USERNAME_RULE,
  visibleGroups, type Activity, type Group, type Snapshot,
} from '@saldao/core';
import { shareCsv, sharePdf } from '../lib/files';
import { disableLock, enableLock, lockOn, lockSupported } from '../lib/lock';
import { disablePush, enablePush, pushOn, pushUnavailable } from '../lib/push';
import { GroupPhoto, KIND_IC } from '../ui/photo';
import { remind } from './settle';
import { DEMO } from '../lib/connect';
import { buzz, errMsg, go } from '../lib/nav';
import { useS, useSync } from '../lib/store';
import { SIZE, useC, useTheme, type ThemeMode } from '../lib/theme';
import { useUnread } from '../lib/unread';
import { A, Actions, Btn, Card, Empty, Field, Label, LinkBtn, List, Main, Note, Row, Sec, Section, Seg, SplitStatus, TabScreen, TitleRow } from '../ui/base';
import { Icon } from '../ui/icons';
import { AnimMoney, Av, BalText, Finding, Impact, Money, PayText, RowIc, useAct, useBalColor } from '../ui/kit';
import { B, H2, Txt } from '../ui/text';
import { useToast } from '../ui/toast';
import { getLang, LANGS, longToday, tr, type Lang } from '@saldao/core';
import { changeLang } from '../lib/lang';

const KIND: Record<string, string> = { casa: 'Casa', viaje: 'Viaje', pareja: 'Pareja', otro: 'Grupo', directo: 'Entre dos' };
export function GroupRow({ g }: { g: Group }) {
  const s = useS();
  const n = g.members.filter(m => !s.profiles[m]?.fundOf).length, dates = groupDates(g);
  return (
    <Row onPress={() => go.group(g.id)} label={g.name}>
      {g.photoPath ? <GroupPhoto g={g} size={40} /> : <RowIc n={KIND_IC[g.kind]} tone="accent" />}
      <Main><Txt f="semi" lines={1}>{g.name}</Txt>
        <Txt s={14} c="muted" lines={1}>{dates ? `${dates}${groupEnded(g) ? tr(" · terminó") : ''}` : `${tr(KIND[g.kind])} · ${plural(n, tr("persona"), tr("personas"))}`}</Txt></Main>
      <BalText c={groupBal(s, g.id)} />
    </Row>
  );
}

function FirstRun() {
  return (
    <Empty icon="users" title={tr("Empieza con un grupo")} action={<Btn title={tr("Crear grupo")} icon="plus" kind="primary" size="lg" onPress={go.newGroup} />}>{tr("El apartamento, el viaje, la pareja. Anota los gastos y {0} te dice quién le debe a quién, por qué y desde cuándo.", APP.name)}</Empty>
  );
}

const todayLabel = () => longToday();

export function Home() {
  const s = useS(), c = useC(), bal = useBalColor();
  const t = myTotals(s);
  const people = friends(s).map(p => ({ p, b: friendBal(s, p).b, i: pendingInfo(s, p) })).sort((a, b) => b.b - a.b);
  const top = people[0]?.b > 0 ? people[0] : null;
  const owe = people.filter(x => x.b < 0).sort((a, b) => a.b - b.b)[0];
  const groups = visibleGroups(s), late = overdue(s), month = monthStats(s);
  return (
    <TabScreen>
      <TitleRow sub={todayLabel()} title={tr("Hola, {0}", s.profiles[s.me].name.split(' ')[0])}
        right={<Pressable onPress={() => go.tab('cuenta')} accessibilityRole="button" accessibilityLabel={tr("Tu cuenta")} style={[h.round, { backgroundColor: c.surface }]}><Av id={s.me} size="sm" /></Pressable>} />
      {!groups.length && !people.length ? <FirstRun /> : null}
      {groups.length || people.length ? (
        <Section style={{ gap: 8 }}>
          <Txt s={15} c="muted">{t.net > 0 ? tr("En total te deben") : t.net < 0 ? tr("En total debes") : tr("Estás a mano con todo el mundo")}</Txt>
          <View style={{ marginTop: 2, marginBottom: 4 }}><AnimMoney c={Math.abs(t.net)} sign={t.net > 0} color={bal(t.net) === c.muted ? c.fg : bal(t.net)} /></View>
          <View style={h.split2}>
            <View style={h.half}><Txt s={15} c="muted">{tr("Te deben")}</Txt><Money c={t.owed} s={17} f="display" color={c.ok} /></View>
            <View style={[h.divider, { backgroundColor: c.line }]} />
            <View style={[h.half, { paddingLeft: 18 }]}><Txt s={15} c="muted">{tr("Debes")}</Txt><Money c={t.owe} s={17} f="display" color={c.danger} /></View>
          </View>
          {(top || owe) && <Finding>
            {top && <><B>{short(s, top.p)}</B>{" "}{tr("es quien más te debe: {0}{1}.", moneyT(top.b), top.i.since ? tr(", sin saldar desde el {0}", fdate(top.i.since)) : '')}{" "}</>}
            {owe && <>{tr("A quien más le debes es a")}{" "}<B>{short(s, owe.p)}</B>: {moneyT(-owe.b)}.</>}
          </Finding>}
          <Actions>
            <Btn title={tr("Añadir gasto")} icon="plus" kind="primary" size="lg" style={A.full} onPress={() => go.addExpense()} />
            <Btn title={tr("Saldar cuentas")} size="lg" style={A.full} disabled={!t.owed && !t.owe} onPress={() => go.settle()} />
          </Actions>
        </Section>
      ) : null}
      {late.length > 0 && <Section>
        <H2>{tr("Para cobrar")}</H2>
        {late.slice(0, 3).map(x => (
          <View key={x.p} style={h.late}><Av id={x.p} size="sm" />
            <Main><Txt f="semi">{tr("{0} te debe {1}", short(s, x.p), moneyT(x.amount))}</Txt><Txt s={14} c="muted">{tr("sin saldar hace {0} días", x.days)}</Txt></Main>
            <Btn title={tr("Recordar")} size="sm" onPress={() => remind(s, x.p, x.amount)} /></View>))}
      </Section>}
      {(groups.length > 0 || people.length > 0) && <Card><Row onPress={go.summary} label={tr("Resumen del mes")}><RowIc n="cal" tone="accent" />
        <Main><Txt f="semi">{tr("Tu {0}", monthName(thisMonth()).split(' ')[0])}</Txt><Txt s={14} c="muted">{tr("Tu parte de lo gastado: {0}", moneyT(month.total))}</Txt></Main>
        <Icon n="chevR" color={c.faint} /></Row></Card>}
      {people.length > 0 && <Sec title={tr("Personas")} hint={tr("toca para ver por qué")} />}
      {people.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SIZE.gut }} contentContainerStyle={{ gap: 12, paddingHorizontal: SIZE.gut }}
          snapToInterval={184} decelerationRate="fast">
          {people.map(x => (
            <Pressable key={x.p} onPress={() => go.person(x.p)} accessibilityRole="button" accessibilityLabel={s.profiles[x.p]?.name}
              style={({ pressed }) => [h.tile, { backgroundColor: c.surface, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              <View style={{ marginBottom: 10 }}><Av id={x.p} /></View>
              <Txt f="semi" lines={1}>{short(s, x.p)}</Txt>
              <Txt s={13} c="muted">{x.b > 0 ? tr("te debe") : x.b < 0 ? tr("le debes") : tr("están a mano")}</Txt>
              {x.b ? <Money c={Math.abs(x.b)} sign={x.b > 0} s={18} f="display" color={bal(x.b)} fit={12.5} /> : null}
              <Txt s={12} c="muted" style={{ marginTop: 8 }}>{x.i.n ? tr("{0} sin saldar · desde {1}", plural(x.i.n, tr("gasto"), tr("gastos")), fdate(x.i.since!)) : tr("todo saldado")}</Txt>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {groups.length > 0 && <Sec title={tr("Grupos")} link={{ title: tr("Ver todos"), onPress: () => go.tab('grupos') }} />}
      {groups.length > 0 && <List>{groups.slice(0, 4).map(g => <GroupRow key={g.id} g={g} />)}</List>}
      {s.activity.length > 0 && <Sec title={tr("Reciente")} link={{ title: tr("Actividad"), onPress: () => go.tab('actividad') }} />}
      {s.activity.length > 0 && <List>{s.activity.slice(0, 4).map(a => <EvRow key={a.id} a={a} />)}</List>}
    </TabScreen>
  );
}

export function Groups() {
  const s = useS();
  const duo = friends(s).filter(p => s.groups.some(g => g.kind === 'directo' && g.members.includes(p)));
  const groups = visibleGroups(s), old = archivedGroups(s), c = useC();
  return (
    <TabScreen>
      <TitleRow title={tr("Grupos")} right={<View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Pressable onPress={go.search} accessibilityRole="button" accessibilityLabel={tr("Buscar gastos")} style={[h.round, { backgroundColor: c.surface }]}><Icon n="eye" color={c.fg} /></Pressable>
        <Btn title={tr("Nuevo")} icon="plus" kind="soft" size="sm" onPress={go.newGroup} /></View>} />
      {groups.length ? <List>{groups.map(g => <GroupRow key={g.id} g={g} />)}</List> : <FirstRun />}
      {duo.length > 0 && <Sec title={tr("Entre dos")} />}
      {duo.length > 0 && <List>{duo.map(p => {
        const d = s.groups.find(g => g.kind === 'directo' && g.members.includes(p))!;
        return (
          <Row key={p} onPress={() => go.person(p)} label={s.profiles[p].name}>
            <Av id={p} />
            <Main><Txt f="semi" lines={1}>{s.profiles[p].name}</Txt><Txt s={14} c="muted">{tr("Gastos entre ustedes dos")}</Txt></Main>
            <BalText c={friendBal(s, p).by[d.id] || 0} who />
          </Row>
        );
      })}</List>}
      {old.length > 0 && <Sec title={tr("Archivados")} hint={tr("se pueden abrir y desarchivar")} />}
      {old.length > 0 && <List>{old.map(g => <GroupRow key={g.id} g={g} />)}</List>}
    </TabScreen>
  );
}

function evText(s: Snapshot, a: Activity): ReactNode {
  const who = <B>{a.actor === s.me ? tr("Tú") : short(s, a.actor)}</B>;
  const e = a.expenseId ? s.expenses.find(x => x.id === a.expenseId) : undefined;
  const desc = `«${e?.description ?? (a.payload.descripcion as string) ?? tr("un gasto")}»`;
  const g = groupOf(s, a.groupId), where = g && g.kind !== 'directo' ? tr(' en {0}', g.name) : '';
  const me = a.actor === s.me;
  switch (a.verb) {
    case 'grupo_creado': return <>{who}{" "}{tr("{0} el grupo{1}", me ? tr("creaste") : tr("creó"), where)}</>;
    case 'miembro_agregado': return <>{who}{" "}{tr("{0} a {1}{2}", me ? tr("agregaste") : tr("agregó"), String(a.payload.nombre ?? 'alguien'), where)}</>;
    case 'se_unio': return <>{who} {me ? tr("te uniste") : tr("se unió")}{where}</>;
    case 'gasto_creado': return <>{who} {me ? tr("añadiste") : tr("añadió")} {desc}{where}</>;
    case 'gasto_editado': {
      const an = a.payload.antes as { monto?: number; moneda?: string } | undefined, de = a.payload.despues as { monto?: number; moneda?: string } | undefined;
      const changed = an && de && an.monto !== de.monto ? tr(": el monto pasó de {0} a {1}", moneyT(Number(an.monto), an.moneda), moneyT(Number(de.monto), de.moneda)) : '';
      return <>{who} {me ? tr("editaste") : tr("editó")} {desc}{where}{changed}</>;
    }
    case 'gasto_borrado': return <>{who} {me ? tr("borraste") : tr("borró")} {desc}{where}</>;
    case 'gasto_restaurado': return <>{who} {me ? tr("restauraste") : tr("restauró")} {desc}{where}</>;
    case 'pago_registrado': return e ? <><PayText s={s} e={e} /> {moneyT(e.amount)}{where}</> : <>{who}{" "}{tr("registró un pago")}</>;
    case 'pago_confirmado': return <>{who}{" "}{tr("{0} que le llegó el pago{1}", me ? tr("confirmaste") : tr("confirmó"), where)}</>;
    case 'comentario': return <>{who}{" "}{tr("{0} en {1}: “{2}”", me ? tr("comentaste") : tr("comentó"), desc, String(a.payload.texto ?? ''))}</>;
    case 'grupo_editado': return <>{who} {me ? tr("cambiaste") : tr("cambió")} {a.payload.archived === true ? tr("el grupo al archivo") : a.payload.name ? tr("el nombre a «{0}»", String(a.payload.name)) : a.payload.budget !== undefined ? tr("el presupuesto") : a.payload.simplify !== undefined ? tr("cómo se saldan las deudas") : a.payload.starts_on !== undefined || a.payload.ends_on !== undefined ? tr("las fechas") : tr("el grupo")}{where}</>;
    case 'salio': return <>{who}{" "}{tr("{0} del grupo{1}", me ? tr("saliste") : tr("salió"), where)}</>;
    case 'fondo_creado': return <>{who}{" "}{tr("{0} el fondo común{1}", me ? tr("creaste") : tr("creó"), where)}</>;
    case 'miembro_quitado': return <>{who}{" "}{tr("{0} a {1} del grupo{2}", me ? tr("quitaste") : tr("quitó"), String(a.payload.nombre ?? 'alguien'), where)}</>;
    default: return <>{who}{" "}{tr("hizo un cambio{0}", where)}</>;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Txt s={14} c="muted">{ago(a.createdAt)}</Txt>{fresh && <View style={[h.newPill, { backgroundColor: c.surface2 }]}><Txt f="semi" s={12} c="muted">{tr("nuevo")}</Txt></View>}</View>
      </Main>
      {pendingForMe ? <Btn title={tr("Confirmar")} kind="primary" size="sm" onPress={() => act(b => b.confirmPayment(e!.id), tr("Pago confirmado"))} />
        : restorable ? <Btn title={tr("Restaurar")} size="sm" onPress={() => act(b => b.restoreExpense(e!.id), tr("Gasto restaurado"))} />
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
      <TitleRow title={tr("Actividad")} />
      {toConfirm.length > 0 && <Note><B>{plural(toConfirm.length, tr("pago espera"), tr("pagos esperan"))}</B>{" "}{tr("que confirmes que te llegaron.")}</Note>}
      {s.activity.length ? <List>{s.activity.map(a => <EvRow key={a.id} a={a} fresh={a.actor !== s.me && a.createdAt > unread.seen} />)}</List>
        : <Empty icon="bell" title={tr("Todavía no hay movimiento")}>{tr("Aquí verás cada gasto, pago y comentario de tus grupos.")}</Empty>}
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
    try { await run(b => b.updateProfile({ name: name.trim(), payout: payout.trim(), username })); buzz(); toast(tr("Guardado")); }
    catch (e) { toast(errMsg(e)); } finally { setBusy(false); }
  };
  const signOut = () => {
    if (pending && !DEMO && !sure) { setSure(true); return; } // primero avisa: lo pendiente solo está en este teléfono
    if (DEMO) { if (Platform.OS === 'web') location.reload(); else DevSettings.reload(); return; }
    run(b => b.signOut()).catch(e => toast(errMsg(e)));
  };
  return (
    <TabScreen>
      <TitleRow title={tr("Cuenta")} />
      <Card pad style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Av id={s.me} size="lg" />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt f="display" s={19} lines={2}>{me.name}</Txt>
          {me.username ? <Txt s={15} c="muted">@{me.username}</Txt> : null}
          {me.email ? <Txt s={15} c="muted" lines={1}>{me.email}</Txt> : null}
        </View>
      </Card>
      <Section>
        <Label title={tr("Tu nombre")}><Field inCard value={name} maxLength={80} onChangeText={setName} autoComplete="name" textContentType="name" returnKeyType="next" /></Label>
        <Label title={tr("Usuario")}><Field inCard value={username} maxLength={20} onChangeText={v => setUsername(typedUser(v))} placeholder={tr("Para entrar sin escribir tu correo")}
          autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" /></Label>
        {!userOk && <Txt f="medium" s={15} c="danger">{tr(USERNAME_RULE)}</Txt>}
        <Label title={tr("Dónde te pagan")}><Field inCard multiline value={payout} maxLength={200} onChangeText={setPayout} placeholder={tr("Ej.: Banco Popular · ahorro · 123456789 · a nombre de …")} /></Label>
        <Note>{tr("Lo ve la gente de tus grupos cuando te va a pagar, con un botón para copiarlo.")}</Note>
        <Btn title={busy ? tr("Guardando…") : tr("Guardar")} kind="primary" disabled={!dirty || !name.trim() || !userOk || busy} onPress={save} />
      </Section>
      <PhoneExtras />
      <List>
        <View style={{ paddingVertical: 18, paddingHorizontal: 20, gap: 10 }}>
          <Txt f="semi">{tr("Tema")}</Txt>
          <Seg<ThemeMode> label={tr("Tema")} value={mode} onChange={m => { setMode(m); buzz(); }}
            options={[['dark', tr("De noche")], ['light', tr("Claro")], ['auto', tr("Auto")]]} />
        </View>
        <Pref k={tr("Moneda principal")} v={tr("Peso dominicano (RD$)")} />
        <View style={{ paddingVertical: 18, paddingHorizontal: 20, gap: 10 }}>
          <Txt f="semi">{tr("Idioma")}</Txt>
          <Seg<Lang> label={tr("Idioma")} value={getLang()} onChange={l => { buzz(); changeLang(l); }} options={LANGS} />
        </View>
      </List>
      <List>
        <Row onPress={() => openPage(TERMS_URL)}><RowIc n="receipt" /><Main><Txt f="semi">{tr("Términos de uso")}</Txt></Main><Icon n="chevR" color={c.faint} /></Row>
        <Row onPress={() => openPage(PRIVACY_URL)}><RowIc n="eye" /><Main><Txt f="semi">{tr("Política de privacidad")}</Txt></Main><Icon n="chevR" color={c.faint} /></Row>
      </List>
      <List>
        <Row onPress={() => go.qr()}><RowIc n="share" /><Main><Txt f="semi">{tr("Tu código para cobrar")}</Txt><Txt s={14} c="muted">{tr("Un QR con tus datos de pago")}</Txt></Main><Icon n="chevR" color={c.faint} /></Row>
        <Row onPress={() => shareCsv(exportName(s), exportCsv(s)).catch(e => toast(errMsg(e)))}><RowIc n="receipt" /><Main><Txt f="semi">{tr("Exportar todo a Excel")}</Txt><Txt s={14} c="muted">{tr("Todos tus grupos, en CSV")}</Txt></Main></Row>
        <Row onPress={() => sharePdf(exportHtml(s)).catch(e => toast(errMsg(e)))}><RowIc n="copy" /><Main><Txt f="semi">{tr("Informe en PDF")}</Txt><Txt s={14} c="muted">{tr("Para compartir o imprimir")}</Txt></Main></Row>
      </List>
      {sure ? <SplitStatus ok={false}>{tr("Tienes {0} sin enviar. Si sales ahora, se pierden.", plural(pending, tr("cambio"), tr("cambios")))}</SplitStatus> : null}
      <Btn title={DEMO ? tr("Reiniciar demostración") : sure ? tr("Salir igual") : tr("Cerrar sesión")} icon="out" kind="danger" size="lg" onPress={signOut} />
      {!DEMO ? <LinkBtn title={tr("Borrar mi cuenta")} color={c.danger} style={{ alignSelf: 'center' }} onPress={go.deleteAccount} /> : null}
      {DEMO ? <Txt s={13} c="muted" center>{tr("Modo demostración: personas, montos y cuentas son de ejemplo y nada se guarda.")}</Txt> : null}
    </TabScreen>
  );
}

/** Lo de este teléfono: avisos y bloqueo con huella o cara. */
function PhoneExtras() {
  const c = useC(), toast = useToast();
  const [push, setPush] = useState(false), [lock, setLock] = useState(false), [canLock, setCanLock] = useState(false), [busy, setBusy] = useState(false);
  const why = pushUnavailable();
  useEffect(() => { pushOn().then(setPush, () => {}); lockOn().then(setLock); lockSupported().then(setCanLock, () => {}); }, []);
  const toggle = async (on: boolean, yes: () => Promise<unknown>, no: () => Promise<unknown>, set: (v: boolean) => void, okText: string) => {
    setBusy(true);
    try { if (on) await yes(); else await no(); set(on); buzz(); toast(on ? okText : tr("Desactivado")); } catch (e) { toast(errMsg(e)); } finally { setBusy(false); }
  };
  const sw = (value: boolean, onChange: (v: boolean) => void, disabled: boolean) => (
    <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: c.accent, false: c.line }} thumbColor={value ? c.accentFg : c.fg} />);
  return (
    <List>
      <View style={h.pref}>
        <Main><Txt f="semi">{tr("Avisos en este teléfono")}</Txt><Txt s={14} c="muted">{why ?? tr("Gastos nuevos, pagos por confirmar y comentarios.")}</Txt></Main>
        {sw(push, v => toggle(v, enablePush, disablePush, setPush, 'Avisos activados'), busy || !!why)}
      </View>
      {canLock && <View style={h.pref}>
        <Main><Txt f="semi">{tr("Pedir huella o cara al abrir")}</Txt><Txt s={14} c="muted">{tr("Con Face ID o la huella de este teléfono.")}</Txt></Main>
        {sw(lock, v => toggle(v, enableLock, disableLock, setLock, 'Bloqueo activado'), busy)}
      </View>}
    </List>
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
  late: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  pref: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: SIZE.row, paddingVertical: 10, paddingLeft: 20, paddingRight: 18 },
});

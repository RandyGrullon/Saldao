import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import {
  cat, CATS, debts, exportCsv, exportHtml, exportName, friends, fundOf, getBackend, groupOf, groupPhotoPath, monthName, monthStats, moneyT, parseMoney,
  payQrText, plural, run, searchExpenses, shiftMonth, short, thisMonth, visibleGroups, type Filters, type Id,
} from '@saldao/core';
import { shareCsv, sharePdf } from '../lib/files';
import { buzz, errMsg, go } from '../lib/nav';
import { pickPhoto } from '../lib/photo';
import { useS } from '../lib/store';
import { F, SIZE, useC } from '../lib/theme';
import { A, Actions, Btn, Chips, Empty, Field, Label, LinkBtn, List, Main, Note, Row, Sec, Section, Sheet, SheetH3, SheetHead, SplitStatus, StackScreen } from '../ui/base';
import { ChoiceChip, DateChip } from '../ui/choice';
import { Icon } from '../ui/icons';
import { Av, ExpRow, Money, RowIc } from '../ui/kit';
import { GroupPhoto, Qr } from '../ui/photo';
import { H1, H2, Txt } from '../ui/text';
import { useToast } from '../ui/toast';
import { tr } from '@saldao/core';

/** La lista de compras del grupo: lo que falta; quien lo compra lo marca y lo anota como gasto con un toque. */
export function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useS(), c = useC(), toast = useToast(), g = groupOf(s, id);
  const [draft, setDraft] = useState('');
  if (!g) return <StackScreen><Empty icon="cart" title={tr("Este grupo ya no existe.")} /></StackScreen>;
  const items = s.items.filter(i => i.groupId === id);
  const todo = items.filter(i => !i.doneAt), done = items.filter(i => i.doneAt);
  const act = (fn: Parameters<typeof run>[0]) => run(fn).catch(e => toast(errMsg(e)));
  const add = () => { const n = draft.trim(); if (!n) return; setDraft(''); buzz(); act(b => b.addItem(id, n)); };
  const box = (on: boolean) => (
    <View style={[m.box, { borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : 'transparent' }]}>{on && <Icon n="check" sm color={c.accentFg} />}</View>
  );
  return (
    <StackScreen>
      <View style={{ gap: 4 }}><Txt f="medium" s={15} c="muted">{g.name}</Txt><H1>{tr("Lista de compras")}</H1></View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={draft} onChangeText={setDraft} placeholder={tr("Qué falta (agua, detergente…)")} placeholderTextColor={c.faint} maxLength={120}
          returnKeyType="done" onSubmitEditing={add} accessibilityLabel={tr("Qué falta")} style={[m.input, { borderColor: c.line, backgroundColor: c.surface, color: c.fg }]} />
        <Pressable onPress={add} disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel={tr("Agregar a la lista")}
          style={[m.add, { backgroundColor: c.accent, opacity: draft.trim() ? 1 : 0.45 }]}><Icon n="plus" color={c.accentFg} /></Pressable>
      </View>
      {todo.length ? <List>{todo.map(i => (
        <Row key={i.id}>
          <Pressable onPress={() => { buzz(); act(b => b.toggleItem(i.id)); }} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={tr("Ya compré {0}", i.name)}>{box(false)}</Pressable>
          <Main><Txt f="semi">{i.name}</Txt><Txt s={14} c="muted">{i.addedBy === s.me ? tr("la agregaste tú") : tr("la agregó {0}", short(s, i.addedBy))}</Txt></Main>
          <Pressable onPress={() => act(b => b.deleteItem(i.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel={tr("Quitar {0}", i.name)}
            style={[m.trash, { backgroundColor: c.surface2 }]}><Icon n="trash" sm color={c.muted} /></Pressable>
        </Row>))}</List>
        : <Empty icon="cart" title={tr("No falta nada")}>{tr("Agrega lo que se acabó en la casa. Quien lo compre lo marca y lo anota como gasto.")}</Empty>}
      {done.length > 0 && <Sec title={tr("Comprado")} hint={plural(done.length, tr("cosa"), tr("cosas"))} />}
      {done.length > 0 && <List>{done.map(i => (
        <Row key={i.id}>
          <Pressable onPress={() => act(b => b.toggleItem(i.id))} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: true }} accessibilityLabel={tr("Desmarcar {0}", i.name)}>{box(true)}</Pressable>
          <Main><Txt f="semi" c="muted" style={{ textDecorationLine: 'line-through' }}>{i.name}</Txt>
            <Txt s={14} c="muted">{i.doneBy === s.me ? tr("la compraste tú") : tr("la compró {0}", i.doneBy ? short(s, i.doneBy) : tr("alguien"))}</Txt></Main>
        </Row>))}</List>}
      {done.length > 0 && <Actions>
        <Btn title={tr("Anotar la compra")} icon="plus" kind="primary" size="lg" style={A.full}
          onPress={() => go.addExpense({ groupId: id, desc: tr("Compra: {0}", done.map(i => i.name).join(', ')).slice(0, 120), cat: 'super', clear: done.map(i => i.id).join(',') })} />
        <Btn title={tr("Borrar lo comprado")} size="lg" style={A.full} onPress={() => act(async b => { for (const i of done) await b.deleteItem(i.id); })} />
      </Actions>}
    </StackScreen>
  );
}

/** Tu mes: tu parte de lo gastado, por categoría y por grupo, comparado con el mes anterior. */
export function SummaryScreen() {
  const s = useS(), c = useC();
  const [mo, setMo] = useState(thisMonth());
  const st = useMemo(() => monthStats(s, mo), [s, mo]);
  const max = Math.max(1, ...st.byCat.map(x => x.amount));
  const diff = st.prev && st.total ? Math.round(((st.total - st.prev) / st.prev) * 100) : null;
  const round = (n: 'left' | 'chevR', on: () => void, off?: boolean, label = '') => (
    <Pressable onPress={on} disabled={off} accessibilityRole="button" accessibilityLabel={label} style={[m.round, { backgroundColor: c.surface, opacity: off ? 0.35 : 1 }]}><Icon n={n} /></Pressable>
  );
  return (
    <StackScreen>
      <View style={m.monthNav}>
        {round('left', () => setMo(x => shiftMonth(x, -1)), false, tr("Mes anterior"))}
        <H1 s={22}>{monthName(mo).replace(/^./, x => x.toUpperCase())}</H1>
        {round('chevR', () => setMo(x => shiftMonth(x, 1)), mo >= thisMonth(), tr("Mes siguiente"))}
      </View>
      <Section style={{ gap: 8 }}>
        <Txt s={15} c="muted">{tr("Tu parte de lo gastado")}</Txt>
        <Money c={st.total} s={40} f="display" fit={11.5} />
        <Note>{plural(st.count, tr("gasto"), tr("gastos"))}{diff === null ? '' : diff === 0 ? tr(" · igual que el mes anterior") : tr(" · {0} que el mes anterior", diff > 0 ? tr("{0} % más", diff) : tr("{0} % menos", -diff))}</Note>
      </Section>
      {st.byCat.length ? <>
        <Sec title={tr("Por categoría")} />
        <Section style={{ gap: 14 }}>{st.byCat.map(x => (
          <View key={x.key} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon n={cat(x.key).icon} sm color={c.fg2} /><Txt f="semi">{x.name}</Txt></View>
              <Money c={x.amount} />
            </View>
            <View style={[m.track, { backgroundColor: c.line }]}><View style={[m.fill, { width: `${Math.max(3, (x.amount / max) * 100)}%`, backgroundColor: c.accent }]} /></View>
          </View>))}</Section>
        <Sec title={tr("Por grupo")} />
        <List>{st.byGroup.map(x => {
          const g = groupOf(s, x.groupId);
          return g ? <Row key={x.groupId}><GroupPhoto g={g} /><Main><Txt f="semi">{g.kind === 'directo' ? tr("Con {0}", short(s, g.members.find(k => k !== s.me)!)) : g.name}</Txt></Main><Money c={x.amount} /></Row> : null;
        })}</List>
        <Sec title={tr("Lo más grande")} />
        <List>{st.top.map(e => <ExpRow key={e.id} e={e} showGroup />)}</List>
      </> : <Empty icon="receipt" title={tr("Nada este mes")}>{tr("Cuando anotes gastos, aquí verás en qué se va tu dinero.")}</Empty>}
    </StackScreen>
  );
}

/** Buscar: por texto (sin importar tildes), grupo, persona y categoría. */
export function SearchScreen() {
  const s = useS();
  const [f, setF] = useState<Filters>({});
  const res = useMemo(() => searchExpenses(s, f), [s, f]);
  const set = (k: keyof Filters, v: string) => setF(x => ({ ...x, [k]: v || undefined }));
  const any = !!(f.text || f.groupId || f.person || f.cat);
  return (
    <StackScreen>
      <H1>{tr("Buscar")}</H1>
      <Field autoFocus placeholder={tr("Mofongo, Sirena, 1,200…")} value={f.text ?? ''} onChangeText={v => set('text', v)} returnKeyType="search" accessibilityLabel={tr("Buscar gastos")} />
      <Chips>
        <ChoiceChip icon="users" title={tr("Grupo")} value={f.groupId ?? ''} onChange={v => set('groupId', v)}
          groups={[{ options: [['', tr("Todos los grupos")] as [string, string], ...visibleGroups(s).map(g => [g.id, g.name] as [string, string])] }]} />
        <ChoiceChip icon="user" title={tr("Persona")} value={f.person ?? ''} onChange={v => set('person', v)}
          groups={[{ options: [['', tr("Cualquiera")] as [string, string], ...friends(s).map(p => [p, s.profiles[p].name] as [string, string])] }]} />
        <ChoiceChip icon="receipt" title={tr("Categoría")} value={f.cat ?? ''} onChange={v => set('cat', v)}
          groups={[{ options: [['', tr("Todas")] as [string, string], ...Object.entries(CATS).map(([k, x]) => [k, tr(x.name)] as [string, string])] }]} />
      </Chips>
      {any ? res.length ? <>
        <Note>{plural(res.length, tr("gasto"), tr("gastos"))} · {moneyT(res.filter(e => !e.isPayment).reduce((a, e) => a + e.amount, 0))}</Note>
        <List>{res.slice(0, 200).map(e => <ExpRow key={e.id} e={e} showGroup />)}</List>
      </> : <Empty icon="eye" title={tr("No encontramos nada")}>{tr("Prueba con otra palabra o quita algún filtro.")}</Empty>
        : <Note center>{tr("Escribe algo o elige un filtro.")}</Note>}
    </StackScreen>
  );
}

/** Tu código para cobrar: tus datos de pago (y el monto, si viene). Cualquier cámara lo lee y copia el texto. */
export function QrSheet() {
  const p = useLocalSearchParams<{ amount?: string; from?: string }>();
  const s = useS(), toast = useToast(), me = s.profiles[s.me], amount = p.amount ? Number(p.amount) : undefined;
  if (!me.payout) return (
    <Sheet head={<SheetHead title={tr("Tu código para cobrar")} />}>
      <Txt f="medium" s={18}>{tr("Primero pon dónde te pagan.")}</Txt>
      <Note>{tr("En Cuenta, en «Dónde te pagan», escribe tu banco, el tipo de cuenta y el número. El código los lleva para que te transfieran sin escribirlos.")}</Note>
      <Btn title={tr("Ir a Cuenta")} kind="primary" size="lg" onPress={() => { go.back(); go.tab('cuenta'); }} />
    </Sheet>
  );
  const text = payQrText(s, amount);
  return (
    <Sheet head={<SheetHead title={tr("Tu código para cobrar")} left={<LinkBtn title={tr("Listo")} onPress={go.back} />} />}>
      {p.from && amount ? <Note center>{tr("Para que {0} te pague {1}.", short(s, p.from), moneyT(amount))}</Note> : null}
      <Qr text={text} />
      <Txt s={15} c="muted" center selectable>{text}</Txt>
      <Btn title={tr("Copiar los datos")} icon="copy" onPress={() => Clipboard.setStringAsync(text).then(() => toast(tr("Datos copiados")), () => toast(tr("No se pudo copiar")))} />
    </Sheet>
  );
}

export const debtLines = (s: ReturnType<typeof useS>, g: Id) => debts(s, g).map(t => tr("{0} le debe a {1} {2}", short(s, t.from), short(s, t.to), moneyT(t.amount)));

/** Ajustes del grupo: nombre, foto, fechas, presupuesto, simplificar, fondo, personas y roles, exportar, archivar y salir. */
export function GroupSettingsSheet() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const s = useS(), c = useC(), toast = useToast(), g = groupOf(s, groupId);
  const [name, setName] = useState(g?.name ?? '');
  const [budget, setBudget] = useState(g?.budget ? (g.budget / 100).toFixed(0) : '');
  const [from, setFrom] = useState(g?.startsOn ?? ''), [to, setTo] = useState(g?.endsOn ?? '');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<Id | null>(null);
  const [renaming, setRenaming] = useState<{ id: Id; name: string } | null>(null);
  if (!g) return <Sheet head={<SheetHead title={tr("Ajustes del grupo")} />}><Note>{tr("Este grupo ya no existe.")}</Note></Sheet>;
  const admin = g.roles[s.me] === 'admin', fund = fundOf(s, groupId), b = getBackend()!;
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await run(() => fn().then(() => undefined)); buzz(); if (ok) toast(ok); return true; }
    catch (e) { toast(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const photo = async () => {
    try {
      const p = await pickPhoto(false, 800); if (!p) return;
      const path = groupPhotoPath(groupId);
      await act(async () => { await b.uploadPhoto(path, { data: p.data, type: 'image/jpeg', uri: p.uri }); await b.updateGroup(groupId, { photoPath: path }); }, tr("Foto del grupo cambiada"));
    } catch (e) { toast(errMsg(e)); }
  };
  const members = g.members.filter(x => !s.profiles[x]?.fundOf);
  const toggleRow = (title: string, sub: string, value: boolean, onChange: (v: boolean) => void) => (
    <Row><Main><Txt f="semi">{title}</Txt><Txt s={14} c="muted">{sub}</Txt></Main>
      <Switch value={value} disabled={!admin || busy} onValueChange={onChange} trackColor={{ true: c.accent, false: c.line }} thumbColor={value ? c.accentFg : c.fg} /></Row>
  );
  return (
    <Sheet head={<SheetHead title={tr("Ajustes del grupo")} left={<LinkBtn title={tr("Listo")} onPress={go.back} />} />}>
      <Section>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <GroupPhoto g={g} size={56} />
          {admin && <Btn title={g.photoPath ? tr("Cambiar foto") : tr("Poner foto")} icon="edit" size="sm" disabled={busy} onPress={photo} />}
          {admin && g.photoPath && <LinkBtn title={tr("Quitar")} disabled={busy} onPress={() => act(() => b.updateGroup(groupId, { photoPath: null }), tr("Foto quitada"))} />}
        </View>
        <Label title={tr("Nombre")}><Field inCard value={name} maxLength={60} editable={admin} onChangeText={setName} /></Label>
        {admin && !!name.trim() && name.trim() !== g.name && <Btn title={tr("Guardar nombre")} kind="primary" disabled={busy} onPress={() => act(() => b.updateGroup(groupId, { name: name.trim() }), tr("Nombre cambiado"))} />}
        <Label title={tr("Fechas (si es de fecha a fecha)")}>
          <Chips>
            <DateChip title={tr("Desde")} prefix={tr("Desde")} empty={tr("Desde…")} future value={from} onChange={v => { setFrom(v); if (to && v && v > to) setTo(''); }} />
            <DateChip title={tr("Hasta")} prefix={tr("Hasta")} empty={tr("Hasta…")} future min={from || undefined} value={to} onChange={setTo} />
          </Chips>
        </Label>
        {admin && (from !== (g.startsOn ?? '') || to !== (g.endsOn ?? '')) &&
          <Btn title={from || to ? tr("Guardar fechas") : tr("Quitar fechas")} disabled={busy} onPress={() => act(() => b.updateGroup(groupId, { startsOn: from || null, endsOn: to || null }), from || to ? tr("Fechas guardadas") : tr("Fechas quitadas"))} />}
        <Label title={tr("Presupuesto del mes")}>
          <View style={[m.money, { borderColor: c.line, backgroundColor: c.bg }]}>
            <Txt c="muted">{tr("RD$")}</Txt>
            <TextInput value={budget} onChangeText={setBudget} keyboardType="number-pad" editable={admin} placeholder={tr("Sin presupuesto")} placeholderTextColor={c.faint}
              accessibilityLabel={tr("Presupuesto del mes")} style={[m.moneyInput, { color: c.fg }]} />
          </View>
        </Label>
        <Note>{tr("Lo que el grupo piensa gastar al mes (sin contar pagos). Avisa al llegar al 80 %.")}</Note>
        {admin && String(g.budget ? g.budget / 100 : '') !== budget.trim() &&
          <Btn title={budget.trim() ? tr("Guardar presupuesto") : tr("Quitar presupuesto")} disabled={busy}
            onPress={() => act(() => b.updateGroup(groupId, { budget: parseMoney(budget) || null }), budget.trim() ? tr("Presupuesto guardado") : tr("Presupuesto quitado"))} />}
      </Section>
      <List>
        {toggleRow(tr("Simplificar deudas"), tr("El grupo salda con el menor número de pagos, aunque a veces le pagues a alguien con quien no tuviste gastos."), g.simplify,
          v => { act(() => b.updateGroup(groupId, { simplify: v }), v ? tr("Deudas simplificadas") : tr("Deudas de a pares")); })}
        {fund ? <Row><RowIc n="receipt" tone="accent" /><Main><Txt f="semi">{tr("Fondo común")}</Txt><Txt s={14} c="muted">{tr("Ya existe: aporta o paga desde la pantalla del grupo.")}</Txt></Main></Row>
          : <Row onPress={busy ? undefined : () => act(() => b.createFund(groupId), tr("Fondo común creado"))}><RowIc n="plus" tone="accent" />
            <Main><Txt f="semi">{tr("Crear fondo común")}</Txt><Txt s={14} c="muted">{tr("Para un viaje: cada uno aporta al principio y los gastos salen de ahí.")}</Txt></Main></Row>}
      </List>
      <SheetH3>{tr("Personas")}</SheetH3>
      <List>{members.map(x => {
        const p = s.profiles[x], noAccount = !p?.userId && !p?.deletedAt;
        return (
          <View key={x} style={{ paddingVertical: 10, paddingLeft: 20, paddingRight: 18, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Av id={x} />
              {renaming?.id === x
                ? <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
                    <TextInput value={renaming.name} autoFocus maxLength={80} onChangeText={v => setRenaming({ id: x, name: v })} accessibilityLabel={tr("Nombre nuevo")}
                      style={[m.input, { borderColor: c.line, backgroundColor: c.bg, color: c.fg }]} />
                    <Pressable onPress={async () => { if (renaming.name.trim() && await act(() => b.renamePlaceholder(groupId, x, renaming.name.trim()), tr("Nombre cambiado"))) setRenaming(null); }}
                      accessibilityRole="button" accessibilityLabel={tr("Guardar nombre")} style={[m.add, { backgroundColor: c.accent }]}><Icon n="check" color={c.accentFg} /></Pressable>
                  </View>
                : <Main><Txt f="semi">{x === s.me ? tr("Tú") : p?.name}</Txt>
                    <Txt s={14} c="muted">{g.roles[x] === 'admin' ? tr("Admin") : p?.deletedAt ? tr("Borró su cuenta") : p?.userId ? tr("Miembro") : tr("Sin cuenta todavía")}</Txt></Main>}
            </View>
            {admin && x !== s.me && renaming?.id !== x && (
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                {p?.userId && <Btn title={g.roles[x] === 'admin' ? tr("Quitar admin") : tr("Hacer admin")} size="sm" disabled={busy}
                  onPress={() => act(() => b.setMemberRole(groupId, x, g.roles[x] === 'admin' ? 'miembro' : 'admin'), g.roles[x] === 'admin' ? tr("Ya no es admin") : tr("Ahora es admin"))} />}
                {noAccount && <Btn title={tr("Nombre")} icon="edit" size="sm" disabled={busy} onPress={() => setRenaming({ id: x, name: p?.name ?? '' })} />}
                <Btn title={removing === x ? tr("¿Quitar?") : tr("Quitar")} kind="danger" size="sm" disabled={busy} label={tr("Quitar a {0} del grupo", p?.name)}
                  onPress={async () => { if (removing !== x) { setRemoving(x); return; } if (await act(() => b.removeMember(groupId, x), tr("{0} ya no está en el grupo", p?.name ?? tr("La persona")))) setRemoving(null); }} />
              </View>
            )}
          </View>
        );
      })}</List>
      {removing ? <Note>{tr("Toca «¿Quitar?» otra vez para confirmar. Solo se puede con sus cuentas saldadas en el grupo; lo que compartió se queda.")}</Note> : null}
      <SheetH3>{tr("Exportar")}</SheetH3>
      <Actions>
        <Btn title={tr("Excel (CSV)")} icon="receipt" style={A.half} onPress={() => shareCsv(exportName(s, groupId), exportCsv(s, groupId)).catch(e => toast(errMsg(e)))} />
        <Btn title={tr("PDF")} icon="share" style={A.half} onPress={() => sharePdf(exportHtml(s, groupId, debtLines(s, groupId))).catch(e => toast(errMsg(e)))} />
      </Actions>
      {admin && <Btn title={g.archivedAt ? tr("Sacar del archivo") : tr("Archivar el grupo")} size="lg" disabled={busy}
        onPress={async () => { if (await act(() => b.updateGroup(groupId, { archived: !g.archivedAt }), g.archivedAt ? tr("Grupo de vuelta en la lista") : tr("Grupo archivado"))) go.back(); }} />}
      {leaving ? <SplitStatus ok={false}>{tr("Solo puedes salir con tus cuentas saldadas en este grupo. Lo que compartiste se queda.")}</SplitStatus> : null}
      <Btn title={leaving ? tr("Salir del grupo") : tr("Salir del grupo…")} icon="out" kind="danger" size="lg" disabled={busy}
        onPress={async () => { if (!leaving) { setLeaving(true); return; } if (await act(() => b.leaveGroup(groupId), tr("Saliste de {0}", g.name))) router.replace('/grupos'); }} />
    </Sheet>
  );
}

export { H2, Main, F, SIZE };
const m = StyleSheet.create({
  input: { flex: 1, minWidth: 0, minHeight: SIZE.touch, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, fontFamily: F.regular, fontSize: 16 },
  add: { width: SIZE.touch, height: SIZE.touch, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  trash: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  round: { width: SIZE.touch, height: SIZE.touch, borderRadius: SIZE.touch / 2, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  money: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  moneyInput: { flex: 1, fontFamily: F.regular, fontSize: 16, padding: 0 },
});

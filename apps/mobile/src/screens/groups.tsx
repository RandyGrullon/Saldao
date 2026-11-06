import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { APP, friends, getBackend, groupOf, inviteLink, run, short, type GroupKind, type Id, type InvitePreview } from '@saldao/core';
import { clearInvite } from '../lib/invite';
import { buzz, errMsg, go } from '../lib/nav';
import { useS } from '../lib/store';
import { F, SIZE, useC } from '../lib/theme';
import { A, Actions, Btn, Chip, Chips, Field, Finding, LinkBtn, Note, Section, Seg, Sheet, SheetH3, SheetHead } from '../ui/base';
import { DateChip } from '../ui/choice';
import { Icon } from '../ui/icons';
import { Av } from '../ui/kit';
import { B, H2, Txt } from '../ui/text';
import { useToast } from '../ui/toast';
import { tr } from '@saldao/core';

const KINDS: [GroupKind, string][] = [['casa', 'Casa'], ['viaje', 'Viaje'], ['pareja', 'Pareja'], ['otro', 'Otro']];

/** Escribir un nombre y agregarlo con el botón (o con «listo» en el teclado). */
function Composer({ value, onChange, onAdd, label }: { value: string; onChange: (v: string) => void; onAdd: () => void; label: string }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TextInput value={value} onChangeText={onChange} placeholder={tr("Nombre")} placeholderTextColor={c.faint} returnKeyType="done" onSubmitEditing={onAdd} accessibilityLabel={label}
        autoCapitalize="words" style={[g.input, { borderColor: c.line, backgroundColor: c.surface, color: c.fg, fontFamily: F.regular }]} />
      <Pressable onPress={onAdd} disabled={!value.trim()} accessibilityRole="button" accessibilityLabel={tr("Agregar persona")}
        style={[g.add, { backgroundColor: c.accent, opacity: value.trim() ? 1 : 0.45 }]}><Icon n="plus" color={c.accentFg} /></Pressable>
    </View>
  );
}

export function NewGroupSheet() {
  const s = useS(), toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('viaje');
  const [picked, setPicked] = useState<Id[]>([]);
  const known = friends(s).filter(p => !s.profiles[p].deletedAt);
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const badDates = !!from && !!to && to < from;
  const addDraft = () => { const n = draft.trim(); if (n) { setNewPeople(p => [...p, n]); setDraft(''); buzz(); } };
  const create = async () => {
    setBusy(true); setErr('');
    try {
      let id = '';
      await run(async b => {
        id = await b.createGroup(name.trim(), kind);
        for (const p of picked) await b.addMember(id, p);
        for (const n of newPeople) await b.addPlaceholder(id, n);
        if (from || to) await b.updateGroup(id, { startsOn: from || null, endsOn: to || null });
      });
      buzz(); router.replace(`/grupo/${id}`);
      toast(tr("Grupo creado. Invita a los demás con el enlace."));
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Sheet head={<SheetHead title={tr("Nuevo grupo")} right={<LinkBtn title={tr("Crear")} strong disabled={!name.trim() || busy || badDates} onPress={create} />} />}>
      <Field placeholder={tr("Nombre del grupo")} value={name} onChangeText={setName} maxLength={60} returnKeyType="done" accessibilityLabel={tr("Nombre del grupo")} autoCapitalize="sentences" />
      <SheetH3>{tr("Tipo")}</SheetH3>
      <Seg label={tr("Tipo de grupo")} value={kind} onChange={setKind} options={KINDS.map(([k, l]) => [k, tr(l)] as [GroupKind, string])} />
      <SheetH3>{tr("Fechas (si es por un tiempo)")}</SheetH3>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <DateChip title={tr("Desde")} prefix={tr("Desde")} value={from} onChange={v => { setFrom(v); if (to && v && v > to) setTo(''); }} future empty={tr("Desde…")} />
        <DateChip title={tr("Hasta")} prefix={tr("Hasta")} value={to} onChange={setTo} future min={from || undefined} empty={tr("Hasta…")} />
      </View>
      {badDates ? <Txt f="medium" s={15} c="danger">{tr("La fecha final va después de la primera.")}</Txt>
        : <Note>{tr("Un viaje o un evento: al llegar la última fecha, {0} avisa que toca saldar y archivar.", APP.name)}</Note>}
      {known.length > 0 && <SheetH3>{tr("Personas de tus otros grupos")}</SheetH3>}
      {known.length > 0 && <Chips>{known.map(p => (
        <Chip key={p} title={short(s, p)} on={picked.includes(p)} left={<Av id={p} size="xs" />}
          onPress={() => { buzz(); setPicked(x => (x.includes(p) ? x.filter(y => y !== p) : [...x, p])); }} />))}</Chips>}
      <SheetH3>{tr("Alguien que todavía no usa {0}", APP.name)}</SheetH3>
      <Composer value={draft} onChange={setDraft} onAdd={addDraft} label={tr("Nombre de la persona")} />
      {newPeople.length > 0 && <Chips>{newPeople.map((n, i) => <Chip key={i} title={`${n} ×`} label={tr("Quitar a {0}", n)} onPress={() => setNewPeople(p => p.filter((_, j) => j !== i))} />)}</Chips>}
      <Note>{tr("Puedes cargarle gastos desde ya. Cuando entre con el enlace de invitación, reclama su lugar y ve todo su historial.")}</Note>
      {err ? <Txt f="medium" s={15} c="danger">{err}</Txt> : null}
      <Btn title={busy ? tr("Creando…") : tr("Crear grupo")} kind="primary" size="lg" disabled={!name.trim() || busy || badDates} onPress={create} />
    </Sheet>
  );
}

export function InviteSheet() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const s = useS(), toast = useToast(), grp = groupOf(s, groupId);
  const [draft, setDraft] = useState('');
  if (!grp) return <Sheet head={<SheetHead title={tr("Invitar")} />}><Finding>{tr("Este grupo ya no existe.")}</Finding></Sheet>;
  const link = inviteLink(APP.site, grp.inviteToken);
  const others = friends(s).filter(p => !grp.members.includes(p) && !s.profiles[p].deletedAt);
  const share = () => Share.share({ message: tr("Únete a «{0}» en {1} para llevar las cuentas claras: {2}", grp.name, APP.name, link) }).catch(() => {});
  const add = async (fn: () => Promise<unknown>, text: string) => {
    try { await run(() => fn().then(() => undefined)); buzz(); toast(text); } catch (e) { toast(errMsg(e)); }
  };
  const addNew = () => { const n = draft.trim(); if (!n) return; setDraft(''); add(() => getBackend()!.addPlaceholder(grp.id, n), `${n} agregado. Mándale el enlace para que reclame su lugar.`); };
  return (
    <Sheet head={<SheetHead title={tr("Invitar")} left={<LinkBtn title={tr("Listo")} onPress={go.back} />} />}>
      <Section>
        <H2>{tr("Enlace de {0}", grp.name)}</H2>
        <Txt s={15} c="muted" selectable>{link}</Txt>
        <Actions>
          <Btn title={tr("Compartir")} icon="share" kind="primary" style={A.half} onPress={share} />
          <Btn title={tr("Copiar")} icon="link" style={A.half} onPress={() => Clipboard.setStringAsync(link).then(() => toast(tr("Enlace copiado")), () => toast(tr("No se pudo copiar")))} />
        </Actions>
      </Section>
      {others.length > 0 && <SheetH3>{tr("Agregar de tus otros grupos")}</SheetH3>}
      {others.length > 0 && <Chips>{others.map(p => (
        <Chip key={p} title={short(s, p)} left={<Av id={p} size="xs" />} right={<Icon n="plus" sm />}
          onPress={() => add(() => getBackend()!.addMember(grp.id, p), `${short(s, p)} ya está en ${grp.name}`)} />))}</Chips>}
      <SheetH3>{tr("Alguien que todavía no usa {0}", APP.name)}</SheetH3>
      <Composer value={draft} onChange={setDraft} onAdd={addNew} label={tr("Nombre de la persona")} />
    </Sheet>
  );
}

export function JoinSheet() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const toast = useToast();
  const [p, setP] = useState<InvitePreview | null | undefined>(undefined);
  const [as, setAs] = useState<Id | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { getBackend()?.invitePreview(token).then(setP, () => setP(null)); }, [token]);
  const join = async () => {
    setBusy(true); setErr('');
    try {
      let id = '';
      await run(async b => { id = await b.joinGroup(token, as); });
      clearInvite(); buzz(); router.replace(`/grupo/${id}`);
      toast(tr("Ya estás en {0}", p!.name));
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Sheet head={<SheetHead title={tr("Invitación")} left={<LinkBtn title={tr("Ahora no")} onPress={() => { clearInvite(); go.back(); }} />} />}>
      {p === undefined ? <Note center>{tr("Buscando el grupo…")}</Note>
        : p === null ? <Finding>{tr("Esta invitación no es válida o ya expiró. Pide un enlace nuevo.")}</Finding> : <>
          <Finding>{tr("Te invitaron a")}{" "}<B>{p.name}</B> ({p.members} {p.members === 1 ? tr("persona") : tr("personas")}).</Finding>
          {p.placeholders.length > 0 && <>
            <SheetH3>{tr("¿Ya te habían agregado con otro nombre?")}</SheetH3>
            <Note>{tr("Elige tu nombre y todo lo que te cargaron pasa a tu cuenta.")}</Note>
            <Chips>{p.placeholders.map(x => <Chip key={x.id} title={x.name} on={as === x.id} onPress={() => setAs(a => (a === x.id ? null : x.id))} />)}</Chips>
          </>}
          {err ? <Txt f="medium" s={15} c="danger">{err}</Txt> : null}
          <Btn title={busy ? tr("Uniéndote…") : as ? tr("Unirme como {0}", p.placeholders.find(x => x.id === as)?.name) : tr("Unirme al grupo")} kind="primary" size="lg" disabled={busy} onPress={join} />
        </>}
    </Sheet>
  );
}

const g = StyleSheet.create({
  input: { flex: 1, minWidth: 0, minHeight: SIZE.touch, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, fontSize: 16 },
  add: { width: SIZE.touch, height: SIZE.touch, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

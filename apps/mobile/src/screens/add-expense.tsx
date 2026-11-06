import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  apportion, cat, CATS, curSym, expensePhotoPath, fetchUsdRate, frequentExpenses, friends, fundOf, getBackend, groupOf, guessCat, itemSplit, moneyT,
  parseMoney, plural, REPEATS, run, short, split, sum, today, typed, visibleGroups, type Expense, type Id, type Snapshot, type SplitMode,
} from '@saldao/core';
import { pickPhoto, type Photo } from '../lib/photo';
import { buzz, errMsg, go } from '../lib/nav';
import { useS } from '../lib/store';
import { ANIM, F, R, SIZE, useC } from '../lib/theme';
import { Btn, Chip, Chips, Empty, Field, LinkBtn, List, Main, Note, Row, Seg, Sheet, SheetH3, SheetHead, SplitStatus } from '../ui/base';
import { ChoiceChip, DateChip } from '../ui/choice';
import { Icon } from '../ui/icons';
import { Av, Money } from '../ui/kit';
import { Txt } from '../ui/text';
import { useToast } from '../ui/toast';
import { Totals } from './detail';
import { tr } from '@saldao/core';

// «Noches» es «Partes» contado en noches: en un viaje, quien llegó después paga menos hospedaje.
type Mode = SplitMode | 'nights';
const MODES: [Mode, string][] = [['equal', 'Iguales'], ['exact', 'Montos'], ['percent', '%'], ['shares', 'Partes'], ['nights', 'Noches'], ['adjust', 'Extra'], ['items', 'Ítems']];
const modeOf = (e: Expense): Mode => (e.splitMode === 'shares' && e.splitParams.unit === 'noches' ? 'nights' : e.splitMode);
type ItemDraft = { name: string; price: string; to: Id[] };
const RATE_KEY = 'saldao:tasa-usd';
const ones = (ms: Id[]) => Object.fromEntries(ms.map(k => [k, 1]));
const clean = (o: Record<Id, number>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0));
const cents2 = (c: number) => (c / 100).toFixed(2);

/** "g:<grupo>" o "p:<persona>" (gasto de a dos, sin grupo). */
function targetOf(s: Snapshot, groupId: Id) {
  const g = groupOf(s, groupId);
  return g?.kind === 'directo' ? `p:${g.members.find(m => m !== s.me)}` : `g:${groupId}`;
}
/** Quienes consumen (el fondo común no). */
function membersOf(s: Snapshot, target: string): Id[] {
  if (target.startsWith('p:')) return [s.me, target.slice(2)];
  return (groupOf(s, target.slice(2))?.members ?? [s.me]).filter(m => !s.profiles[m]?.fundOf);
}
/** Quienes pueden pagar: las personas y, si hay, el fondo común del grupo. */
function payersOf(s: Snapshot, target: string): Id[] {
  const f = target.startsWith('g:') ? fundOf(s, target.slice(2)) : null;
  return f ? [...membersOf(s, target), f] : membersOf(s, target);
}
function initVals(e: Expense): Record<Id, string> {
  if (e.splitMode === 'exact') return Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [k, cents2(v)]));
  return Object.fromEntries(Object.entries(e.splitParams.vals ?? {}).map(([k, v]) => [k, String(v)]));
}

export function AddExpenseSheet() {
  const p = useLocalSearchParams<{ groupId?: string; friendId?: string; edit?: string; payer?: string; desc?: string; cat?: string; clear?: string }>();
  const s = useS(), c = useC(), toast = useToast(), insets = useSafeAreaInsets();
  const edit = p.edit ? s.expenses.find(e => e.id === p.edit) : undefined;
  const first = visibleGroups(s)[0]?.id;
  const [target, setTarget] = useState(edit ? targetOf(s, edit.groupId) : p.friendId ? `p:${p.friendId}` : p.groupId ? targetOf(s, p.groupId) : first ? `g:${first}` : '');
  const members = membersOf(s, target), payerIds = payersOf(s, target);
  const [step, setStep] = useState<1 | 2>(edit ? 2 : 1);
  const [amt, setAmt] = useState(edit && edit.splitMode !== 'items' ? String(edit.amount / 100) : '');
  const [cur, setCur] = useState(edit?.currency ?? 'DOP');
  const [rate, setRate] = useState(edit && edit.currency !== 'DOP' ? String(edit.fxRate) : '');
  const [rateNote, setRateNote] = useState('');
  const [desc, setDesc] = useState(edit?.description ?? p.desc ?? '');
  const [catKey, setCatKey] = useState<string | null>(edit?.category ?? p.cat ?? null);
  const [repeat, setRepeat] = useState(edit?.repeat ?? '');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [scanning, setScanning] = useState(false);
  const [date, setDate] = useState(edit?.date ?? today());
  const [note, setNote] = useState(edit?.note ?? '');
  const [multi, setMulti] = useState(edit ? Object.keys(edit.payers).length > 1 : false);
  const [payer, setPayer] = useState<Id>(edit ? Object.keys(edit.payers)[0] : p.payer ?? s.me);
  const [payVals, setPayVals] = useState<Record<Id, string>>(edit ? Object.fromEntries(Object.entries(edit.payers).map(([k, v]) => [k, cents2(v)])) : {});
  const [mode, setMode] = useState<Mode>(edit ? modeOf(edit) : 'equal');
  const [on, setOn] = useState<Record<Id, boolean>>(edit ? Object.fromEntries(Object.keys(edit.shares).map(k => [k, true])) : Object.fromEntries(members.map(k => [k, true])));
  const [vals, setVals] = useState<Record<Id, string>>(edit ? initVals(edit) : {});
  const [items, setItems] = useState<ItemDraft[]>(edit?.items ? edit.items.map(i => ({ name: i.name, price: cents2(i.price), to: i.to })) : []);
  const [tax, setTax] = useState(edit ? edit.tax > 0 : true);
  const [tip, setTip] = useState(edit ? edit.tip > 0 : true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // la tasa del dólar que usaste la última vez
  useEffect(() => { if (!edit) AsyncStorage.getItem(RATE_KEY).then(r => { if (r) setRate(x => x || r); }, () => {}); }, [edit]);
  // en dólares: la tasa de hoy si no hay una escrita
  useEffect(() => {
    if (cur === 'DOP' || edit) return;
    let live = true;
    fetchUsdRate().then(r => { if (live && r) { setRate(x => x || String(r)); setRateNote(tr("Tasa de hoy: RD$ {0} (ExchangeRate-API)", r.toFixed(2))); } });
    return () => { live = false; };
  }, [cur, edit]);

  if (!target) return (
    <Sheet head={<SheetHead title={tr("Nuevo gasto")} />}>
      <Empty icon="users" title={tr("Primero, un grupo")}>{tr("Para anotar un gasto necesitas un grupo o alguien con quien dividir.")}</Empty>
      <Btn title={tr("Crear grupo")} icon="plus" kind="primary" size="lg" onPress={() => { go.back(); go.newGroup(); }} />
    </Sheet>
  );

  const catK = catKey ?? guessCat(desc);
  const fmt = (x: number) => moneyT(x, cur);
  const parsedItems = items.map(i => ({ name: i.name.trim() || tr("Ítem"), price: parseMoney(i.price), to: i.to }));
  const ix = itemSplit(parsedItems, tax ? 18 : 0, tip ? 10 : 0);
  const total = mode === 'items' ? ix.total : parseMoney(amt || '0');
  const splitMode: SplitMode = mode === 'nights' ? 'shares' : mode;
  const r = mode === 'items'
    ? { shares: ix.shares, ok: parsedItems.length > 0 && !ix.unassigned && parsedItems.every(i => i.price > 0),
        status: !parsedItems.length ? 'Agrega los ítems del recibo' : parsedItems.some(i => i.price <= 0) ? 'A un ítem le falta el precio'
          : ix.unassigned ? `${plural(ix.unassigned, tr("ítem"), tr("ítems"))} sin nadie asignado` : 'Cuadra con el recibo' }
    : (() => { const x = split(splitMode, total, members, { on, vals }, fmt); return mode === 'nights' ? { ...x, status: x.ok ? x.status.replace('partes', 'noches') : 'Pon cuántas noches estuvo cada quien' } : x; })();
  const payers: Record<Id, number> = multi ? clean(Object.fromEntries(payerIds.map(k => [k, parseMoney(payVals[k] ?? '')]))) : { [payer]: total };
  const paidDiff = total - sum(payers);
  const rateN = cur === 'DOP' ? 1 : Number(rate.replace(',', '.'));
  const okRate = cur === 'DOP' || rateN > 0;
  const ok = r.ok && paidDiff === 0 && okRate && total > 0;
  const status = !r.ok ? r.status : paidDiff ? tr("Lo pagado no cuadra: {0} {1}", paidDiff > 0 ? tr("faltan") : tr("sobran"), fmt(Math.abs(paidDiff))) : !okRate ? tr("Falta la tasa del dólar") : r.status;

  const key = (k: string) => {
    buzz();
    setAmt(a => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.') return a.includes('.') ? a : (a || '0') + '.';
      if ((a.split('.')[1] ?? '').length >= 2 || a.replace('.', '').length >= 9) return a;
      return a === '0' ? k : a + k;
    });
  };
  const pickMode = (m: Mode, ms = members, t = parseMoney(amt || '0')) => {
    setMode(m);
    if (m === 'equal') setOn(Object.fromEntries(ms.map(k => [k, true])));
    if (m === 'exact') { const a = apportion(t, ones(ms)); setVals(Object.fromEntries(ms.map(k => [k, cents2(a[k])]))); }
    if (m === 'percent') { const a = apportion(10000, ones(ms)); setVals(Object.fromEntries(ms.map(k => [k, String(a[k] / 100)]))); }
    if (m === 'shares' || m === 'nights') setVals(Object.fromEntries(ms.map(k => [k, '1'])));
    if (m === 'adjust') setVals({});
    if (m === 'items' && !items.length) setItems([{ name: '', price: '', to: [...ms] }]);
  };
  const changeTarget = (t: string) => {
    const ms = membersOf(s, t);
    setTarget(t); setPayer(s.me); setPayVals({});
    setItems(its => its.map(i => ({ ...i, to: i.to.filter(k => ms.includes(k)) })));
    pickMode(mode, ms);
  };
  const setItem = (i: number, patch: Partial<ItemDraft>) => setItems(its => its.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  // un gasto de siempre: lo mismo de la última vez (grupo, monto, categoría y cómo se dividió)
  const useTemplate = (e: Expense) => {
    buzz();
    setTarget(targetOf(s, e.groupId)); setDesc(e.description); setCatKey(e.category); setCur(e.currency);
    if (e.currency !== 'DOP') setRate(String(e.fxRate));
    setAmt(e.splitMode === 'items' ? '' : String(e.amount / 100)); setMode(modeOf(e)); setVals(initVals(e));
    setOn(Object.fromEntries(Object.keys(e.shares).map(k => [k, true])));
    setMulti(Object.keys(e.payers).length > 1); setPayer(Object.keys(e.payers)[0]);
    setPayVals(Object.fromEntries(Object.entries(e.payers).map(([k, v]) => [k, cents2(v)])));
    if (e.items) setItems(e.items.map(i => ({ name: i.name, price: cents2(i.price), to: i.to })));
  };
  const scan = async () => {
    try {
      const ph = await pickPhoto(); if (!ph) return;
      setScanning(true);
      const res = await getBackend()!.scanReceipt(ph.base64, 'image/jpeg');
      if (!res.items.length) throw new Error(tr("No encontramos ítems en esa foto. Prueba con más luz o anótalos a mano."));
      setPhoto(ph);
      setItems(res.items.map(i => ({ name: i.name, price: cents2(i.price), to: [...members] })));
      setTax(res.tax > 0); setTip(res.tip > 0);
      if (!desc.trim() && res.merchant) setDesc(res.merchant);
      if (res.date && res.date <= today()) setDate(res.date);
      setMode('items'); setStep(2); buzz();
      toast(tr("Leímos {0}: revisa y marca quién comió qué", plural(res.items.length, tr("ítem"), tr("ítems"))));
    } catch (e) { toast(errMsg(e)); } finally { setScanning(false); }
  };
  const attach = async () => { try { const ph = await pickPhoto(); if (ph) setPhoto(ph); } catch (e) { toast(errMsg(e)); } };

  const save = async () => {
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      let id = '', gid = '';
      await run(async b => {
        gid = edit ? edit.groupId : target.startsWith('p:') ? await b.directGroup(target.slice(2)) : target.slice(2);
        id = await b.saveExpense({
          id: edit?.id, groupId: gid, description: desc.trim() || cat(catK).name, category: catK, date, currency: cur, amount: total, fxRate: rateN,
          splitMode, splitParams: mode === 'equal' ? { on: members.filter(k => on[k]) } : mode === 'items' ? {}
            : { vals: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v.replace(',', '.')) || 0])), ...(mode === 'nights' && { unit: 'noches' as const }) },
          items: mode === 'items' ? parsedItems : null, tax: mode === 'items' && tax ? 18 : 0, tip: mode === 'items' && tip ? 10 : 0,
          note: note.trim() || null, repeat: repeat || null, payers, shares: clean(r.shares), isPayment: false,
        });
        for (const it of (p.clear ?? '').split(',').filter(Boolean)) await b.deleteItem(it).catch(() => {});
      });
      if (cur !== 'DOP') AsyncStorage.setItem(RATE_KEY, rate).catch(() => {});
      buzz(); go.back();
      toast(edit ? tr("Cambios guardados") : tr("Gasto guardado"), edit ? undefined : () => { run(b => b.deleteExpense(id)).catch(e => toast(errMsg(e))); });
      if (photo) {
        const path = expensePhotoPath(gid, id);
        run(async b => { await b.uploadPhoto(path, { data: photo.data, type: 'image/jpeg', uri: photo.uri }); await b.setExpensePhoto(id, path); })
          .catch(e => toast(tr("El gasto quedó, pero la foto no: {0}", errMsg(e))));
      }
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };

  const usual = !edit && !amt && !desc ? frequentExpenses(s) : [];
  const targetName = target.startsWith('p:') ? tr("Con {0}", short(s, target.slice(2))) : groupOf(s, target.slice(2))?.name ?? '';
  const numIn = (value: string, onChangeText: (v: string) => void, label: string, pre = '', suf = '', wide = false) => (
    <View style={[a.numIn, { borderColor: c.line, backgroundColor: c.surface }, wide && { flex: 1, width: undefined }]}>
      {pre ? <Txt c="muted">{pre}</Txt> : null}
      <TextInput value={value} onChangeText={onChangeText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={c.faint} accessibilityLabel={label} selectTextOnFocus
        style={[a.numField, { color: c.fg, textAlign: wide ? 'left' : 'right' }]} />
      {suf ? <Txt c="muted">{suf}</Txt> : null}
    </View>
  );

  if (step === 1) return (
    <Sheet
      head={<SheetHead title={edit ? tr("Editar gasto") : tr("Nuevo gasto")}
        right={<LinkBtn title={tr("Siguiente")} strong disabled={!(parseMoney(amt || '0') > 0 && okRate)} onPress={() => { if (mode === 'exact') pickMode('exact'); setStep(2); }} />} />}
      footer={
        <View style={[a.keypad, { backgroundColor: c.surface2, paddingBottom: insets.bottom + 12 }]} accessibilityLabel={tr("Teclado del monto")}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(k => (
            <Pressable key={k} onPress={() => key(k)} accessibilityRole="button" accessibilityLabel={k === 'del' ? tr("Borrar") : k === '.' ? tr("Punto") : k}
              style={({ pressed }) => [a.key, { backgroundColor: pressed ? c.accentSoft : c.surface, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              {k === 'del' ? <Icon n="del" size={26} /> : <Txt f="medium" s={26} lh={32}>{k}</Txt>}
            </Pressable>
          ))}
        </View>
      }>
      <View style={a.amount}>
        <Pressable onPress={() => setCur(x => (x === 'DOP' ? 'USD' : 'DOP'))} accessibilityRole="button" accessibilityLabel={tr("Moneda: {0}. Cambiar", curSym(cur))}
          style={[a.cur, { backgroundColor: c.surface2 }]}><Txt f="semi" s={17} c="fg2">{curSym(cur)}</Txt></Pressable>
        <Txt f="display" s={52} lh={58} color={amt ? c.fg : c.faint} style={{ fontVariant: ['tabular-nums'], flexShrink: 1 }} lines={1}>{amt ? typed(amt) : '0.00'}</Txt>
      </View>
      {cur !== 'DOP' && <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt c="muted">{tr("RD$ por US$ 1:")}</Txt>{numIn(rate, setRate, tr("Tasa del dólar"), '', '', true)}
        </View>
        {rateNote ? <Note center>{rateNote}</Note> : null}
        {rateN > 0 && parseMoney(amt || '0') > 0 && <Note center>{tr("Equivale a {0}", moneyT(Math.round(parseMoney(amt) * rateN)))}</Note>}
      </>}
      {usual.length > 0 && <SheetH3>{tr("De siempre")}</SheetH3>}
      {usual.length > 0 && <Chips>{usual.map(e => <Chip key={e.id} title={e.description} left={<View style={{ paddingLeft: 8 }}><Icon n={cat(e.category).icon} sm color={c.fg2} /></View>} onPress={() => useTemplate(e)} />)}</Chips>}
      <Field placeholder={tr("¿En qué fue?")} value={desc} onChangeText={setDesc} returnKeyType="done" accessibilityLabel={tr("Descripción")} autoCapitalize="sentences" />
      <Chips>
        <ChoiceChip icon="users" title={tr("Grupo o persona")} value={target} onChange={changeTarget} disabled={!!edit}
          groups={[
            ...(visibleGroups(s).length ? [{ title: tr("Grupos"), options: visibleGroups(s).map(g => [`g:${g.id}`, g.name] as [string, string]) }] : []),
            ...(friends(s).length ? [{ title: tr("Solo entre dos"), options: friends(s).map(f => [`p:${f}`, tr("Con {0}", s.profiles[f].name)] as [string, string]) }] : []),
          ]} />
        <DateChip value={date} onChange={setDate} />
        <ChoiceChip icon={cat(catK).icon} title={tr("Categoría")} value={catK} onChange={setCatKey}
          groups={[{ options: Object.entries(CATS).filter(([k]) => k !== 'pago').map(([k, x]) => [k, tr(x.name)] as [string, string]) }]} />
        {(!edit || !edit.repeatFrom) && <ChoiceChip icon="repeat" title={tr("Se repite")} value={repeat} onChange={setRepeat} groups={[{ options: REPEATS.map(([k, l]) => [k, tr(l)] as [string, string]) }]} />}
      </Chips>
      <Field placeholder={tr("Nota (opcional)")} value={note} onChangeText={setNote} returnKeyType="done" accessibilityLabel={tr("Nota")} />
      {!edit && <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable onPress={scan} disabled={scanning} accessibilityRole="button" style={[a.scan, { borderColor: c.line, flex: 1, opacity: scanning ? 0.6 : 1 }]}>
          <Icon n="receipt" color={c.accentInk} />
          <View style={{ flex: 1 }}><Txt f="semi">{scanning ? tr("Leyendo el recibo…") : tr("Escanear el recibo")}</Txt><Txt s={13} c="muted">{tr("Una foto y los ítems, el ITBIS y la ley se llenan solos")}</Txt></View>
        </Pressable>
        <Pressable onPress={() => { pickMode('items'); setStep(2); }} accessibilityRole="button" accessibilityLabel={tr("Dividir por ítems a mano")} style={[a.scan, { borderColor: c.line, width: 84, flexDirection: 'column', gap: 4, justifyContent: 'center' }]}>
          <Icon n="edit" color={c.accentInk} /><Txt f="semi" s={13}>{tr("A mano")}</Txt>
        </Pressable>
      </View>}
      {!edit && (photo
        ? <View style={[a.attach, { backgroundColor: c.surface }]}><Image source={{ uri: photo.uri }} style={a.thumb} />
            <View style={{ flex: 1 }}><Txt f="semi">{tr("Foto del comprobante")}</Txt><Txt s={14} c="muted">{tr("Se sube al guardar")}</Txt></View>
            <LinkBtn title={tr("Quitar")} onPress={() => setPhoto(null)} /></View>
        : <LinkBtn title={tr("Adjuntar foto del comprobante")} icon="plus" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={attach} />)}
    </Sheet>
  );

  return (
    <Sheet head={<SheetHead title={tr("Dividir")} left={edit ? undefined : <LinkBtn title={tr("Monto")} icon="left" onPress={() => setStep(1)} />}
      right={<LinkBtn title={tr("Guardar")} strong disabled={!ok || busy} onPress={save} />} />}>
      {edit && <LinkBtn title={tr("Cambiar monto, fecha o descripción")} icon="edit" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => setStep(1)} />}
      <View style={a.recap}><Txt f="semi" c="muted" lines={1} style={{ flex: 1 }}>{desc.trim() || cat(catK).name} · {targetName}</Txt><Money c={total} cur={cur} s={22} /></View>
      <SheetH3>{tr("Pagó")}</SheetH3>
      <Chips>
        {payerIds.map(k => <Chip key={k} title={short(s, k)} on={!multi && payer === k} left={<Av id={k} size="xs" />} onPress={() => { setMulti(false); setPayer(k); buzz(); }} />)}
        <Chip title={tr("Varios")} on={multi} onPress={() => setMulti(true)} />
      </Chips>
      {multi && <List>{payerIds.map(k => (
        <Row key={k} style={{ minHeight: 60 }}><Av id={k} /><Main><Txt f="semi">{short(s, k)}</Txt></Main>
          {numIn(payVals[k] ?? '', v => setPayVals(x => ({ ...x, [k]: v })), tr("Lo que pagó {0}", short(s, k)), curSym(cur))}</Row>))}</List>}
      <SheetH3>{tr("Cómo se divide")}</SheetH3>
      <Seg label={tr("Forma de dividir")} scroll value={mode} onChange={m => pickMode(m)} options={MODES.map(([m, l]) => [m, tr(l)] as [Mode, string])} />
      {mode === 'items' ? <>
        <View>{items.map((it, i) => (
          <View key={i} style={[a.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.line }]}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Field style={{ flex: 1, minHeight: SIZE.touch }} placeholder={tr("Ítem")} value={it.name} onChangeText={v => setItem(i, { name: v })} accessibilityLabel={tr("Nombre del ítem {0}", i + 1)} />
              {numIn(it.price, v => setItem(i, { price: v }), tr("Precio del ítem {0}", i + 1), curSym(cur))}
              <Pressable onPress={() => setItems(its => its.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={tr("Quitar ítem")}
                style={[a.iconBtn, { backgroundColor: c.surface2 }]}><Icon n="trash" sm color={c.muted} /></Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{members.map(k => {
              const inIt = it.to.includes(k);
              return (
                <Pressable key={k} onPress={() => { buzz(); setItem(i, { to: inIt ? it.to.filter(x => x !== k) : [...it.to, k] }); }}
                  accessibilityRole="checkbox" accessibilityState={{ checked: inIt }} accessibilityLabel={tr("{0} en {1}", short(s, k), it.name || tr("este ítem"))}
                  style={[a.avt, { borderColor: inIt ? c.accentInk : 'transparent' }]}><Av id={k} size="sm" dim={!inIt} /></Pressable>
              );
            })}</View>
          </View>))}</View>
        <Btn title={tr("Ítem")} icon="plus" style={{ alignSelf: 'flex-start' }} onPress={() => setItems(its => [...its, { name: '', price: '', to: [...members] }])} />
        <Chips>
          <Chip title={tr("ITBIS 18 %")} on={tax} onPress={() => setTax(v => !v)} />
          <Chip title={tr("Ley 10 %")} on={tip} onPress={() => setTip(v => !v)} />
        </Chips>
        <Totals cur={cur} total={ix.total} rows={[['Subtotal', ix.subtotal], ...(tax ? [['ITBIS 18 %', ix.taxC] as [string, number]] : []), ...(tip ? [[tr("Ley 10 %"), ix.tipC] as [string, number]] : [])]} />
        <List>{members.map(k => (
          <Row key={k} style={{ minHeight: 60 }}><Av id={k} /><Main><Txt f="semi">{short(s, k)}</Txt></Main><Money c={r.shares[k] || 0} cur={cur} /></Row>))}</List>
      </> : (
        <List>{members.map(k => {
          if (mode === 'equal') {
            const inIt = !!on[k];
            return (
              <Row key={k} style={{ minHeight: 60 }} onPress={() => { buzz(); setOn(o => ({ ...o, [k]: !o[k] })); }} label={short(s, k)}>
                <Av id={k} dim={!inIt} /><Main><Txt f="semi" style={{ opacity: inIt ? 1 : 0.45 }}>{short(s, k)}</Txt></Main>
                {inIt ? <Money c={r.shares[k] || 0} cur={cur} /> : <Txt s={13} c="muted">{tr("no entra")}</Txt>}
                <View style={[a.box, { borderColor: inIt ? c.accent : c.line, backgroundColor: inIt ? c.accent : 'transparent' }]}>
                  {inIt && <Animated.View entering={ANIM ? ZoomIn.duration(220) : undefined}><Icon n="check" sm color={c.accentFg} /></Animated.View>}
                </View>
              </Row>
            );
          }
          return (
            <Row key={k} style={{ minHeight: 60 }}>
              <Av id={k} />
              <Main><Txt f="semi">{short(s, k)}</Txt>{mode !== 'exact' && <Txt s={14} c="muted">{fmt(r.shares[k] || 0)}</Txt>}</Main>
              {mode === 'exact' ? numIn(vals[k] ?? '', v => setVals(x => ({ ...x, [k]: v })), short(s, k), curSym(cur))
                : mode === 'percent' ? numIn(vals[k] ?? '', v => setVals(x => ({ ...x, [k]: v })), short(s, k), '', '%')
                : mode === 'adjust' ? numIn(vals[k] ?? '', v => setVals(x => ({ ...x, [k]: v })), short(s, k), '+')
                : (
                  <View style={[a.stepper, { backgroundColor: c.surface2 }]}>
                    <Pressable style={a.stepBtn} accessibilityLabel={tr("Menos {0} para {1}", mode === 'nights' ? tr("noches") : tr("partes"), short(s, k))}
                      onPress={() => { buzz(); setVals(x => ({ ...x, [k]: String(Math.max(0, (Number(x[k]) || 0) - 1)) })); }}><Txt s={22}>−</Txt></Pressable>
                    <Txt f="semi" style={{ minWidth: 24, textAlign: 'center' }}>{vals[k] ?? 0}</Txt>
                    <Pressable style={a.stepBtn} accessibilityLabel={tr("Más {0} para {1}", mode === 'nights' ? tr("noches") : tr("partes"), short(s, k))}
                      onPress={() => { buzz(); setVals(x => ({ ...x, [k]: String((Number(x[k]) || 0) + 1) })); }}><Txt s={22}>+</Txt></Pressable>
                  </View>
                )}
            </Row>
          );
        })}</List>
      )}
      <SplitStatus ok={ok}>{status}</SplitStatus>
      {err ? <Txt f="medium" s={15} c="danger" center>{err}</Txt> : null}
      <Btn title={busy ? tr("Guardando…") : edit ? tr("Guardar cambios") : tr("Guardar gasto")} kind="primary" size="lg" disabled={!ok || busy} onPress={save} />
    </Sheet>
  );
}

const a = StyleSheet.create({
  amount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 16, paddingBottom: 6 },
  cur: { minHeight: SIZE.touch, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, paddingHorizontal: 12 },
  key: { width: '31.6%', flexGrow: 1, height: SIZE.key, borderRadius: R.key, alignItems: 'center', justifyContent: 'center' },
  scan: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed' },
  recap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 4 },
  numIn: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 132, minHeight: SIZE.touch, paddingHorizontal: 12, borderRadius: R.control, borderWidth: 1 },
  numField: { flex: 1, minWidth: 0, fontFamily: F.regular, fontSize: 16, fontVariant: ['tabular-nums'], padding: 0 },
  item: { gap: 8, paddingVertical: 12 },
  iconBtn: { width: SIZE.touch, height: SIZE.touch, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avt: { borderRadius: 999, padding: 2, borderWidth: 2 },
  box: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: R.control },
  stepBtn: { width: SIZE.touch, height: SIZE.touch, alignItems: 'center', justifyContent: 'center' },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 16 },
  thumb: { width: 52, height: 52, borderRadius: 10 },
});

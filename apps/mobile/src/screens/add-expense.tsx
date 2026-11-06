import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  apportion, cat, CATS, curSym, friends, groupOf, guessCat, itemSplit, moneyT, parseMoney, plural, run, short, split, sum, today, typed,
  visibleGroups, type Expense, type Id, type Snapshot, type SplitMode,
} from '@saldao/core';
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

const MODES: [SplitMode, string][] = [['equal', 'Iguales'], ['exact', 'Montos'], ['percent', '%'], ['shares', 'Partes'], ['adjust', 'Extra'], ['items', 'Ítems']];
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
function membersOf(s: Snapshot, target: string): Id[] {
  if (target.startsWith('p:')) return [s.me, target.slice(2)];
  return groupOf(s, target.slice(2))?.members ?? [s.me];
}
function initVals(e: Expense): Record<Id, string> {
  if (e.splitMode === 'exact') return Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [k, cents2(v)]));
  return Object.fromEntries(Object.entries(e.splitParams.vals ?? {}).map(([k, v]) => [k, String(v)]));
}

export function AddExpenseSheet() {
  const p = useLocalSearchParams<{ groupId?: string; friendId?: string; edit?: string }>();
  const s = useS(), c = useC(), toast = useToast(), insets = useSafeAreaInsets();
  const edit = p.edit ? s.expenses.find(e => e.id === p.edit) : undefined;
  const first = visibleGroups(s)[0]?.id;
  const [target, setTarget] = useState(edit ? targetOf(s, edit.groupId) : p.friendId ? `p:${p.friendId}` : p.groupId ? targetOf(s, p.groupId) : first ? `g:${first}` : '');
  const members = membersOf(s, target);
  const [step, setStep] = useState<1 | 2>(edit ? 2 : 1);
  const [amt, setAmt] = useState(edit && edit.splitMode !== 'items' ? String(edit.amount / 100) : '');
  const [cur, setCur] = useState(edit?.currency ?? 'DOP');
  const [rate, setRate] = useState(edit && edit.currency !== 'DOP' ? String(edit.fxRate) : '');
  const [desc, setDesc] = useState(edit?.description ?? '');
  const [catKey, setCatKey] = useState<string | null>(edit?.category ?? null);
  const [date, setDate] = useState(edit?.date ?? today());
  const [note, setNote] = useState(edit?.note ?? '');
  const [multi, setMulti] = useState(edit ? Object.keys(edit.payers).length > 1 : false);
  const [payer, setPayer] = useState<Id>(edit ? Object.keys(edit.payers)[0] : s.me);
  const [payVals, setPayVals] = useState<Record<Id, string>>(edit ? Object.fromEntries(Object.entries(edit.payers).map(([k, v]) => [k, cents2(v)])) : {});
  const [mode, setMode] = useState<SplitMode>(edit?.splitMode ?? 'equal');
  const [on, setOn] = useState<Record<Id, boolean>>(edit ? Object.fromEntries(Object.keys(edit.shares).map(k => [k, true])) : Object.fromEntries(members.map(k => [k, true])));
  const [vals, setVals] = useState<Record<Id, string>>(edit ? initVals(edit) : {});
  const [items, setItems] = useState<ItemDraft[]>(edit?.items ? edit.items.map(i => ({ name: i.name, price: cents2(i.price), to: i.to })) : []);
  const [tax, setTax] = useState(edit ? edit.tax > 0 : true);
  const [tip, setTip] = useState(edit ? edit.tip > 0 : true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // la tasa del dólar que usaste la última vez
  useEffect(() => { if (!edit) AsyncStorage.getItem(RATE_KEY).then(r => { if (r) setRate(x => x || r); }, () => {}); }, [edit]);

  if (!target) return (
    <Sheet head={<SheetHead title="Nuevo gasto" />}>
      <Empty icon="users" title="Primero, un grupo">Para anotar un gasto necesitas un grupo o alguien con quien dividir.</Empty>
      <Btn title="Crear grupo" icon="plus" kind="primary" size="lg" onPress={() => { go.back(); go.newGroup(); }} />
    </Sheet>
  );

  const catK = catKey ?? guessCat(desc);
  const fmt = (x: number) => moneyT(x, cur);
  const parsedItems = items.map(i => ({ name: i.name.trim() || 'Ítem', price: parseMoney(i.price), to: i.to }));
  const ix = itemSplit(parsedItems, tax ? 18 : 0, tip ? 10 : 0);
  const total = mode === 'items' ? ix.total : parseMoney(amt || '0');
  const r = mode === 'items'
    ? { shares: ix.shares, ok: parsedItems.length > 0 && !ix.unassigned && parsedItems.every(i => i.price > 0),
        status: !parsedItems.length ? 'Agrega los ítems del recibo' : parsedItems.some(i => i.price <= 0) ? 'A un ítem le falta el precio'
          : ix.unassigned ? `${plural(ix.unassigned, 'ítem', 'ítems')} sin nadie asignado` : 'Cuadra con el recibo' }
    : split(mode, total, members, { on, vals }, fmt);
  const payers: Record<Id, number> = multi ? clean(Object.fromEntries(members.map(k => [k, parseMoney(payVals[k] ?? '')]))) : { [payer]: total };
  const paidDiff = total - sum(payers);
  const rateN = cur === 'DOP' ? 1 : Number(rate.replace(',', '.'));
  const okRate = cur === 'DOP' || rateN > 0;
  const ok = r.ok && paidDiff === 0 && okRate && total > 0;
  const status = !r.ok ? r.status : paidDiff ? `Lo pagado no cuadra: ${paidDiff > 0 ? 'faltan' : 'sobran'} ${fmt(Math.abs(paidDiff))}` : !okRate ? 'Falta la tasa del dólar' : r.status;

  const key = (k: string) => {
    buzz();
    setAmt(a => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.') return a.includes('.') ? a : (a || '0') + '.';
      if ((a.split('.')[1] ?? '').length >= 2 || a.replace('.', '').length >= 9) return a;
      return a === '0' ? k : a + k;
    });
  };
  const pickMode = (m: SplitMode, ms = members, t = parseMoney(amt || '0')) => {
    setMode(m);
    if (m === 'equal') setOn(Object.fromEntries(ms.map(k => [k, true])));
    if (m === 'exact') { const a = apportion(t, ones(ms)); setVals(Object.fromEntries(ms.map(k => [k, cents2(a[k])]))); }
    if (m === 'percent') { const a = apportion(10000, ones(ms)); setVals(Object.fromEntries(ms.map(k => [k, String(a[k] / 100)]))); }
    if (m === 'shares') setVals(Object.fromEntries(ms.map(k => [k, '1'])));
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

  const save = async () => {
    if (!ok) return;
    setBusy(true); setErr('');
    try {
      let id = '';
      await run(async b => {
        const gid = edit ? edit.groupId : target.startsWith('p:') ? await b.directGroup(target.slice(2)) : target.slice(2);
        id = await b.saveExpense({
          id: edit?.id, groupId: gid, description: desc.trim() || cat(catK).name, category: catK, date, currency: cur, amount: total, fxRate: rateN,
          splitMode: mode, splitParams: mode === 'equal' ? { on: members.filter(k => on[k]) } : mode === 'items' ? {} : { vals: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v.replace(',', '.')) || 0])) },
          items: mode === 'items' ? parsedItems : null, tax: mode === 'items' && tax ? 18 : 0, tip: mode === 'items' && tip ? 10 : 0,
          note: note.trim() || null, repeat: null, payers, shares: clean(r.shares), isPayment: false,
        });
      });
      if (cur !== 'DOP') AsyncStorage.setItem(RATE_KEY, rate).catch(() => {});
      buzz(); go.back();
      toast(edit ? 'Cambios guardados' : 'Gasto guardado', edit ? undefined : () => { run(b => b.deleteExpense(id)).catch(e => toast(errMsg(e))); });
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };

  const targetName = target.startsWith('p:') ? `Con ${short(s, target.slice(2))}` : groupOf(s, target.slice(2))?.name ?? '';
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
      head={<SheetHead title={edit ? 'Editar gasto' : 'Nuevo gasto'}
        right={<LinkBtn title="Siguiente" strong disabled={!(parseMoney(amt || '0') > 0 && okRate)} onPress={() => { if (mode === 'exact') pickMode('exact'); setStep(2); }} />} />}
      footer={
        <View style={[a.keypad, { backgroundColor: c.surface2, paddingBottom: insets.bottom + 12 }]} accessibilityLabel="Teclado del monto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(k => (
            <Pressable key={k} onPress={() => key(k)} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Borrar' : k === '.' ? 'Punto' : k}
              style={({ pressed }) => [a.key, { backgroundColor: pressed ? c.accentSoft : c.surface, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              {k === 'del' ? <Icon n="del" size={26} /> : <Txt f="medium" s={26} lh={32}>{k}</Txt>}
            </Pressable>
          ))}
        </View>
      }>
      <View style={a.amount}>
        <Pressable onPress={() => setCur(x => (x === 'DOP' ? 'USD' : 'DOP'))} accessibilityRole="button" accessibilityLabel={`Moneda: ${curSym(cur)}. Cambiar`}
          style={[a.cur, { backgroundColor: c.surface2 }]}><Txt f="semi" s={17} c="fg2">{curSym(cur)}</Txt></Pressable>
        <Txt f="display" s={52} lh={58} color={amt ? c.fg : c.faint} style={{ fontVariant: ['tabular-nums'], flexShrink: 1 }} lines={1}>{amt ? typed(amt) : '0.00'}</Txt>
      </View>
      {cur !== 'DOP' && <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt c="muted">RD$ por US$ 1:</Txt>{numIn(rate, setRate, 'Tasa del dólar', '', '', true)}
        </View>
        {rateN > 0 && parseMoney(amt || '0') > 0 && <Note center>Equivale a {moneyT(Math.round(parseMoney(amt) * rateN))}</Note>}
      </>}
      <Field placeholder="¿En qué fue?" value={desc} onChangeText={setDesc} returnKeyType="done" accessibilityLabel="Descripción" autoCapitalize="sentences" />
      <Chips>
        <ChoiceChip icon="users" title="Grupo o persona" value={target} onChange={changeTarget} disabled={!!edit}
          groups={[
            ...(visibleGroups(s).length ? [{ title: 'Grupos', options: visibleGroups(s).map(g => [`g:${g.id}`, g.name] as [string, string]) }] : []),
            ...(friends(s).length ? [{ title: 'Solo entre dos', options: friends(s).map(f => [`p:${f}`, `Con ${s.profiles[f].name}`] as [string, string]) }] : []),
          ]} />
        <DateChip value={date} onChange={setDate} />
        <ChoiceChip icon={cat(catK).icon} title="Categoría" value={catK} onChange={setCatKey}
          groups={[{ options: Object.entries(CATS).filter(([k]) => k !== 'pago').map(([k, x]) => [k, x.name] as [string, string]) }]} />
      </Chips>
      <Field placeholder="Nota (opcional)" value={note} onChangeText={setNote} returnKeyType="done" accessibilityLabel="Nota" />
      <Pressable onPress={() => { pickMode('items'); setStep(2); }} accessibilityRole="button" style={[a.scan, { borderColor: c.line }]}>
        <Icon n="receipt" color={c.accentInk} />
        <View style={{ flex: 1 }}><Txt f="semi">Dividir por ítems del recibo</Txt><Txt s={13} c="muted">Cada quien paga lo suyo, con ITBIS y ley repartidos</Txt></View>
      </Pressable>
    </Sheet>
  );

  return (
    <Sheet head={<SheetHead title="Dividir" left={edit ? undefined : <LinkBtn title="Monto" icon="left" onPress={() => setStep(1)} />}
      right={<LinkBtn title="Guardar" strong disabled={!ok || busy} onPress={save} />} />}>
      {edit && <LinkBtn title="Cambiar monto, fecha o descripción" icon="edit" style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} onPress={() => setStep(1)} />}
      <View style={a.recap}><Txt f="semi" c="muted" lines={1} style={{ flex: 1 }}>{desc.trim() || cat(catK).name} · {targetName}</Txt><Money c={total} cur={cur} s={22} /></View>
      <SheetH3>Pagó</SheetH3>
      <Chips>
        {members.map(k => <Chip key={k} title={short(s, k)} on={!multi && payer === k} left={<Av id={k} size="xs" />} onPress={() => { setMulti(false); setPayer(k); buzz(); }} />)}
        <Chip title="Varios" on={multi} onPress={() => setMulti(true)} />
      </Chips>
      {multi && <List>{members.map(k => (
        <Row key={k} style={{ minHeight: 60 }}><Av id={k} /><Main><Txt f="semi">{short(s, k)}</Txt></Main>
          {numIn(payVals[k] ?? '', v => setPayVals(x => ({ ...x, [k]: v })), `Lo que pagó ${short(s, k)}`, curSym(cur))}</Row>))}</List>}
      <SheetH3>Cómo se divide</SheetH3>
      <Seg label="Forma de dividir" scroll value={mode} onChange={m => pickMode(m)} options={MODES} />
      {mode === 'items' ? <>
        <View>{items.map((it, i) => (
          <View key={i} style={[a.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: c.line }]}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Field style={{ flex: 1, minHeight: SIZE.touch }} placeholder="Ítem" value={it.name} onChangeText={v => setItem(i, { name: v })} accessibilityLabel={`Nombre del ítem ${i + 1}`} />
              {numIn(it.price, v => setItem(i, { price: v }), `Precio del ítem ${i + 1}`, curSym(cur))}
              <Pressable onPress={() => setItems(its => its.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel="Quitar ítem"
                style={[a.iconBtn, { backgroundColor: c.surface2 }]}><Icon n="trash" sm color={c.muted} /></Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{members.map(k => {
              const inIt = it.to.includes(k);
              return (
                <Pressable key={k} onPress={() => { buzz(); setItem(i, { to: inIt ? it.to.filter(x => x !== k) : [...it.to, k] }); }}
                  accessibilityRole="checkbox" accessibilityState={{ checked: inIt }} accessibilityLabel={`${short(s, k)} en ${it.name || 'este ítem'}`}
                  style={[a.avt, { borderColor: inIt ? c.accentInk : 'transparent' }]}><Av id={k} size="sm" dim={!inIt} /></Pressable>
              );
            })}</View>
          </View>))}</View>
        <Btn title="Ítem" icon="plus" style={{ alignSelf: 'flex-start' }} onPress={() => setItems(its => [...its, { name: '', price: '', to: [...members] }])} />
        <Chips>
          <Chip title="ITBIS 18 %" on={tax} onPress={() => setTax(v => !v)} />
          <Chip title="Ley 10 %" on={tip} onPress={() => setTip(v => !v)} />
        </Chips>
        <Totals cur={cur} total={ix.total} rows={[['Subtotal', ix.subtotal], ...(tax ? [['ITBIS 18 %', ix.taxC] as [string, number]] : []), ...(tip ? [['Ley 10 %', ix.tipC] as [string, number]] : [])]} />
        <List>{members.map(k => (
          <Row key={k} style={{ minHeight: 60 }}><Av id={k} /><Main><Txt f="semi">{short(s, k)}</Txt></Main><Money c={r.shares[k] || 0} cur={cur} /></Row>))}</List>
      </> : (
        <List>{members.map(k => {
          if (mode === 'equal') {
            const inIt = !!on[k];
            return (
              <Row key={k} style={{ minHeight: 60 }} onPress={() => { buzz(); setOn(o => ({ ...o, [k]: !o[k] })); }} label={short(s, k)}>
                <Av id={k} dim={!inIt} /><Main><Txt f="semi" style={{ opacity: inIt ? 1 : 0.45 }}>{short(s, k)}</Txt></Main>
                {inIt ? <Money c={r.shares[k] || 0} cur={cur} /> : <Txt s={13} c="muted">no entra</Txt>}
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
                    <Pressable style={a.stepBtn} accessibilityLabel={`Menos partes para ${short(s, k)}`}
                      onPress={() => { buzz(); setVals(x => ({ ...x, [k]: String(Math.max(0, (Number(x[k]) || 0) - 1)) })); }}><Txt s={22}>−</Txt></Pressable>
                    <Txt f="semi" style={{ minWidth: 24, textAlign: 'center' }}>{vals[k] ?? 0}</Txt>
                    <Pressable style={a.stepBtn} accessibilityLabel={`Más partes para ${short(s, k)}`}
                      onPress={() => { buzz(); setVals(x => ({ ...x, [k]: String((Number(x[k]) || 0) + 1) })); }}><Txt s={22}>+</Txt></Pressable>
                  </View>
                )}
            </Row>
          );
        })}</List>
      )}
      <SplitStatus ok={ok}>{status}</SplitStatus>
      {err ? <Txt f="medium" s={15} c="danger" center>{err}</Txt> : null}
      <Btn title={busy ? 'Guardando…' : edit ? 'Guardar cambios' : 'Guardar gasto'} kind="primary" size="lg" disabled={!ok || busy} onPress={save} />
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
});

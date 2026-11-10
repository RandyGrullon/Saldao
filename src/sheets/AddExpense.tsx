import { useEffect, useState } from 'react';
import {
  apportion, apportionStep, cat, CATS, centsText, curDecimals, curName, CURRENCIES, curStep, curSym, expensePhotoPath, fetchRate, frequentExpenses, friends, fundOf, groupOf, guessCat,
  itemSplit, moneyT, parseMoney, parseNum, plural, REPEATS,
  run, short, split, sum, today, typed, visibleGroups, getBackend, type Expense, type Id, type Snapshot, type SplitMode,
} from '@saldao/core';
import { pickPhoto, readPhoto, type Photo } from '../lib/photo';
import { Icon } from '../ui/icons';
import { Av, Money, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';
import { tr } from '@saldao/core';

// «Noches» es «Partes» contado en noches: en un viaje, quien llegó después paga menos hospedaje.
type Mode = SplitMode | 'nights';
const MODES: [Mode, string][] = [['equal', 'Iguales'], ['exact', 'Montos'], ['percent', '%'], ['shares', 'Partes'], ['nights', 'Noches'], ['adjust', 'Extra'], ['items', 'Ítems']];
type ItemDraft = { name: string; price: string; to: Id[] };
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
const ones = (ms: Id[]) => Object.fromEntries(ms.map(k => [k, 1]));
const clean = (o: Record<Id, number>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0));
const cents2 = (c: number, cur = 'DOP') => centsText(c, cur);
/** La tasa que se usó la última vez en cada moneda (la del dólar se llama como antes). */
const rateKey = (c: string) => (c === 'USD' ? 'saldao:tasa-usd' : `saldao:tasa-${c.toLowerCase()}`);
const modeOf = (e: Expense): Mode => (e.splitMode === 'shares' && e.splitParams.unit === 'noches' ? 'nights' : e.splitMode);

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
  if (e.splitMode === 'exact') return Object.fromEntries(Object.entries(e.shares).map(([k, v]) => [k, cents2(v, e.currency)]));
  return Object.fromEntries(Object.entries(e.splitParams.vals ?? {}).map(([k, v]) => [k, String(v)]));
}

export function AddExpenseSheet({ groupId, friendId, edit, preset, clearItems }: {
  groupId?: Id; friendId?: Id; edit?: Expense; preset?: { description?: string; category?: string; payer?: Id }; clearItems?: Id[];
}) {
  const s = useS(), nav = useNav();
  const first = visibleGroups(s)[0]?.id;
  const [target, setTarget] = useState(edit ? targetOf(s, edit.groupId) : friendId ? `p:${friendId}` : groupId ? targetOf(s, groupId) : first ? `g:${first}` : '');
  const members = membersOf(s, target), payerIds = payersOf(s, target);
  const [step, setStep] = useState<1 | 2>(edit ? 2 : 1);
  const [amt, setAmt] = useState(edit && edit.splitMode !== 'items' ? String(edit.amount / 100) : '');
  const [cur, setCur] = useState(edit?.currency ?? 'DOP');
  const [rate, setRate] = useState(edit && edit.currency !== 'DOP' ? String(edit.fxRate) : '');
  const [rateNote, setRateNote] = useState('');
  const [desc, setDesc] = useState(edit?.description ?? preset?.description ?? '');
  const [catKey, setCatKey] = useState<string | null>(edit?.category ?? preset?.category ?? null);
  const [date, setDate] = useState(edit?.date ?? today());
  const [note, setNote] = useState(edit?.note ?? '');
  const [repeat, setRepeat] = useState(edit?.repeat ?? '');
  const [multi, setMulti] = useState(edit ? Object.keys(edit.payers).length > 1 : false);
  const [payer, setPayer] = useState<Id>(edit ? Object.keys(edit.payers)[0] : preset?.payer ?? s.me);
  const [payVals, setPayVals] = useState<Record<Id, string>>(edit ? Object.fromEntries(Object.entries(edit.payers).map(([k, v]) => [k, cents2(v, edit.currency)])) : {});
  const [mode, setMode] = useState<Mode>(edit ? modeOf(edit) : 'equal');
  const [on, setOn] = useState<Record<Id, boolean>>(edit ? Object.fromEntries(Object.keys(edit.shares).map(k => [k, true])) : Object.fromEntries(members.map(k => [k, true])));
  const [vals, setVals] = useState<Record<Id, string>>(edit ? initVals(edit) : {});
  const [items, setItems] = useState<ItemDraft[]>(edit?.items ? edit.items.map(i => ({ name: i.name, price: cents2(i.price, edit.currency), to: i.to })) : []);
  const [tax, setTax] = useState(edit ? edit.tax > 0 : true);
  const [tip, setTip] = useState(edit ? edit.tip > 0 : true);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Otra moneda: la tasa que se usó la última vez en ella (o la de hoy) y, en yenes, sin centavos. */
  const changeCur = (c: string) => {
    if (c === cur) return;
    buzz(); setCur(c); setRateNote('');
    setRate(c === 'DOP' ? '' : lsGet(rateKey(c)) ?? '');
    if (!curDecimals(c)) setAmt(a => a.split('.')[0]);
  };
  // en otra moneda: la tasa de hoy si no hay una escrita
  useEffect(() => {
    if (cur === 'DOP' || edit) return;
    let live = true;
    fetchRate(cur).then(r => { if (live && r) { setRate(x => x || String(r)); setRateNote(tr("Tasa de hoy: RD$ {0} (ExchangeRate-API)", r < 10 ? String(r) : r.toFixed(2))); } });
    return () => { live = false; };
  }, [cur, edit]);

  if (!target) return (
    <>
      <SheetHead title={tr("Nuevo gasto")} />
      <div className="empty"><p>{tr("Para anotar un gasto primero necesitas un grupo o alguien con quien dividir.")}</p></div>
    </>
  );

  const catK = catKey ?? guessCat(desc);
  const fmt = (c: number) => moneyT(c, cur);
  const minStep = curStep(cur);
  const parsedItems = items.map(i => ({ name: i.name.trim() || tr("Ítem"), price: parseMoney(i.price, cur), to: i.to }));
  const ix = itemSplit(parsedItems, tax ? 18 : 0, tip ? 10 : 0, minStep);
  const total = mode === 'items' ? ix.total : parseMoney(amt || '0', cur);
  const splitMode: SplitMode = mode === 'nights' ? 'shares' : mode;
  const r = mode === 'items'
    ? { shares: ix.shares, ok: parsedItems.length > 0 && !ix.unassigned && parsedItems.every(i => i.price > 0),
        status: !parsedItems.length ? tr('Agrega los ítems del recibo') : parsedItems.some(i => i.price <= 0) ? tr('A un ítem le falta el precio')
          : ix.unassigned ? tr('{0} sin nadie asignado', plural(ix.unassigned, tr("ítem"), tr("ítems"))) : tr('Cuadra con el recibo') }
    : split(splitMode, total, members, { on, vals, nights: mode === 'nights' }, fmt, minStep);
  const payers: Record<Id, number> = multi ? clean(Object.fromEntries(payerIds.map(k => [k, parseMoney(payVals[k] ?? '', cur)]))) : { [payer]: total };
  const paidDiff = total - sum(payers);
  const rateN = cur === 'DOP' ? 1 : parseNum(rate);
  const okRate = cur === 'DOP' || rateN > 0;
  const ok = r.ok && paidDiff === 0 && okRate && total > 0;
  const status = !r.ok ? r.status : paidDiff ? tr("Lo pagado no cuadra: {0} {1}", paidDiff > 0 ? tr("faltan") : tr("sobran"), fmt(Math.abs(paidDiff))) : !okRate ? tr("Falta la tasa de cambio") : r.status;

  const key = (k: string) => {
    buzz();
    setAmt(a => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.') return a.includes('.') || !curDecimals(cur) ? a : (a || '0') + '.'; // el yen no tiene centavos
      if ((a.split('.')[1] ?? '').length >= curDecimals(cur) && a.includes('.') || a.replace('.', '').length >= 9) return a;
      return a === '0' ? k : a + k;
    });
  };
  const pickMode = (m: Mode, ms = members, t = parseMoney(amt || '0', cur)) => {
    setMode(m);
    if (m === 'equal') setOn(Object.fromEntries(ms.map(k => [k, true])));
    if (m === 'exact') { const a = apportionStep(t, ones(ms), curStep(cur)); setVals(Object.fromEntries(ms.map(k => [k, cents2(a[k], cur)]))); }
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
  const setItem = (i: number, p: Partial<ItemDraft>) => setItems(its => its.map((it, j) => (j === i ? { ...it, ...p } : it)));
  // un gasto de siempre: lo mismo de la última vez (grupo, monto, categoría y cómo se dividió)
  const useTemplate = (e: Expense) => {
    buzz();
    setTarget(targetOf(s, e.groupId)); setDesc(e.description); setCatKey(e.category); setCur(e.currency);
    if (e.currency !== 'DOP') setRate(String(e.fxRate));
    setAmt(e.splitMode === 'items' ? '' : String(e.amount / 100)); setMode(modeOf(e)); setVals(initVals(e));
    setOn(Object.fromEntries(Object.keys(e.shares).map(k => [k, true])));
    setMulti(Object.keys(e.payers).length > 1); setPayer(Object.keys(e.payers)[0]);
    setPayVals(Object.fromEntries(Object.entries(e.payers).map(([k, v]) => [k, cents2(v, e.currency)])));
    if (e.items) setItems(e.items.map(i => ({ name: i.name, price: cents2(i.price, e.currency), to: i.to })));
  };
  const scan = async () => {
    const f = await pickPhoto(); if (!f) return;
    setScanning(true);
    try {
      const p = await readPhoto(f);
      const res = await getBackend()!.scanReceipt(p.base64, 'image/jpeg');
      if (!res.items.length) throw new Error(tr("No encontramos ítems en esa foto. Prueba con más luz o anótalos a mano."));
      setPhoto(p);
      setItems(res.items.map(i => ({ name: i.name, price: cents2(i.price, cur), to: [...members] })));
      setTax(res.tax > 0); setTip(res.tip > 0);
      if (!desc.trim() && res.merchant) setDesc(res.merchant);
      if (res.date && res.date <= today()) setDate(res.date);
      setMode('items'); setStep(2); buzz();
      nav.toast(tr("Leímos {0}: revisa y marca quién comió qué", plural(res.items.length, tr("ítem"), tr("ítems"))));
    } catch (e) { nav.toast(errMsg(e)); } finally { setScanning(false); }
  };
  const attach = async () => { const f = await pickPhoto(); if (f) setPhoto(await readPhoto(f).catch(() => null)); };

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      let id = '', gid = '';
      await run(async b => {
        gid = edit ? edit.groupId : target.startsWith('p:') ? await b.directGroup(target.slice(2)) : target.slice(2);
        id = await b.saveExpense({
          id: edit?.id, groupId: gid, description: desc.trim() || cat(catK).name, category: catK, date, currency: cur, amount: total, fxRate: rateN,
          splitMode, splitParams: mode === 'equal' ? { on: members.filter(k => on[k]) } : mode === 'items' ? {}
            : { vals: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, parseNum(v)])), ...(mode === 'nights' && { unit: 'noches' as const }) },
          items: mode === 'items' ? parsedItems : null, tax: mode === 'items' && tax ? 18 : 0, tip: mode === 'items' && tip ? 10 : 0,
          note: note.trim() || null, repeat: repeat || null, payers, shares: clean(r.shares), isPayment: false,
        });
        for (const it of clearItems ?? []) await b.deleteItem(it).catch(() => {});
      });
      if (cur !== 'DOP') lsSet(rateKey(cur), rate);
      buzz(); nav.closeSheet();
      nav.toast(edit ? tr("Cambios guardados") : tr("Gasto guardado"), edit ? undefined : () => { run(b => b.deleteExpense(id)).catch(e => nav.toast(errMsg(e))); });
      if (photo) {
        const path = expensePhotoPath(gid, id);
        run(async b => { await b.uploadPhoto(path, { data: photo.blob, type: 'image/jpeg', uri: photo.uri }); await b.setExpensePhoto(id, path); })
          .catch(e => nav.toast(tr("El gasto quedó, pero la foto no: {0}", errMsg(e))));
      }
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };

  const targetName = target.startsWith('p:') ? tr("Con {0}", short(s, target.slice(2))) : groupOf(s, target.slice(2))?.name ?? '';
  const usual = !edit && !amt && !desc ? frequentExpenses(s) : [];

  if (step === 1) return (
    <>
      <SheetHead title={edit ? tr("Editar gasto") : tr("Nuevo gasto")}
        right={<button className="link strong tap" disabled={!(parseMoney(amt || '0', cur) > 0 && okRate)} onClick={() => { if (mode === 'exact') pickMode('exact'); setStep(2); }}>{tr("Siguiente")}</button>} />
      <div className="scroll sheet-scroll pad">
        <div className="amount">
          <label className="cur tap"><span aria-hidden="true">{curSym(cur)}</span>
            <select value={cur} onChange={e => changeCur(e.target.value)} aria-label={tr("Moneda: {0}. Cambiar", curName(cur))}>
              {CURRENCIES.map(c => <option key={c} value={c}>{curSym(c)} · {curName(c)}</option>)}
            </select></label>
          <output className={`amount-v${amt ? '' : ' empty'}`} aria-live="polite">{amt ? typed(amt) : curDecimals(cur) ? '0.00' : '0'}</output>
        </div>
        {cur !== 'DOP' && <>
          <label className="num-in wide"><span>{tr("RD$ por {0} 1:", curSym(cur))}</span>
            <input inputMode="decimal" value={rate} placeholder={tr("Tasa de hoy")} onChange={e => { setRate(e.target.value); setRateNote(''); }} aria-label={tr("Tasa de cambio")} /></label>
          {rateNote && <p className="note center">{rateNote}</p>}
          {rateN > 0 && parseMoney(amt || '0', cur) > 0 && <p className="note center">{tr("Equivale a {0}", moneyT(Math.round(parseMoney(amt, cur) * rateN)))}</p>}
        </>}
        {usual.length > 0 && <>
          <h3>{tr("De siempre")}</h3>
          <div className="chips scroll-x">{usual.map(e => (
            <button key={e.id} className="chip tap" onClick={() => useTemplate(e)}><Icon n={cat(e.category).icon} sm />{e.description}</button>))}</div>
        </>}
        <input className="field" placeholder={tr("¿En qué fue?")} value={desc} onChange={e => setDesc(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label={tr("Descripción")} />
        <div className="chips">
          <label className="chip"><Icon n="users" sm />
            <select value={target} disabled={!!edit} onChange={e => changeTarget(e.target.value)} aria-label={tr("Grupo o persona")}>
              {visibleGroups(s).length > 0 && <optgroup label={tr("Grupos")}>{visibleGroups(s).map(g => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}</optgroup>}
              {friends(s).length > 0 && <optgroup label={tr("Solo entre dos")}>{friends(s).map(p => <option key={p} value={`p:${p}`}>{tr("Con {0}", s.profiles[p].name)}</option>)}</optgroup>}
            </select></label>
          <label className="chip"><Icon n="cal" sm /><input type="date" value={date} max={today()} onChange={e => setDate(e.target.value || today())} aria-label={tr("Fecha")} /></label>
          <label className="chip"><Icon n={cat(catK).icon} sm />
            <select value={catK} onChange={e => setCatKey(e.target.value)} aria-label={tr("Categoría")}>
              {Object.entries(CATS).filter(([k]) => k !== 'pago').map(([k, c]) => <option key={k} value={k}>{tr(c.name)}</option>)}
            </select></label>
          {(!edit || !edit.repeatFrom) && <label className={`chip${repeat ? ' on' : ''}`}><Icon n="repeat" sm />
            <select value={repeat} onChange={e => setRepeat(e.target.value)} aria-label={tr("Se repite")}>
              {REPEATS.map(([k, l]) => <option key={k} value={k}>{tr(l)}</option>)}
            </select></label>}
        </div>
        <input className="field" placeholder={tr("Nota (opcional)")} value={note} onChange={e => setNote(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label={tr("Nota")} />
        {!edit && <div className="scan-row">
          <button className="scan tap" disabled={scanning} onClick={scan}>
            <Icon n="receipt" /><span>{scanning ? tr("Leyendo el recibo…") : tr("Escanear el recibo")}<small>{tr("Toma una foto y los ítems, el ITBIS y la ley se llenan solos")}</small></span>
          </button>
          <button className="scan small tap" onClick={() => { pickMode('items'); setStep(2); }} aria-label={tr("Dividir por ítems a mano")}><Icon n="edit" /><span>{tr("A mano")}</span></button>
        </div>}
        {!edit && (photo
          ? <div className="attach"><img src={photo.uri} alt={tr("Foto del comprobante")} /><span className="main"><span className="t">{tr("Foto del comprobante")}</span><span className="s">{tr("Se sube al guardar")}</span></span>
              <button className="link tap" onClick={() => setPhoto(null)}>{tr("Quitar")}</button></div>
          : <button className="link tap" style={{ justifySelf: 'start' }} onClick={attach}><Icon n="plus" sm />{tr("Adjuntar foto del comprobante")}</button>)}
      </div>
      <div className="keypad" role="group" aria-label={tr("Teclado del monto")}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(k => (
          <button key={k} className="key tap" onClick={() => key(k)} aria-label={k === 'del' ? tr("Borrar") : k === '.' ? tr("Punto") : k} disabled={k === '.' && !curDecimals(cur)}>{k === 'del' ? <Icon n="del" /> : k}</button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <SheetHead title={tr("Dividir")} left={edit ? undefined : <button className="link tap" onClick={() => setStep(1)}><Icon n="left" sm />{tr("Monto")}</button>}
        right={<button className="link strong tap" disabled={!ok || busy} onClick={save}>{tr("Guardar")}</button>} />
      <div className="scroll sheet-scroll pad">
        {edit && <button className="link tap" style={{ justifySelf: 'start', padding: 0 }} onClick={() => setStep(1)}><Icon n="edit" sm />{tr("Cambiar monto, fecha o descripción")}</button>}
        <p className="recap"><span>{desc.trim() || cat(catK).name} · {targetName}</span><Money c={total} cur={cur} /></p>
        <h3>{tr("Pagó")}</h3>
        <div className="chips" role="radiogroup" aria-label={tr("Quién pagó")}>
          {payerIds.map(k => <button key={k} className="chip person tap" role="radio" aria-checked={!multi && payer === k} onClick={() => { setMulti(false); setPayer(k); buzz(); }}><Av id={k} size="xs" />{short(s, k)}</button>)}
          <button className="chip tap" role="radio" aria-checked={multi} onClick={() => setMulti(true)}>{tr("Varios")}</button>
        </div>
        {multi && <ul className="list card split-list">{payerIds.map(k => (
          <li key={k} className="row static"><Av id={k} /><span className="main"><span className="t">{short(s, k)}</span></span>
            <label className="num-in"><span>{curSym(cur)}</span><input inputMode="decimal" placeholder="0.00" value={payVals[k] ?? ''} aria-label={tr("Lo que pagó {0}", short(s, k))}
              onChange={e => setPayVals(v => ({ ...v, [k]: e.target.value }))} /></label></li>))}</ul>}
        <h3>{tr("Cómo se divide")}</h3>
        <div className="seg scroll-x" role="tablist" aria-label={tr("Forma de dividir")}>
          {MODES.map(([m, l]) => <button key={m} className="tap" role="tab" aria-selected={mode === m} onClick={() => pickMode(m)}>{tr(l)}</button>)}
        </div>
        {mode === 'items' ? <>
          <ul className="items edit">{items.map((it, i) => (
            <li key={i}>
              <div className="item-top">
                <input className="field" placeholder={tr("Ítem")} value={it.name} onChange={e => setItem(i, { name: e.target.value })} aria-label={tr("Nombre del ítem {0}", i + 1)} />
                <label className="num-in"><span>{curSym(cur)}</span><input inputMode="decimal" placeholder="0.00" value={it.price} onChange={e => setItem(i, { price: e.target.value })} aria-label={tr("Precio del ítem {0}", i + 1)} /></label>
                <button className="icon-btn ghost tap" aria-label={tr("Quitar ítem")} onClick={() => setItems(its => its.filter((_, j) => j !== i))}><Icon n="trash" sm /></button>
              </div>
              <div className="who">{members.map(k => (
                <button key={k} className="avt tap" aria-pressed={it.to.includes(k)} aria-label={tr("{0} en {1}", short(s, k), it.name || tr("este ítem"))}
                  onClick={() => { buzz(); setItem(i, { to: it.to.includes(k) ? it.to.filter(x => x !== k) : [...it.to, k] }); }}><Av id={k} size="sm" /></button>))}</div>
            </li>))}</ul>
          <button className="btn tap" onClick={() => setItems(its => [...its, { name: '', price: '', to: [...members] }])}><Icon n="plus" sm />{tr("Ítem")}</button>
          <div className="chips">
            <button className="chip tap" role="checkbox" aria-checked={tax} onClick={() => setTax(v => !v)}>{tr("ITBIS 18 %")}</button>
            <button className="chip tap" role="checkbox" aria-checked={tip} onClick={() => setTip(v => !v)}>{tr("Ley 10 %")}</button>
          </div>
          <dl className="totals">
            <div><dt>{tr("Subtotal")}</dt><dd><Money c={ix.subtotal} cur={cur} /></dd></div>
            {tax && <div><dt>{tr("ITBIS 18 %")}</dt><dd><Money c={ix.taxC} cur={cur} /></dd></div>}
            {tip && <div><dt>{tr("Ley 10 %")}</dt><dd><Money c={ix.tipC} cur={cur} /></dd></div>}
            <div className="total"><dt>{tr("Total")}</dt><dd><Money c={ix.total} cur={cur} /></dd></div>
          </dl>
          <ul className="list card split-list">{members.map(k => (
            <li key={k} className="row static"><Av id={k} /><span className="main"><span className="t">{short(s, k)}</span></span><span className="end"><Money c={r.shares[k] || 0} cur={cur} /></span></li>))}</ul>
        </> : (
          <ul className="list card split-list">{members.map(k => {
            if (mode === 'equal') return (
              <li key={k}><button className="row check tap" role="checkbox" aria-checked={!!on[k]} onClick={() => { buzz(); setOn(o => ({ ...o, [k]: !o[k] })); }}>
                <Av id={k} /><span className="main"><span className="t">{short(s, k)}</span></span>
                <span className="end">{on[k] ? <Money c={r.shares[k] || 0} cur={cur} /> : <span className="lbl">{tr("no entra")}</span>}</span>
                <span className="box"><Icon n="check" sm /></span></button></li>);
            const input = (pre: string, suf = '') => (
              <label className="num-in">{pre && <span>{pre}</span>}<input inputMode="decimal" enterKeyHint="next" placeholder="0" value={vals[k] ?? ''} aria-label={short(s, k)}
                onChange={e => setVals(v => ({ ...v, [k]: e.target.value }))} />{suf && <span>{suf}</span>}</label>);
            return (
              <li key={k} className="row static"><Av id={k} />
                <span className="main"><span className="t">{short(s, k)}</span>{mode !== 'exact' && <span className="s">{fmt(r.shares[k] || 0)}</span>}</span>
                {mode === 'exact' ? input(curSym(cur)) : mode === 'percent' ? input('', '%') : mode === 'adjust' ? input('+') : (
                  <span className="stepper">
                    <button className="tap" aria-label={tr("Menos {0} para {1}", mode === 'nights' ? tr("noches") : tr("partes"), short(s, k))} onClick={() => { buzz(); setVals(v => ({ ...v, [k]: String(Math.max(0, (Number(v[k]) || 0) - 1)) })); }}>−</button>
                    <output>{vals[k] ?? 0}</output>
                    <button className="tap" aria-label={tr("Más {0} para {1}", mode === 'nights' ? tr("noches") : tr("partes"), short(s, k))} onClick={() => { buzz(); setVals(v => ({ ...v, [k]: String((Number(v[k]) || 0) + 1) })); }}>+</button>
                  </span>)}
              </li>);
          })}</ul>
        )}
        <p className={`split-status ${ok ? 'ok' : 'bad'}`} aria-live="polite">{ok && <Icon n="check" sm />}{status}</p>
        <button className="btn primary block tap" disabled={!ok || busy} onClick={save}>{busy ? tr("Guardando…") : edit ? tr("Guardar cambios") : tr("Guardar gasto")}</button>
      </div>
    </>
  );
}

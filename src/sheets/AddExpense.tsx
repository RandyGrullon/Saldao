import { useState } from 'react';
import { apportion, cat, CATS, curSym, friends, groupOf, guessCat, itemSplit, moneyT, parseMoney, plural, run, short, split, sum, today, typed, visibleGroups, type Expense, type Id, type Snapshot, type SplitMode } from '@saldao/core';
import { Icon } from '../ui/icons';
import { Av, Money, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';

const MODES: [SplitMode, string][] = [['equal', 'Iguales'], ['exact', 'Montos'], ['percent', '%'], ['shares', 'Partes'], ['adjust', 'Extra'], ['items', 'Ítems']];
type ItemDraft = { name: string; price: string; to: Id[] };
const RATE_KEY = 'saldao:tasa-usd';
const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };
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

export function AddExpenseSheet({ groupId, friendId, edit }: { groupId?: Id; friendId?: Id; edit?: Expense }) {
  const s = useS(), nav = useNav();
  const first = visibleGroups(s)[0]?.id;
  const [target, setTarget] = useState(edit ? targetOf(s, edit.groupId) : friendId ? `p:${friendId}` : groupId ? targetOf(s, groupId) : first ? `g:${first}` : '');
  const members = membersOf(s, target);
  const [step, setStep] = useState<1 | 2>(edit ? 2 : 1);
  const [amt, setAmt] = useState(edit && edit.splitMode !== 'items' ? String(edit.amount / 100) : '');
  const [cur, setCur] = useState(edit?.currency ?? 'DOP');
  const [rate, setRate] = useState(edit && edit.currency !== 'DOP' ? String(edit.fxRate) : lsGet(RATE_KEY) ?? '');
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

  if (!target) return (
    <>
      <SheetHead title="Nuevo gasto" />
      <div className="empty"><p>Para anotar un gasto primero necesitas un grupo o alguien con quien dividir.</p></div>
    </>
  );

  const catK = catKey ?? guessCat(desc);
  const fmt = (c: number) => moneyT(c, cur);
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
  const setItem = (i: number, p: Partial<ItemDraft>) => setItems(its => its.map((it, j) => (j === i ? { ...it, ...p } : it)));

  const save = async () => {
    if (!ok) return;
    setBusy(true);
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
      if (cur !== 'DOP') lsSet(RATE_KEY, rate);
      buzz(); nav.closeSheet();
      nav.toast(edit ? 'Cambios guardados' : 'Gasto guardado', edit ? undefined : () => { run(b => b.deleteExpense(id)).catch(e => nav.toast(errMsg(e))); });
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };

  const targetName = target.startsWith('p:') ? `Con ${short(s, target.slice(2))}` : groupOf(s, target.slice(2))?.name ?? '';

  if (step === 1) return (
    <>
      <SheetHead title={edit ? 'Editar gasto' : 'Nuevo gasto'}
        right={<button className="link strong tap" disabled={!(parseMoney(amt || '0') > 0 && okRate)} onClick={() => { if (mode === 'exact') pickMode('exact'); setStep(2); }}>Siguiente</button>} />
      <div className="scroll sheet-scroll pad">
        <div className="amount">
          <button className="cur tap" onClick={() => setCur(c => (c === 'DOP' ? 'USD' : 'DOP'))} aria-label={`Moneda: ${curSym(cur)}. Cambiar`}>{curSym(cur)}</button>
          <output className={`amount-v${amt ? '' : ' empty'}`} aria-live="polite">{amt ? typed(amt) : '0.00'}</output>
        </div>
        {cur !== 'DOP' && <>
          <label className="num-in wide"><span>RD$ por US$ 1:</span>
            <input inputMode="decimal" value={rate} placeholder="Tasa de hoy" onChange={e => setRate(e.target.value)} aria-label="Tasa del dólar" /></label>
          {rateN > 0 && parseMoney(amt || '0') > 0 && <p className="note center">Equivale a {moneyT(Math.round(parseMoney(amt) * rateN))}</p>}
        </>}
        <input className="field" placeholder="¿En qué fue?" value={desc} onChange={e => setDesc(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label="Descripción" />
        <div className="chips">
          <label className="chip"><Icon n="users" sm />
            <select value={target} disabled={!!edit} onChange={e => changeTarget(e.target.value)} aria-label="Grupo o persona">
              {visibleGroups(s).length > 0 && <optgroup label="Grupos">{visibleGroups(s).map(g => <option key={g.id} value={`g:${g.id}`}>{g.name}</option>)}</optgroup>}
              {friends(s).length > 0 && <optgroup label="Solo entre dos">{friends(s).map(p => <option key={p} value={`p:${p}`}>Con {s.profiles[p].name}</option>)}</optgroup>}
            </select></label>
          <label className="chip"><Icon n="cal" sm /><input type="date" value={date} max={today()} onChange={e => setDate(e.target.value || today())} aria-label="Fecha" /></label>
          <label className="chip"><Icon n={cat(catK).icon} sm />
            <select value={catK} onChange={e => setCatKey(e.target.value)} aria-label="Categoría">
              {Object.entries(CATS).filter(([k]) => k !== 'pago').map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}
            </select></label>
        </div>
        <input className="field" placeholder="Nota (opcional)" value={note} onChange={e => setNote(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label="Nota" />
        <button className="scan tap" onClick={() => { pickMode('items'); setStep(2); }}>
          <Icon n="receipt" /><span>Dividir por ítems del recibo<small>Cada quien paga lo suyo, con ITBIS y ley repartidos</small></span>
        </button>
      </div>
      <div className="keypad" role="group" aria-label="Teclado del monto">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map(k => (
          <button key={k} className="key tap" onClick={() => key(k)} aria-label={k === 'del' ? 'Borrar' : k === '.' ? 'Punto' : k}>{k === 'del' ? <Icon n="del" /> : k}</button>
        ))}
      </div>
    </>
  );

  return (
    <>
      <SheetHead title="Dividir" left={edit ? undefined : <button className="link tap" onClick={() => setStep(1)}><Icon n="left" sm />Monto</button>}
        right={<button className="link strong tap" disabled={!ok || busy} onClick={save}>Guardar</button>} />
      <div className="scroll sheet-scroll pad">
        {edit && <button className="link tap" style={{ justifySelf: 'start', padding: 0 }} onClick={() => setStep(1)}><Icon n="edit" sm />Cambiar monto, fecha o descripción</button>}
        <p className="recap"><span>{desc.trim() || cat(catK).name} · {targetName}</span><Money c={total} cur={cur} /></p>
        <h3>Pagó</h3>
        <div className="chips" role="radiogroup" aria-label="Quién pagó">
          {members.map(k => <button key={k} className="chip person tap" role="radio" aria-checked={!multi && payer === k} onClick={() => { setMulti(false); setPayer(k); buzz(); }}><Av id={k} size="xs" />{short(s, k)}</button>)}
          <button className="chip tap" role="radio" aria-checked={multi} onClick={() => setMulti(true)}>Varios</button>
        </div>
        {multi && <ul className="list card split-list">{members.map(k => (
          <li key={k} className="row static"><Av id={k} /><span className="main"><span className="t">{short(s, k)}</span></span>
            <label className="num-in"><span>{curSym(cur)}</span><input inputMode="decimal" placeholder="0.00" value={payVals[k] ?? ''} aria-label={`Lo que pagó ${short(s, k)}`}
              onChange={e => setPayVals(v => ({ ...v, [k]: e.target.value }))} /></label></li>))}</ul>}
        <h3>Cómo se divide</h3>
        <div className="seg scroll-x" role="tablist" aria-label="Forma de dividir">
          {MODES.map(([m, l]) => <button key={m} className="tap" role="tab" aria-selected={mode === m} onClick={() => pickMode(m)}>{l}</button>)}
        </div>
        {mode === 'items' ? <>
          <ul className="items edit">{items.map((it, i) => (
            <li key={i}>
              <div className="item-top">
                <input className="field" placeholder="Ítem" value={it.name} onChange={e => setItem(i, { name: e.target.value })} aria-label={`Nombre del ítem ${i + 1}`} />
                <label className="num-in"><span>{curSym(cur)}</span><input inputMode="decimal" placeholder="0.00" value={it.price} onChange={e => setItem(i, { price: e.target.value })} aria-label={`Precio del ítem ${i + 1}`} /></label>
                <button className="icon-btn ghost tap" aria-label="Quitar ítem" onClick={() => setItems(its => its.filter((_, j) => j !== i))}><Icon n="trash" sm /></button>
              </div>
              <div className="who">{members.map(k => (
                <button key={k} className="avt tap" aria-pressed={it.to.includes(k)} aria-label={`${short(s, k)} en ${it.name || 'este ítem'}`}
                  onClick={() => { buzz(); setItem(i, { to: it.to.includes(k) ? it.to.filter(x => x !== k) : [...it.to, k] }); }}><Av id={k} size="sm" /></button>))}</div>
            </li>))}</ul>
          <button className="btn tap" onClick={() => setItems(its => [...its, { name: '', price: '', to: [...members] }])}><Icon n="plus" sm />Ítem</button>
          <div className="chips">
            <button className="chip tap" role="checkbox" aria-checked={tax} onClick={() => setTax(v => !v)}>ITBIS 18 %</button>
            <button className="chip tap" role="checkbox" aria-checked={tip} onClick={() => setTip(v => !v)}>Ley 10 %</button>
          </div>
          <dl className="totals">
            <div><dt>Subtotal</dt><dd><Money c={ix.subtotal} cur={cur} /></dd></div>
            {tax && <div><dt>ITBIS 18 %</dt><dd><Money c={ix.taxC} cur={cur} /></dd></div>}
            {tip && <div><dt>Ley 10 %</dt><dd><Money c={ix.tipC} cur={cur} /></dd></div>}
            <div className="total"><dt>Total</dt><dd><Money c={ix.total} cur={cur} /></dd></div>
          </dl>
          <ul className="list card split-list">{members.map(k => (
            <li key={k} className="row static"><Av id={k} /><span className="main"><span className="t">{short(s, k)}</span></span><span className="end"><Money c={r.shares[k] || 0} cur={cur} /></span></li>))}</ul>
        </> : (
          <ul className="list card split-list">{members.map(k => {
            if (mode === 'equal') return (
              <li key={k}><button className="row check tap" role="checkbox" aria-checked={!!on[k]} onClick={() => { buzz(); setOn(o => ({ ...o, [k]: !o[k] })); }}>
                <Av id={k} /><span className="main"><span className="t">{short(s, k)}</span></span>
                <span className="end">{on[k] ? <Money c={r.shares[k] || 0} cur={cur} /> : <span className="lbl">no entra</span>}</span>
                <span className="box"><Icon n="check" sm /></span></button></li>);
            const input = (pre: string, suf = '') => (
              <label className="num-in">{pre && <span>{pre}</span>}<input inputMode="decimal" enterKeyHint="next" placeholder="0" value={vals[k] ?? ''} aria-label={short(s, k)}
                onChange={e => setVals(v => ({ ...v, [k]: e.target.value }))} />{suf && <span>{suf}</span>}</label>);
            return (
              <li key={k} className="row static"><Av id={k} />
                <span className="main"><span className="t">{short(s, k)}</span>{mode !== 'exact' && <span className="s">{fmt(r.shares[k] || 0)}</span>}</span>
                {mode === 'exact' ? input(curSym(cur)) : mode === 'percent' ? input('', '%') : mode === 'adjust' ? input('+') : (
                  <span className="stepper">
                    <button className="tap" aria-label={`Menos partes para ${short(s, k)}`} onClick={() => { buzz(); setVals(v => ({ ...v, [k]: String(Math.max(0, (Number(v[k]) || 0) - 1)) })); }}>−</button>
                    <output>{vals[k] ?? 0}</output>
                    <button className="tap" aria-label={`Más partes para ${short(s, k)}`} onClick={() => { buzz(); setVals(v => ({ ...v, [k]: String((Number(v[k]) || 0) + 1) })); }}>+</button>
                  </span>)}
              </li>);
          })}</ul>
        )}
        <p className={`split-status ${ok ? 'ok' : 'bad'}`} aria-live="polite">{ok && <Icon n="check" sm />}{status}</p>
        <button className="btn primary block tap" disabled={!ok || busy} onClick={save}>{busy ? 'Guardando…' : edit ? 'Guardar cambios' : 'Guardar gasto'}</button>
      </div>
    </>
  );
}

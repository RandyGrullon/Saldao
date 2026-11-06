import { useMemo, useState } from 'react';
import {
  cat, CATS, friends, groupOf, monthName, monthStats, moneyT, plural, run, searchExpenses, shiftMonth, short, thisMonth, visibleGroups, type Filters, type Id,
} from '@saldao/core';
import { AddExpenseSheet } from '../sheets/AddExpense';
import { Icon } from '../ui/icons';
import { Av, Empty, ExpRow, Money, errMsg, useS } from '../ui/kit';
import { buzz, useNav } from '../ui/nav';
import { GroupPhoto } from '../ui/photo';
import { Bar } from './detail';

/** La lista de compras del grupo: lo que falta; quien lo compra lo marca y lo anota como gasto con un toque. */
export function ListScreen({ groupId }: { groupId: Id }) {
  const s = useS(), nav = useNav(), g = groupOf(s, groupId);
  const [draft, setDraft] = useState('');
  if (!g) return <><Bar /><p className="empty">Este grupo ya no existe.</p></>;
  const items = s.items.filter(i => i.groupId === groupId);
  const todo = items.filter(i => !i.doneAt), done = items.filter(i => i.doneAt);
  const act = (fn: Parameters<typeof run>[0]) => run(fn).catch(e => nav.toast(errMsg(e)));
  const add = () => { const n = draft.trim(); if (!n) return; setDraft(''); buzz(); act(b => b.addItem(groupId, n)); };
  return (
    <>
      <Bar />
      <div className="scroll pad">
        <header className="head"><p className="meta">{g.name}</p><h1>Lista de compras</h1></header>
        <form className="composer" onSubmit={e => { e.preventDefault(); add(); }}>
          <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Qué falta (agua, detergente…)" maxLength={120} aria-label="Qué falta" enterKeyHint="done" autoComplete="off" />
          <button className="icon-btn tap" aria-label="Agregar a la lista" disabled={!draft.trim()}><Icon n="plus" /></button>
        </form>
        {todo.length ? <ul className="list card">{todo.map(i => (
          <li key={i.id}><div className="row static">
            <button className="box-btn tap" role="checkbox" aria-checked="false" aria-label={`Ya compré ${i.name}`} onClick={() => { buzz(); act(b => b.toggleItem(i.id)); }}><span className="box" /></button>
            <span className="main"><span className="t">{i.name}</span><span className="s">{i.addedBy === s.me ? 'la agregaste tú' : `la agregó ${short(s, i.addedBy)}`}</span></span>
            <button className="icon-btn ghost tap" aria-label={`Quitar ${i.name}`} onClick={() => act(b => b.deleteItem(i.id))}><Icon n="trash" sm /></button>
          </div></li>))}</ul>
          : <Empty icon="cart" title="No falta nada">Agrega lo que se acabó en la casa. Quien lo compre lo marca y lo anota como gasto.</Empty>}
        {done.length > 0 && <>
          <h2 className="sec">Comprado <span className="hint">{plural(done.length, 'cosa', 'cosas')}</span></h2>
          <ul className="list card">{done.map(i => (
            <li key={i.id}><div className="row static">
              <button className="box-btn on tap" role="checkbox" aria-checked="true" aria-label={`Desmarcar ${i.name}`} onClick={() => act(b => b.toggleItem(i.id))}><span className="box"><Icon n="check" sm /></span></button>
              <span className="main"><span className="t done">{i.name}</span><span className="s">{i.doneBy === s.me ? 'la compraste tú' : `la compró ${i.doneBy ? short(s, i.doneBy) : 'alguien'}`}</span></span>
            </div></li>))}</ul>
          <div className="actions">
            <button className="btn primary tap" onClick={() => nav.openSheet(<AddExpenseSheet groupId={groupId} preset={{ description: `Compra: ${done.map(i => i.name).join(', ')}`.slice(0, 120), category: 'super' }}
              clearItems={done.map(i => i.id)} />, 'Nuevo gasto', true)}><Icon n="plus" />Anotar la compra</button>
            <button className="btn tap" onClick={() => act(async b => { for (const i of done) await b.deleteItem(i.id); })}>Borrar lo comprado</button>
          </div>
        </>}
      </div>
    </>
  );
}

/** Tu mes: tu parte de lo gastado, por categoría y por grupo, comparado con el mes anterior. */
export function SummaryScreen() {
  const s = useS();
  const [m, setM] = useState(thisMonth());
  const st = useMemo(() => monthStats(s, m), [s, m]);
  const max = Math.max(1, ...st.byCat.map(c => c.amount));
  const diff = st.prev && st.total ? Math.round(((st.total - st.prev) / st.prev) * 100) : null;
  return (
    <>
      <Bar />
      <div className="scroll pad">
        <header className="month-nav">
          <button className="round tap" aria-label="Mes anterior" onClick={() => setM(x => shiftMonth(x, -1))}><Icon n="left" /></button>
          <h1>{monthName(m).replace(/^./, c => c.toUpperCase())}</h1>
          <button className="round tap" aria-label="Mes siguiente" disabled={m >= thisMonth()} onClick={() => setM(x => shiftMonth(x, 1))}><Icon n="chevR" /></button>
        </header>
        <section className="card hero">
          <p className="lbl">Tu parte de lo gastado</p>
          <p className="big"><Money c={st.total} /></p>
          <p className="note">{plural(st.count, 'gasto', 'gastos')}{diff === null ? '' : diff === 0 ? ' · igual que el mes anterior' : ` · ${diff > 0 ? `${diff} % más` : `${-diff} % menos`} que el mes anterior`}</p>
        </section>
        {st.byCat.length ? <>
          <h2 className="sec">Por categoría</h2>
          <ul className="card bars">{st.byCat.map(c => (
            <li key={c.key}><span className="bar-l"><Icon n={cat(c.key).icon} sm />{c.name}</span><Money c={c.amount} />
              <span className="bar-t"><span style={{ width: `${Math.max(3, (c.amount / max) * 100)}%` }} /></span></li>))}</ul>
          <h2 className="sec">Por grupo</h2>
          <ul className="list card">{st.byGroup.map(x => {
            const g = groupOf(s, x.groupId);
            return g ? <li key={x.groupId}><div className="row static"><GroupPhoto g={g} /><span className="main"><span className="t">{g.kind === 'directo' ? `Con ${short(s, g.members.find(k => k !== s.me)!)}` : g.name}</span></span><span className="end"><Money c={x.amount} /></span></div></li> : null;
          })}</ul>
          <h2 className="sec">Lo más grande</h2>
          <ul className="list card">{st.top.map(e => <ExpRow key={e.id} e={e} showGroup />)}</ul>
        </> : <Empty icon="receipt" title="Nada este mes">Cuando anotes gastos, aquí verás en qué se va tu dinero.</Empty>}
      </div>
    </>
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
    <>
      <Bar />
      <div className="scroll pad">
        <h1>Buscar</h1>
        <input className="field" type="search" autoFocus placeholder="Mofongo, Sirena, 1,200…" value={f.text ?? ''} onChange={e => set('text', e.target.value)} aria-label="Buscar gastos" enterKeyHint="search" />
        <div className="chips">
          <label className="chip"><Icon n="users" sm /><select value={f.groupId ?? ''} onChange={e => set('groupId', e.target.value)} aria-label="Grupo">
            <option value="">Todos los grupos</option>{visibleGroups(s).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
          <label className="chip"><Icon n="user" sm /><select value={f.person ?? ''} onChange={e => set('person', e.target.value)} aria-label="Persona">
            <option value="">Cualquiera</option>{friends(s).map(p => <option key={p} value={p}>{s.profiles[p].name}</option>)}</select></label>
          <label className="chip"><Icon n="receipt" sm /><select value={f.cat ?? ''} onChange={e => set('cat', e.target.value)} aria-label="Categoría">
            <option value="">Todas</option>{Object.entries(CATS).map(([k, c]) => <option key={k} value={k}>{c.name}</option>)}</select></label>
        </div>
        {any ? res.length ? <>
          <p className="note">{plural(res.length, 'gasto', 'gastos')} · {moneyT(res.filter(e => !e.isPayment).reduce((a, e) => a + e.amount, 0))}</p>
          <ul className="list card">{res.slice(0, 200).map(e => <ExpRow key={e.id} e={e} showGroup />)}</ul>
        </> : <Empty icon="eye" title="No encontramos nada">Prueba con otra palabra o quita algún filtro.</Empty>
          : <p className="note center">Escribe algo o elige un filtro.</p>}
      </div>
    </>
  );
}

export { Av };

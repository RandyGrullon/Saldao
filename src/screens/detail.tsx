import { useState } from 'react';
import { ago, byNewest, canEdit, cat, debts, fdate, fday, friendBal, ftime, groupBal, groupOf, involves, ledger, listOf, mineOf, moneyT, pairVal, pendingInfo, plural, recordPay, run, sharedGroups, short, spent, toBase, type Id } from '@saldao/core';
import { Icon } from '../ui/icons';
import { AnimMoney, Av, Avs, Empty, ExpRow, ItemStatus, Money, Pill, WhyRow, errMsg, payText, useAct, useS } from '../ui/kit';
import { buzz, useNav } from '../ui/nav';
import { AddExpenseSheet } from '../sheets/AddExpense';
import { InviteSheet } from '../sheets/groups';
import { PaySheet, SettleSheet, XferRow, remind } from '../sheets/settle';

const Bar = ({ right }: { right?: React.ReactNode }) => {
  const nav = useNav();
  return <header className="bar"><button className="back tap" onClick={nav.back}><Icon n="left" /><span>Atrás</span></button>{right}</header>;
};

export function GroupScreen({ id }: { id: Id }) {
  const s = useS(), nav = useNav(), g = groupOf(s, id);
  if (!g) return <><Bar /><p className="empty">Este grupo ya no existe o saliste de él.</p></>;
  const list = listOf(s, id).sort(byNewest), me = groupBal(s, id), d = debts(s, id);
  const days = [...new Set(list.map(e => e.date))];
  return (
    <>
      <Bar right={<button className="link tap" onClick={() => nav.openSheet(<InviteSheet groupId={id} />, 'Invitar')}><Icon n="users" sm />Invitar</button>} />
      <div className="scroll pad">
        <header className="head"><Avs ids={g.members} /><h1>{g.name}</h1><p className="meta">{plural(g.members.length, 'persona', 'personas')}</p></header>
        <section className="card hero">
          <p className="lbl">{me > 0 ? 'En este grupo te deben' : me < 0 ? 'En este grupo debes' : 'En este grupo estás a mano'}</p>
          <p className={`big${me > 0 ? ' pos' : me < 0 ? ' neg' : ''}`}><AnimMoney c={Math.abs(me)} sign={me > 0} /></p>
          <p className="note">Gastado entre todos: {moneyT(spent(list))} · {d.length ? plural(d.length, 'deuda abierta', 'deudas abiertas') : 'nadie le debe a nadie'}</p>
          <div className="actions">
            <button className="btn primary tap" onClick={() => nav.openSheet(<AddExpenseSheet groupId={id} />, 'Nuevo gasto', true)}><Icon n="plus" />Añadir gasto</button>
            <button className="btn tap" disabled={!d.length} onClick={() => nav.openSheet(<SettleSheet groupId={id} />, 'Saldar')}>Saldar</button>
          </div>
        </section>
        {g.members.length < 2 && <section className="card plain-card"><h2>Falta gente</h2><p className="s">Invita a los demás con el enlace del grupo o agrégalos por nombre.</p>
          <button className="btn tap" onClick={() => nav.openSheet(<InviteSheet groupId={id} />, 'Invitar')}><Icon n="users" sm />Invitar</button></section>}
        {d.length > 0 && <>
          <h2 className="sec">Quién le debe a quién <span className="hint">toca para ver por qué</span></h2>
          <ul className="list card xfers">{d.map(t => <XferRow key={t.from + t.to} t={t} groupId={id} />)}</ul>
        </>}
        <h2 className="sec">Gastos {list.length > 0 && <span className="hint">desliza una fila para borrarla</span>}</h2>
        {list.length ? days.map(day => (
          <div key={day} style={{ display: 'grid', gap: 6 }}>
            <h3 className="day">{fday(day)}</h3>
            <ul className="list card">{list.filter(e => e.date === day).map(e => <ExpRow key={e.id} e={e} />)}</ul>
          </div>
        )) : <Empty icon="receipt" title="Todavía no hay gastos">Toca «Añadir gasto» para anotar el primero.</Empty>}
      </div>
    </>
  );
}

export function PersonScreen({ id }: { id: Id }) {
  const s = useS(), nav = useNav(), p = s.profiles[id];
  if (!p) return <><Bar /><p className="empty">Ya no compartes grupos con esta persona.</p></>;
  const { b, by } = friendBal(s, id), info = pendingInfo(s, id), gs = sharedGroups(s, s.me, id);
  const gotPaid = async () => {
    try {
      let ids: Id[] = [];
      await run(async be => { ids = await recordPay(be, s, id, s.me, b); });
      buzz(); nav.toast(`Pago de ${short(s, id)} registrado`, () => { run(be => Promise.all(ids.map(x => be.deleteExpense(x)))).catch(e => nav.toast(errMsg(e))); });
    } catch (e) { nav.toast(errMsg(e)); }
  };
  return (
    <>
      <Bar />
      <div className="scroll pad">
        <header className="head"><Av id={id} size="lg" /><h1>{p.name}</h1>{p.deletedAt ? <p className="meta">Borró su cuenta. Lo que compartieron sigue aquí.</p>
          : !p.userId && <p className="meta">Todavía no tiene cuenta: mándale el enlace del grupo.</p>}</header>
        <section className="card hero">
          <p className="lbl">{b > 0 ? `${short(s, id)} te debe` : b < 0 ? `Le debes a ${short(s, id)}` : 'Están a mano'}</p>
          <p className={`big${b > 0 ? ' pos' : b < 0 ? ' neg' : ''}`}><AnimMoney c={Math.abs(b)} sign={b > 0} /></p>
          {b !== 0 && info.n > 0 && <p className="note">{plural(info.n, 'gasto sin saldar', 'gastos sin saldar')}, el más viejo del {fday(info.since!).toLowerCase()}</p>}
          {Object.keys(by).length > 1 && <ul className="breakdown">{Object.entries(by).map(([g, x]) => (
            <li key={g}><span>{groupOf(s, g)?.kind === 'directo' ? 'Entre ustedes dos' : groupOf(s, g)?.name}</span><Money c={x} sign /></li>))}</ul>}
          <div className="actions">
            {b < 0 && <button className="btn primary tap" onClick={() => nav.openSheet(<PaySheet to={id} amount={-b} />, 'Pagar')}>Pagar</button>}
            {b > 0 && <><button className="btn primary tap" onClick={() => remind(s, id, b)}>Recordar</button><button className="btn tap" onClick={gotPaid}>Me pagó</button></>}
            <button className={`btn tap${b ? '' : ' primary'}`} onClick={() => nav.openSheet(<AddExpenseSheet friendId={id} />, 'Nuevo gasto', true)}><Icon n="plus" sm />{b ? 'Gasto' : 'Añadir gasto'}</button>
          </div>
        </section>
        {p.payout && <section className="card plain-card"><h2>Dónde pagarle</h2><p className="t" style={{ userSelect: 'text' }}>{p.payout}</p>
          <button className="btn sm tap" onClick={() => navigator.clipboard.writeText(p.payout!).then(() => nav.toast('Cuenta copiada'), () => nav.toast('No se pudo copiar'))}><Icon n="copy" sm />Copiar</button></section>}
        <h2 className="sec">Por qué</h2>
        <p className="note">Con + {short(s, id)} te debe más; con − le debes tú o ya te pagó. Toca un renglón para ver el gasto.</p>
        {gs.map(g => {
          const its = ledger(s.me, id, listOf(s, g)), sum = its.reduce((a, it) => a + it.x, 0), grp = groupOf(s, g)!;
          return its.length ? (
            <div key={g} style={{ display: 'grid', gap: 6 }}>
              <h3 className="day">{grp.kind === 'directo' ? 'Entre ustedes dos' : grp.name}<span>{sum ? <Money c={sum} sign /> : 'a mano'}</span></h3>
              <ul className="list card why">{[...its].reverse().map(it => <WhyRow key={it.e.id} it={it} a={s.me} b={id} />)}</ul>
            </div>) : null;
        })}
        {!gs.some(g => ledger(s.me, id, listOf(s, g)).length) && <Empty icon="receipt" title="Todavía no comparten gastos" />}
      </div>
    </>
  );
}

export function ExpenseScreen({ id }: { id: Id }) {
  const s = useS(), nav = useNav(), act = useAct(), e = s.expenses.find(x => x.id === id);
  const [text, setText] = useState('');
  if (!e) return <><Bar /><p className="empty">Este gasto ya no existe.</p></>;
  const c = cat(e.category), g = groupOf(s, e.groupId), m = mineOf(s, e);
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
    try { await run(b => b.addComment(id, t)); buzz(); } catch (err) { setText(t); nav.toast(errMsg(err)); }
  };
  return (
    <>
      <Bar right={editable && !e.deletedAt && !e.isPayment ? <button className="link tap" onClick={() => nav.openSheet(<AddExpenseSheet edit={e} />, 'Editar gasto', true)}><Icon n="edit" sm />Editar</button> : undefined} />
      <div className="scroll pad">
        <header className="head">
          <p className="meta"><Icon n={c.icon} sm />{c.name} · {fday(e.date)}{g && g.kind !== 'directo' ? ` · ${g.name}` : ''}</p>
          <h1>{e.isPayment ? payText(s, e) : e.description}</h1>
          <p className="big"><Money c={e.amount} cur={e.currency} /></p>
          {e.currency !== 'DOP' && <p className="note">Equivale a {moneyT(toBase(e).total)} · US$ 1 = RD$ {e.fxRate.toFixed(2)} ese día</p>}
          {e.deletedAt && <p className="note"><Pill tone="warn">borrado</Pill> No cuenta en los saldos.</p>}
          {e.isPayment && e.paymentStatus === 'pendiente' && !e.deletedAt && <p className="note"><Pill tone="warn">por confirmar</Pill> {recipient === s.me ? 'Confirma si te llegó.' : `${short(s, recipient!)} todavía no confirma que le llegó.`}</p>}
          {e.isPayment && e.paymentStatus === 'confirmado' && <p className="note"><Pill tone="ok">confirmado</Pill> {e.splitParams.method === 'efectivo' ? 'En efectivo.' : 'Por transferencia.'}</p>}
        </header>
        {e.isPayment && e.paymentStatus === 'pendiente' && recipient === s.me && !e.deletedAt &&
          <button className="btn primary block tap" onClick={() => act(b => b.confirmPayment(id), 'Pago confirmado')}><Icon n="check" sm />Sí, me llegó</button>}
        {e.deletedAt && editable && <button className="btn primary block tap" onClick={() => act(b => b.restoreExpense(id), 'Restaurado')}>Restaurar</button>}
        <section className="card">
          <h2>{e.isPayment ? 'Detalle' : 'Quién pagó y cuánto le toca'}</h2>
          {!e.isPayment && <p className="note">{modeText(e, k => short(s, k))}</p>}
          <ul className="shares">{people.map(k => {
            const x = k === s.me || e.isPayment ? 0 : pairVal(e, s.me, k);
            const it = x ? ledger(s.me, k, listOf(s, e.groupId)).find(i => i.e.id === e.id) : undefined;
            return (
              <li key={k}><Av id={k} />
                <span className="main"><span className="t">{k === s.me ? 'Tú' : s.profiles[k]?.name}</span>
                  {e.payers[k] != null && <span className="s">pagó {moneyT(e.payers[k], e.currency)}</span>}
                  {x !== 0 && <span className="s">{x > 0 ? `te debe ${moneyT(x)}` : `le debes ${moneyT(-x)}`} {it && <ItemStatus it={it} />}</span>}</span>
                <span className="end">{e.isPayment ? (e.payers[k] ? 'envió' : 'recibió') : <Money c={e.shares[k] || 0} cur={e.currency} />}</span>
              </li>);
          })}</ul>
          {you && <p className="you">{you}</p>}
        </section>
        {e.items && <section className="card"><h2>Recibo</h2>
          <ul className="items">{e.items.map((it, i) => <li key={i}><span className="main"><span className="t">{it.name}</span><Avs ids={it.to} /></span><Money c={it.price} cur={e.currency} /></li>)}</ul>
          <dl className="totals">
            <div><dt>Subtotal</dt><dd><Money c={e.items.reduce((a, i) => a + i.price, 0)} cur={e.currency} /></dd></div>
            {e.tax > 0 && <div><dt>ITBIS {e.tax} %</dt><dd><Money c={Math.round(e.items.reduce((a, i) => a + i.price, 0) * e.tax / 100)} cur={e.currency} /></dd></div>}
            {e.tip > 0 && <div><dt>Ley {e.tip} %</dt><dd><Money c={Math.round(e.items.reduce((a, i) => a + i.price, 0) * e.tip / 100)} cur={e.currency} /></dd></div>}
            <div className="total"><dt>Total</dt><dd><Money c={e.amount} cur={e.currency} /></dd></div>
          </dl></section>}
        {e.note && <section className="card"><h2>Nota</h2><p style={{ userSelect: 'text' }}>{e.note}</p></section>}
        <section className="card">
          <h2>Comentarios</h2>
          {comments.length ? <ul className="comments">{comments.map(x => (
            <li key={x.id}><Av id={x.profileId} size="sm" /><div><p className="s">{short(s, x.profileId)} · {ago(x.createdAt)}</p><p style={{ userSelect: 'text' }}>{x.body}</p></div></li>))}</ul>
            : <p className="note">Todavía nadie comenta.</p>}
          <form className="composer" onSubmit={ev => { ev.preventDefault(); send(); }}>
            <input value={text} onChange={ev => setText(ev.target.value)} placeholder="Escribe un comentario" enterKeyHint="send" autoComplete="off" aria-label="Comentario" maxLength={1000} />
            <button className="icon-btn tap" aria-label="Enviar comentario" disabled={!text.trim()}><Icon n="send" /></button>
          </form>
        </section>
        <p className="hist">{e.createdBy === s.me ? 'Lo añadiste tú' : `Lo añadió ${short(s, e.createdBy)}`} el {fdate(e.createdAt)} a las {ftime(e.createdAt)}</p>
        {editable && !e.deletedAt && <button className="btn danger block tap"
          onClick={() => { nav.back(); act(b => b.deleteExpense(id), e.isPayment ? 'Pago eliminado' : 'Gasto eliminado', b => b.restoreExpense(id)); }}>
          <Icon n="trash" sm />Eliminar {e.isPayment ? 'pago' : 'gasto'}</button>}
      </div>
    </>
  );
}

function modeText(e: { splitMode: string; shares: Record<string, number>; splitParams: { vals?: Record<string, number> }; tax: number; tip: number }, nm: (k: string) => string) {
  const vals = e.splitParams.vals ?? {};
  switch (e.splitMode) {
    case 'equal': return `Partes iguales entre ${Object.keys(e.shares).length}`;
    case 'percent': return 'Por porcentaje: ' + Object.keys(vals).filter(k => vals[k]).map(k => `${nm(k)} ${vals[k]} %`).join(', ');
    case 'shares': return 'Por partes: ' + Object.keys(vals).filter(k => vals[k]).map(k => `${nm(k)} ${vals[k]}`).join(', ');
    case 'items': return `Por lo que consumió cada quien${e.tax || e.tip ? `, con ${[e.tax && `ITBIS ${e.tax} %`, e.tip && `ley ${e.tip} %`].filter(Boolean).join(' y ')} repartidos en proporción` : ''}.`;
    case 'adjust': return 'Partes iguales con extras';
    default: return 'Montos exactos';
  }
}

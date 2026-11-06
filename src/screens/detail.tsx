import { useState } from 'react';
import { ago, budgetUse, byNewest, groupDates, groupEnded, groupUpcoming, canEdit, cat, debts, expensePhotoPath, fdate, fday, friendBal, ftime, fundLeft, fundOf, getBackend, groupBal, groupOf, involves, ledger, listOf, mineOf, moneyT, pairVal, pendingInfo, plural, recordPay, repeatText, run, sharedGroups, short, spent, splitText, toBase, type Id } from '@saldao/core';
import { Icon } from '../ui/icons';
import { AnimMoney, Av, Avs, Empty, ExpRow, ItemStatus, Money, Pill, WhyRow, errMsg, payText, useAct, useS } from '../ui/kit';
import { buzz, useNav } from '../ui/nav';
import { AddExpenseSheet } from '../sheets/AddExpense';
import { InviteSheet } from '../sheets/groups';
import { PaySheet, SettleSheet, XferRow, remind } from '../sheets/settle';
import { GroupSettingsSheet } from '../sheets/group-settings';
import { QrSheet } from '../sheets/qr';
import { pickPhoto, readPhoto } from '../lib/photo';
import { GroupPhoto, usePhotoUrl } from '../ui/photo';
import { tr } from '@saldao/core';

export const Bar = ({ right }: { right?: React.ReactNode }) => {
  const nav = useNav();
  return <header className="bar"><button className="back tap" onClick={nav.back}><Icon n="left" /><span>{tr("Atrás")}</span></button>{right}</header>;
};

export function GroupScreen({ id }: { id: Id }) {
  const s = useS(), nav = useNav(), g = groupOf(s, id);
  if (!g) return <><Bar /><p className="empty">{tr("Este grupo ya no existe o saliste de él.")}</p></>;
  const list = listOf(s, id).sort(byNewest), me = groupBal(s, id), d = debts(s, id), bu = budgetUse(s, id), fund = fundOf(s, id);
  const pendingItems = s.items.filter(i => i.groupId === id && !i.doneAt).length;
  const days = [...new Set(list.map(e => e.date))];
  return (
    <>
      <Bar right={<span className="bar-actions">
        <button className="link tap" onClick={() => nav.openSheet(<InviteSheet groupId={id} />, tr("Invitar"))}><Icon n="users" sm />{tr("Invitar")}</button>
        <button className="link tap" aria-label={tr("Ajustes del grupo")} onClick={() => nav.openSheet(<GroupSettingsSheet groupId={id} />, tr("Ajustes del grupo"), true)}><Icon n="edit" sm />{tr("Ajustes")}</button>
      </span>} />
      <div className="scroll pad">
        <header className="head">{g.photoPath ? <GroupPhoto g={g} size={64} /> : <Avs ids={g.members.filter(m => !s.profiles[m]?.fundOf)} />}<h1>{g.name}</h1>
          <p className="meta">{plural(g.members.filter(m => !s.profiles[m]?.fundOf).length, tr("persona"), tr("personas"))}{groupDates(g) ? ` · ${groupDates(g)}` : ''}{g.archivedAt ? tr(" · archivado") : ''}{g.simplify ? tr(" · deudas simplificadas") : ''}</p></header>
        {groupEnded(g) && <section className="card plain-card ended">
          <h2>{tr("Terminó el {0}", fdate(g.endsOn!))}</h2>
          <p className="s">{d.length ? tr("Toca saldar las cuentas. Cuando todos estén a mano, archiva el grupo para que no estorbe en la lista.") : tr("Todos están a mano: ya se puede archivar.")}</p>
          <div className="actions">
            {d.length > 0 && <button className="btn primary sm tap" onClick={() => nav.openSheet(<SettleSheet groupId={id} />, tr("Saldar"))}>{tr("Saldar")}</button>}
            {g.roles[s.me] === 'admin' && <button className="btn sm tap" onClick={() => run(b => b.updateGroup(id, { archived: true })).then(() => { nav.toast(tr("Grupo archivado")); nav.back(); }, e => nav.toast(errMsg(e)))}>{tr("Archivar")}</button>}
          </div>
        </section>}
        {groupUpcoming(g) && <p className="note"><Pill>{tr("empieza el {0}", fdate(g.startsOn!))}</Pill>{" "}{tr("Ya pueden ir anotando lo que se paga antes.")}</p>}
        <section className="card hero">
          <p className="lbl">{me > 0 ? tr("En este grupo te deben") : me < 0 ? tr("En este grupo debes") : tr("En este grupo estás a mano")}</p>
          <p className={`big${me > 0 ? ' pos' : me < 0 ? ' neg' : ''}`}><AnimMoney c={Math.abs(me)} sign={me > 0} /></p>
          <p className="note">{tr("Gastado entre todos: {0} · {1}", moneyT(spent(list)), d.length ? plural(d.length, tr("deuda abierta"), tr("deudas abiertas")) : tr("nadie le debe a nadie"))}</p>
          {bu && <div className={`budget${bu.ratio >= 1 ? ' over' : bu.ratio >= 0.8 ? ' near' : ''}`}>
            <p><span>{tr("Presupuesto del mes")}</span><span><Money c={bu.spent} />{" "}{tr("de")}{" "}<Money c={bu.budget} /></span></p>
            <span className="bar-t"><span style={{ width: `${Math.min(100, bu.ratio * 100)}%` }} /></span>
            {bu.ratio >= 0.8 && <p className="s">{bu.ratio >= 1 ? tr("Se pasaron por {0}.", moneyT(bu.spent - bu.budget)) : tr("Van por el {0} %: quedan {1}.", Math.round(bu.ratio * 100), moneyT(bu.budget - bu.spent))}</p>}
          </div>}
          <div className="actions">
            <button className="btn primary tap" onClick={() => nav.openSheet(<AddExpenseSheet groupId={id} />, tr("Nuevo gasto"), true)}><Icon n="plus" />{tr("Añadir gasto")}</button>
            <button className="btn tap" disabled={!d.length} onClick={() => nav.openSheet(<SettleSheet groupId={id} />, tr("Saldar"))}>{tr("Saldar")}</button>
          </div>
        </section>
        {fund && <section className="card plain-card fund">
          <h2>{tr("Fondo común")}</h2>
          <p className="t">{tr("Quedan")}{" "}<Money c={fundLeft(s, id)} /></p>
          <p className="s">{tr("Lo que se aportó menos lo que pagó el fondo.")}</p>
          <div className="actions">
            <button className="btn primary sm tap" onClick={() => nav.openSheet(<PaySheet to={fund} amount={0} groupId={id} contribution />, tr("Aportar"))}>{tr("Aportar")}</button>
            <button className="btn sm tap" onClick={() => nav.openSheet(<AddExpenseSheet groupId={id} preset={{ payer: fund }} />, tr("Nuevo gasto"), true)}>{tr("Gasto del fondo")}</button>
          </div>
        </section>}
        <button className="row card list-link tap" onClick={() => nav.push({ kind: 'list', id })}>
          <span className="row-ic accent"><Icon n="cart" /></span>
          <span className="main"><span className="t">{tr("Lista de compras")}</span><span className="s">{pendingItems ? plural(pendingItems, tr("cosa por comprar"), tr("cosas por comprar")) : tr("No falta nada")}</span></span>
          <Icon n="chevR" className="faint" />
        </button>
        {g.members.length < 2 && <section className="card plain-card"><h2>{tr("Falta gente")}</h2><p className="s">{tr("Invita a los demás con el enlace del grupo o agrégalos por nombre.")}</p>
          <button className="btn tap" onClick={() => nav.openSheet(<InviteSheet groupId={id} />, tr("Invitar"))}><Icon n="users" sm />{tr("Invitar")}</button></section>}
        {d.length > 0 && <>
          <h2 className="sec">{tr("Quién le debe a quién")}{" "}<span className="hint">{tr("toca para ver por qué")}</span></h2>
          <ul className="list card xfers">{d.map(t => <XferRow key={t.from + t.to} t={t} groupId={id} />)}</ul>
        </>}
        <h2 className="sec">{tr("Gastos")}{" "}{list.length > 0 && <span className="hint">{tr("desliza una fila para borrarla")}</span>}</h2>
        {list.length ? days.map(day => (
          <div key={day} style={{ display: 'grid', gap: 6 }}>
            <h3 className="day">{fday(day)}</h3>
            <ul className="list card">{list.filter(e => e.date === day).map(e => <ExpRow key={e.id} e={e} />)}</ul>
          </div>
        )) : <Empty icon="receipt" title={tr("Todavía no hay gastos")}>{tr("Toca «Añadir gasto» para anotar el primero.")}</Empty>}
      </div>
    </>
  );
}

export function PersonScreen({ id }: { id: Id }) {
  const s = useS(), nav = useNav(), p = s.profiles[id];
  if (!p) return <><Bar /><p className="empty">{tr("Ya no compartes grupos con esta persona.")}</p></>;
  const { b, by } = friendBal(s, id), info = pendingInfo(s, id), gs = sharedGroups(s, s.me, id);
  const gotPaid = async () => {
    try {
      let ids: Id[] = [];
      await run(async be => { ids = await recordPay(be, s, id, s.me, b); });
      buzz(); nav.toast(tr("Pago de {0} registrado", short(s, id)), () => { run(be => Promise.all(ids.map(x => be.deleteExpense(x)))).catch(e => nav.toast(errMsg(e))); });
    } catch (e) { nav.toast(errMsg(e)); }
  };
  return (
    <>
      <Bar />
      <div className="scroll pad">
        <header className="head"><Av id={id} size="lg" /><h1>{p.name}</h1>{p.deletedAt ? <p className="meta">{tr("Borró su cuenta. Lo que compartieron sigue aquí.")}</p>
          : !p.userId && <p className="meta">{tr("Todavía no tiene cuenta: mándale el enlace del grupo.")}</p>}</header>
        <section className="card hero">
          <p className="lbl">{b > 0 ? tr("{0} te debe", short(s, id)) : b < 0 ? tr("Le debes a {0}", short(s, id)) : tr("Están a mano")}</p>
          <p className={`big${b > 0 ? ' pos' : b < 0 ? ' neg' : ''}`}><AnimMoney c={Math.abs(b)} sign={b > 0} /></p>
          {b !== 0 && info.n > 0 && <p className="note">{tr("{0}, el más viejo del {1}", plural(info.n, tr("gasto sin saldar"), tr("gastos sin saldar")), fday(info.since!).toLowerCase())}</p>}
          {Object.keys(by).length > 1 && <ul className="breakdown">{Object.entries(by).map(([g, x]) => (
            <li key={g}><span>{groupOf(s, g)?.kind === 'directo' ? tr("Entre ustedes dos") : groupOf(s, g)?.name}</span><Money c={x} sign /></li>))}</ul>}
          <div className="actions">
            {b < 0 && <button className="btn primary tap" onClick={() => nav.openSheet(<PaySheet to={id} amount={-b} />, tr("Pagar"))}>{tr("Pagar")}</button>}
            {b > 0 && <><button className="btn primary tap" onClick={() => remind(s, id, b)}>{tr("Recordar")}</button><button className="btn tap" onClick={gotPaid}>{tr("Me pagó")}</button>
              <button className="btn tap" onClick={() => nav.openSheet(<QrSheet amount={b} from={id} />, tr("Tu código para cobrar"))}>{tr("Mi QR")}</button></>}
            <button className={`btn tap${b ? '' : ' primary'}`} onClick={() => nav.openSheet(<AddExpenseSheet friendId={id} />, tr("Nuevo gasto"), true)}><Icon n="plus" sm />{b ? tr("Gasto") : tr("Añadir gasto")}</button>
          </div>
        </section>
        {p.payout && <section className="card plain-card"><h2>{tr("Dónde pagarle")}</h2><p className="t" style={{ userSelect: 'text' }}>{p.payout}</p>
          <button className="btn sm tap" onClick={() => navigator.clipboard.writeText(p.payout!).then(() => nav.toast(tr("Cuenta copiada")), () => nav.toast(tr("No se pudo copiar")))}><Icon n="copy" sm />{tr("Copiar")}</button></section>}
        <h2 className="sec">{tr("Por qué")}</h2>
        <p className="note">{tr("Con + {0} te debe más; con − le debes tú o ya te pagó. Toca un renglón para ver el gasto.", short(s, id))}</p>
        {gs.map(g => {
          const its = ledger(s.me, id, listOf(s, g)), sum = its.reduce((a, it) => a + it.x, 0), grp = groupOf(s, g)!;
          return its.length ? (
            <div key={g} style={{ display: 'grid', gap: 6 }}>
              <h3 className="day">{grp.kind === 'directo' ? tr("Entre ustedes dos") : grp.name}<span>{sum ? <Money c={sum} sign /> : tr("a mano")}</span></h3>
              <ul className="list card why">{[...its].reverse().map(it => <WhyRow key={it.e.id} it={it} a={s.me} b={id} />)}</ul>
            </div>) : null;
        })}
        {!gs.some(g => ledger(s.me, id, listOf(s, g)).length) && <Empty icon="receipt" title={tr("Todavía no comparten gastos")} />}
      </div>
    </>
  );
}

export function ExpenseScreen({ id }: { id: Id }) {
  const s = useS(), nav = useNav(), act = useAct(), e = s.expenses.find(x => x.id === id);
  const [text, setText] = useState('');
  if (!e) return <><Bar /><p className="empty">{tr("Este gasto ya no existe.")}</p></>;
  const c = cat(e.category), g = groupOf(s, e.groupId), m = mineOf(s, e);
  const people = [...new Set([...Object.keys(e.payers), ...Object.keys(e.shares)])];
  const owner = Object.keys(e.payers).length === 1 ? Object.keys(e.payers)[0] : null;
  const editable = canEdit(s, e);
  const comments = s.comments.filter(x => x.expenseId === id);
  const you = e.isPayment ? null : m > 0 ? tr("Te deben {0} por este gasto.", moneyT(m)) : m < 0 ? tr("Tu parte: {0}{1}.", moneyT(-m), owner && owner !== s.me ? tr(", se la debes a {0}", short(s, owner)) : '')
    : involves(e, s.me) ? tr("Pagaste justo lo tuyo.") : tr("No participas en este gasto.");
  const recipient = e.isPayment ? Object.keys(e.shares)[0] : null;
  const send = async () => {
    const t = text.trim(); if (!t) return;
    setText('');
    try { await run(b => b.addComment(id, t)); buzz(); } catch (err) { setText(t); nav.toast(errMsg(err)); }
  };
  return (
    <>
      <Bar right={editable && !e.deletedAt && !e.isPayment ? <button className="link tap" onClick={() => nav.openSheet(<AddExpenseSheet edit={e} />, tr("Editar gasto"), true)}><Icon n="edit" sm />{tr("Editar")}</button> : undefined} />
      <div className="scroll pad">
        <header className="head">
          <p className="meta"><Icon n={c.icon} sm />{c.name} · {fday(e.date)}{g && g.kind !== 'directo' ? ` · ${g.name}` : ''}</p>
          <h1>{e.isPayment ? payText(s, e) : e.description}</h1>
          <p className="big"><Money c={e.amount} cur={e.currency} /></p>
          {e.currency !== 'DOP' && <p className="note">{tr("Equivale a {0} · US$ 1 = RD$ {1} ese día", moneyT(toBase(e).total), e.fxRate.toFixed(2))}</p>}
          {e.pending && <p className="note"><Pill>{tr("sin enviar")}</Pill>{" "}{tr("Guardado en este teléfono: se envía solo cuando haya conexión.")}</p>}
          {e.repeat && !e.deletedAt && <p className="note"><Pill tone="ok"><Icon n="repeat" sm /> {repeatText(e.repeat).toLowerCase()}</Pill>{" "}{tr("Se anota solo cuando toca.")}{editable && <button className="link tap" onClick={() => act(b => b.saveExpense({ ...e, repeat: null }), tr("Ya no se repite"))}>{tr("Dejar de repetir")}</button>}</p>}
          {e.repeatFrom && <p className="note"><Pill><Icon n="repeat" sm />{" "}{tr("repetido")}</Pill>{" "}{tr("Se anotó solo, como {0}.", s.expenses.find(x => x.id === e.repeatFrom)?.description ? `«${s.expenses.find(x => x.id === e.repeatFrom)!.description}»` : tr("el original"))}</p>}
          {e.deletedAt && <p className="note"><Pill tone="warn">{tr("borrado")}</Pill>{" "}{tr("No cuenta en los saldos.")}</p>}
          {e.isPayment && e.paymentStatus === 'pendiente' && !e.deletedAt && <p className="note"><Pill tone="warn">{tr("por confirmar")}</Pill> {recipient === s.me ? tr("Confirma si te llegó.") : tr("{0} todavía no confirma que le llegó.", short(s, recipient!))}</p>}
          {e.isPayment && e.paymentStatus === 'confirmado' && <p className="note"><Pill tone="ok">{tr("confirmado")}</Pill> {e.splitParams.method === 'efectivo' ? tr("En efectivo.") : tr("Por transferencia.")}</p>}
        </header>
        {e.isPayment && e.paymentStatus === 'pendiente' && recipient === s.me && !e.deletedAt &&
          <button className="btn primary block tap" onClick={() => act(b => b.confirmPayment(id), tr("Pago confirmado"))}><Icon n="check" sm />{tr("Sí, me llegó")}</button>}
        {e.deletedAt && editable && <button className="btn primary block tap" onClick={() => act(b => b.restoreExpense(id), tr("Restaurado"))}>{tr("Restaurar")}</button>}
        <section className="card">
          <h2>{e.isPayment ? tr("Detalle") : tr("Quién pagó y cuánto le toca")}</h2>
          {!e.isPayment && <p className="note">{splitText(e, k => short(s, k))}</p>}
          <ul className="shares">{people.map(k => {
            const x = k === s.me || e.isPayment ? 0 : pairVal(e, s.me, k);
            const it = x ? ledger(s.me, k, listOf(s, e.groupId)).find(i => i.e.id === e.id) : undefined;
            return (
              <li key={k}><Av id={k} />
                <span className="main"><span className="t">{k === s.me ? tr("Tú") : s.profiles[k]?.name}</span>
                  {e.payers[k] != null && <span className="s">{tr("pagó {0}", moneyT(e.payers[k], e.currency))}</span>}
                  {x !== 0 && <span className="s">{x > 0 ? tr("te debe {0}", moneyT(x)) : tr("le debes {0}", moneyT(-x))} {it && <ItemStatus it={it} />}</span>}</span>
                <span className="end">{e.isPayment ? (e.payers[k] ? tr("envió") : tr("recibió")) : <Money c={e.shares[k] || 0} cur={e.currency} />}</span>
              </li>);
          })}</ul>
          {you && <p className="you">{you}</p>}
        </section>
        {e.items && <section className="card"><h2>{tr("Recibo")}</h2>
          <ul className="items">{e.items.map((it, i) => <li key={i}><span className="main"><span className="t">{it.name}</span><Avs ids={it.to} /></span><Money c={it.price} cur={e.currency} /></li>)}</ul>
          <dl className="totals">
            <div><dt>{tr("Subtotal")}</dt><dd><Money c={e.items.reduce((a, i) => a + i.price, 0)} cur={e.currency} /></dd></div>
            {e.tax > 0 && <div><dt>{tr("ITBIS {0} %", e.tax)}</dt><dd><Money c={Math.round(e.items.reduce((a, i) => a + i.price, 0) * e.tax / 100)} cur={e.currency} /></dd></div>}
            {e.tip > 0 && <div><dt>{tr("Ley {0} %", e.tip)}</dt><dd><Money c={Math.round(e.items.reduce((a, i) => a + i.price, 0) * e.tip / 100)} cur={e.currency} /></dd></div>}
            <div className="total"><dt>{tr("Total")}</dt><dd><Money c={e.amount} cur={e.currency} /></dd></div>
          </dl></section>}
        {e.note && <section className="card"><h2>{tr("Nota")}</h2><p style={{ userSelect: 'text' }}>{e.note}</p></section>}
        <ReceiptPhoto id={e.id} groupId={e.groupId} path={e.photoPath ?? null} editable={editable && !e.deletedAt} />
        <section className="card">
          <h2>{tr("Comentarios")}</h2>
          {comments.length ? <ul className="comments">{comments.map(x => (
            <li key={x.id}><Av id={x.profileId} size="sm" /><div><p className="s">{short(s, x.profileId)} · {x.pending ? tr("sin enviar") : ago(x.createdAt)}</p><p style={{ userSelect: 'text' }}>{x.body}</p></div></li>))}</ul>
            : <p className="note">{tr("Todavía nadie comenta.")}</p>}
          <form className="composer" onSubmit={ev => { ev.preventDefault(); send(); }}>
            <input value={text} onChange={ev => setText(ev.target.value)} placeholder={tr("Escribe un comentario")} enterKeyHint="send" autoComplete="off" aria-label={tr("Comentario")} maxLength={1000} />
            <button className="icon-btn tap" aria-label={tr("Enviar comentario")} disabled={!text.trim()}><Icon n="send" /></button>
          </form>
        </section>
        <p className="hist">{tr("{0} el {1} a las {2}", e.createdBy === s.me ? tr("Lo añadiste tú") : tr("Lo añadió {0}", short(s, e.createdBy)), fdate(e.createdAt), ftime(e.createdAt))}</p>
        {editable && !e.deletedAt && <button className="btn danger block tap"
          onClick={() => { nav.back(); act(b => b.deleteExpense(id), e.isPayment ? tr("Pago eliminado") : tr("Gasto eliminado"), b => b.restoreExpense(id)); }}>
          <Icon n="trash" sm />{tr("Eliminar {0}", e.isPayment ? tr("pago") : tr("gasto"))}</button>}
      </div>
    </>
  );
}

/** La foto del comprobante: verla, cambiarla o quitarla. */
function ReceiptPhoto({ id, groupId, path, editable }: { id: Id; groupId: Id; path: string | null; editable: boolean }) {
  const nav = useNav(), url = usePhotoUrl(path);
  const [busy, setBusy] = useState(false);
  if (!path && !editable) return null;
  const change = async () => {
    const f = await pickPhoto(); if (!f) return;
    setBusy(true);
    try {
      const p = await readPhoto(f), np = expensePhotoPath(groupId, id), b = getBackend()!;
      await run(async () => { await b.uploadPhoto(np, { data: p.blob, type: 'image/jpeg', uri: p.uri }); await b.setExpensePhoto(id, np); });
      buzz(); nav.toast(tr("Foto guardada"));
    } catch (e) { nav.toast(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <section className="card">
      <h2>{tr("Comprobante")}</h2>
      {path ? (url ? <a href={url} target="_blank" rel="noopener" className="receipt"><img src={url} alt={tr("Foto del comprobante")} /></a> : <p className="note">{tr("Cargando la foto…")}</p>)
        : <p className="note">{tr("La factura o la captura de la transferencia, para que nadie tenga dudas.")}</p>}
      {editable && <div className="actions">
        <button className="btn sm tap" disabled={busy} onClick={change}><Icon n="plus" sm />{busy ? tr("Subiendo…") : path ? tr("Cambiar foto") : tr("Agregar foto")}</button>
        {path && <button className="btn sm tap" disabled={busy} onClick={() => run(b => b.setExpensePhoto(id, null)).then(() => nav.toast(tr("Foto quitada")), err => nav.toast(errMsg(err)))}>{tr("Quitar")}</button>}
      </div>}
    </section>
  );
}

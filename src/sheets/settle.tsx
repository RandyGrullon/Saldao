import { useState } from 'react';
import { debts, fdate, friendBal, friends, groupOf, listOf, nets, parseMoney, plural, recordPay, reminderText, run, short, simplify, whyItems, type Id, type Snapshot, type Transfer } from '@saldao/core';
import { Icon } from '../ui/icons';
import { Av, Money, WhyRow, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';

/** Registra un pago. Sin grupo, lo reparte entre los grupos donde hay deuda (de la más grande a la más chica). */

/** Recordatorio amable por WhatsApp (o lo que el teléfono ofrezca para compartir). */
export async function remind(s: Snapshot, p: Id, amount: number) {
  const text = reminderText(s, p, amount);
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* cancelado */ return; } }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

/** Una deuda directa que se despliega para mostrar de qué gastos sale, cuándo fue y qué ya se saldó. */
export function XferRow({ t, groupId }: { t: Transfer; groupId?: Id }) {
  const s = useS(), nav = useNav();
  const its = whyItems(s, t.to, t.from, groupId);
  const open = its.filter(it => it.left && !it.e.isPayment), over = its.find(it => it.left && it.e.isPayment);
  const since = open.map(it => it.e.date).sort()[0];
  const title = t.from === s.me ? `Le debes a ${short(s, t.to)}` : t.to === s.me ? `${short(s, t.from)} te debe` : `${short(s, t.from)} le debe a ${short(s, t.to)}`;
  const gotPaid = async () => {
    try {
      let ids: Id[] = [];
      await run(async b => { ids = await recordPay(b, s, t.from, s.me, t.amount, groupId); });
      buzz();
      nav.toast(`Pago de ${short(s, t.from)} registrado`, () => { run(b => Promise.all(ids.map(id => b.deleteExpense(id)))).catch(e => nav.toast(errMsg(e))); });
    } catch (e) { nav.toast(errMsg(e)); }
  };
  return (
    <li className="xfer">
      <details>
        <summary className="row tap">
          <span className="pair"><Av id={t.from} size="sm" /><Icon n="right" sm /><Av id={t.to} size="sm" /></span>
          <span className="main"><span className="t">{title}</span>
            <span className="s">{open.length ? `${plural(open.length, 'gasto sin saldar', 'gastos sin saldar')} · desde el ${fdate(since)}` : over ? `Pagó de más el ${fdate(over.e.date)}` : ''}</span></span>
          <span className="end-wrap"><span className={`end${t.to === s.me ? ' pos' : t.from === s.me ? ' neg' : ''}`}><Money c={t.amount} /></span><span className="more"><Icon n="left" sm className="chev" />Por qué</span></span>
        </summary>
        {its.length ? <ul className="why">{its.map(it => <WhyRow key={it.e.id} it={it} a={t.to} b={t.from} showGroup={!groupId} />)}</ul>
          : <p className="note why-note">Con las deudas simplificadas este pago sale de los saldos de todo el grupo, no de gastos entre ustedes dos.</p>}
      </details>
      {t.from === s.me && <div className="xfer-act"><button className="btn primary sm tap" onClick={() => nav.openSheet(<PaySheet to={t.to} amount={t.amount} groupId={groupId} />, 'Pagar')}>Pagar</button></div>}
      {t.to === s.me && <div className="xfer-act">
        <button className="btn sm tap" onClick={() => remind(s, t.from, t.amount)}>Recordar</button>
        <button className="btn sm tap" onClick={gotPaid}>Me pagó</button></div>}
    </li>
  );
}

export function SettleSheet({ groupId }: { groupId: Id }) {
  const s = useS(), g = groupOf(s, groupId);
  if (!g) return null;
  const d = debts(s, groupId), simple = simplify(nets(listOf(s, groupId))).length;
  return (
    <>
      <SheetHead title={`Saldar ${g.name}`} />
      <div className="scroll sheet-scroll pad">
        {d.length ? <>
          <p className="finding"><strong>{plural(d.length, 'deuda abierta', 'deudas abiertas')}</strong> en {g.name}.</p>
          <p className="note">Toca una para ver de qué gastos sale, cuándo fue y qué ya se saldó.{simple < d.length ? ` Con «Simplificar deudas» bastarían ${simple} pagos.` : ''}</p>
          <ul className="list card xfers">{d.map(t => <XferRow key={t.from + t.to} t={t} groupId={groupId} />)}</ul>
        </> : <p className="finding">Todo el mundo está a mano en {g.name}.</p>}
      </div>
    </>
  );
}

export function MySettleSheet() {
  const s = useS();
  const rows: Transfer[] = friends(s).map(p => ({ p, b: friendBal(s, p).b })).filter(x => x.b)
    .map(x => (x.b < 0 ? { from: s.me, to: x.p, amount: -x.b } : { from: x.p, to: s.me, amount: x.b }));
  return (
    <>
      <SheetHead title="Saldar cuentas" />
      <div className="scroll sheet-scroll pad">
        {rows.length ? <>
          <p className="note">Sumando todos tus grupos y los gastos de a dos.</p>
          <ul className="list card xfers">{rows.map(t => <XferRow key={t.from + t.to} t={t} />)}</ul>
        </> : <p className="finding">Estás a mano con todo el mundo.</p>}
      </div>
    </>
  );
}

export function PaySheet({ to, amount, groupId, contribution }: { to: Id; amount: number; groupId?: Id; contribution?: boolean }) {
  const s = useS(), nav = useNav(), p = s.profiles[to];
  const [val, setVal] = useState(amount ? (amount / 100).toFixed(2) : '');
  const [method, setMethod] = useState<'transferencia' | 'efectivo'>('transferencia');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const x = parseMoney(val);
    if (x <= 0) return nav.toast('Escribe un monto mayor que cero');
    setBusy(true);
    try {
      let ids: Id[] = [];
      await run(async b => { ids = await recordPay(b, s, s.me, to, x, groupId, method); });
      buzz(); nav.closeSheet();
      nav.toast(contribution ? 'Aporte anotado' : `Pago registrado. ${short(s, to)} debe confirmarlo.`, () => { run(b => Promise.all(ids.map(id => b.deleteExpense(id)))).catch(e => nav.toast(errMsg(e))); });
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };
  const copy = () => navigator.clipboard.writeText(p.payout!).then(() => nav.toast('Cuenta copiada'), () => nav.toast('No se pudo copiar. Mantén presionado el texto.'));
  return (
    <>
      <SheetHead title={contribution ? 'Aportar al fondo común' : `Pagar a ${short(s, to)}`} />
      <div className="scroll sheet-scroll pad">
        <label className="amount-in"><span>RD$</span><input id="pay-amt" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={val}
          onChange={e => setVal(e.target.value)} aria-label="Monto a pagar" /></label>
        {!contribution && <section className="card plain-card">
          <h2>Dónde pagarle a {short(s, to)}</h2>
          {p.payout ? <><p className="t" style={{ userSelect: 'text' }}>{p.payout}</p><p className="s">{p.name}</p>
            <button className="btn sm tap" onClick={copy}><Icon n="copy" sm />Copiar cuenta</button></>
            : <p className="s">{short(s, to)} todavía no ha puesto sus datos de cobro. Pídeselos o págale en efectivo.</p>}
        </section>}
        <div className="seg" role="radiogroup" aria-label="Cómo pagas">
          {(['transferencia', 'efectivo'] as const).map(k => (
            <button key={k} className="tap" role="radio" aria-checked={method === k} onClick={() => setMethod(k)}>{k === 'transferencia' ? 'Transferencia' : 'Efectivo'}</button>
          ))}
        </div>
        <button className="btn primary block tap" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Registrar pago'}</button>
        <p className="note center">{contribution ? 'El aporte queda en el fondo: los gastos del fondo salen de ahí.' : `A ${short(s, to)} le aparece en Actividad para que confirme que le llegó.`}</p>
      </div>
    </>
  );
}

import { useState } from 'react';
import { debts, fdate, friendBal, friends, groupOf, isFund, listOf, nets, parseMoney, plural, recordPay, reminderText, run, short, simplify, whyItems, xferTitle, type Id, type Snapshot, type Transfer } from '@saldao/core';
import { Icon } from '../ui/icons';
import { Av, Money, WhyRow, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';
import { tr } from '@saldao/core';

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
  const title = xferTitle(s, t), fromFund = isFund(s, t.from), toFund = isFund(s, t.to);
  const gotPaid = async () => {
    try {
      let ids: Id[] = [];
      await run(async b => { ids = await recordPay(b, s, t.from, s.me, t.amount, groupId); });
      buzz();
      nav.toast(tr("Pago de {0} registrado", short(s, t.from)), () => { run(b => Promise.all(ids.map(id => b.deleteExpense(id)))).catch(e => nav.toast(errMsg(e))); });
    } catch (e) { nav.toast(errMsg(e)); }
  };
  return (
    <li className="xfer">
      <details>
        <summary className="row tap">
          <span className="pair"><Av id={t.from} size="sm" /><Icon n="right" sm /><Av id={t.to} size="sm" /></span>
          <span className="main"><span className="t">{title}</span>
            <span className="s">{open.length ? tr("{0} · desde el {1}", plural(open.length, tr("gasto sin saldar"), tr("gastos sin saldar")), fdate(since)) : over ? tr("Pagó de más el {0}", fdate(over.e.date)) : ''}</span></span>
          <span className="end-wrap"><span className={`end${t.to === s.me ? ' pos' : t.from === s.me ? ' neg' : ''}`}><Money c={t.amount} /></span><span className="more"><Icon n="left" sm className="chev" />{tr("Por qué")}</span></span>
        </summary>
        {its.length ? <ul className="why">{its.map(it => <WhyRow key={it.e.id} it={it} a={t.to} b={t.from} showGroup={!groupId} />)}</ul>
          : <p className="note why-note">{tr("Con las deudas simplificadas este pago sale de los saldos de todo el grupo, no de gastos entre ustedes dos.")}</p>}
      </details>
      {t.from === s.me && <div className="xfer-act"><button className="btn primary sm tap" onClick={() => nav.openSheet(<PaySheet to={t.to} amount={t.amount} groupId={groupId} contribution={toFund} />, toFund ? tr("Aportar") : tr("Pagar"))}>{toFund ? tr("Aportar") : tr("Pagar")}</button></div>}
      {t.to === s.me && !fromFund && <div className="xfer-act">
        <button className="btn sm tap" onClick={() => remind(s, t.from, t.amount)}>{tr("Recordar")}</button>
        <button className="btn sm tap" onClick={gotPaid}>{tr("Me pagó")}</button></div>}
    </li>
  );
}

export function SettleSheet({ groupId }: { groupId: Id }) {
  const s = useS(), g = groupOf(s, groupId);
  if (!g) return null;
  const d = debts(s, groupId), simple = simplify(nets(listOf(s, groupId))).length;
  return (
    <>
      <SheetHead title={tr("Saldar {0}", g.name)} />
      <div className="scroll sheet-scroll pad">
        {d.length ? <>
          <p className="finding"><strong>{plural(d.length, tr("deuda abierta"), tr("deudas abiertas"))}</strong>{" "}{tr("en {0}.", g.name)}</p>
          <p className="note">{tr("Toca una para ver de qué gastos sale, cuándo fue y qué ya se saldó.{0}", simple < d.length ? tr(" Con «Simplificar deudas» bastarían {0} pagos.", simple) : '')}</p>
          <ul className="list card xfers">{d.map(t => <XferRow key={t.from + t.to} t={t} groupId={groupId} />)}</ul>
        </> : <p className="finding">{tr("Todo el mundo está a mano en {0}.", g.name)}</p>}
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
      <SheetHead title={tr("Saldar cuentas")} />
      <div className="scroll sheet-scroll pad">
        {rows.length ? <>
          <p className="note">{tr("Sumando todos tus grupos y los gastos de a dos.")}</p>
          <ul className="list card xfers">{rows.map(t => <XferRow key={t.from + t.to} t={t} />)}</ul>
        </> : <p className="finding">{tr("Estás a mano con todo el mundo.")}</p>}
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
    if (x <= 0) return nav.toast(tr("Escribe un monto mayor que cero"));
    setBusy(true);
    try {
      let ids: Id[] = [];
      await run(async b => { ids = await recordPay(b, s, s.me, to, x, groupId, method); });
      buzz(); nav.closeSheet();
      nav.toast(contribution ? tr("Aporte anotado") : tr("Pago registrado. {0} debe confirmarlo.", short(s, to)), () => { run(b => Promise.all(ids.map(id => b.deleteExpense(id)))).catch(e => nav.toast(errMsg(e))); });
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };
  const copy = () => navigator.clipboard.writeText(p.payout!).then(() => nav.toast(tr("Cuenta copiada")), () => nav.toast(tr("No se pudo copiar. Mantén presionado el texto.")));
  return (
    <>
      <SheetHead title={contribution ? tr("Aportar al fondo común") : tr("Pagar a {0}", short(s, to))} />
      <div className="scroll sheet-scroll pad">
        <label className="amount-in"><span>{tr("RD$")}</span><input id="pay-amt" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={val}
          onChange={e => setVal(e.target.value)} aria-label={tr("Monto a pagar")} /></label>
        {!contribution && <section className="card plain-card">
          <h2>{tr("Dónde pagarle a {0}", short(s, to))}</h2>
          {p.payout ? <><p className="t" style={{ userSelect: 'text' }}>{p.payout}</p><p className="s">{p.name}</p>
            <button className="btn sm tap" onClick={copy}><Icon n="copy" sm />{tr("Copiar cuenta")}</button></>
            : <p className="s">{tr("{0} todavía no ha puesto sus datos de cobro. Pídeselos o págale en efectivo.", short(s, to))}</p>}
        </section>}
        <div className="seg" role="radiogroup" aria-label={tr("Cómo pagas")}>
          {(['transferencia', 'efectivo'] as const).map(k => (
            <button key={k} className="tap" role="radio" aria-checked={method === k} onClick={() => setMethod(k)}>{k === 'transferencia' ? tr("Transferencia") : tr("Efectivo")}</button>
          ))}
        </div>
        <button className="btn primary block tap" disabled={busy} onClick={save}>{busy ? tr("Guardando…") : contribution ? tr("Registrar aporte") : tr("Registrar pago")}</button>
        <p className="note center">{contribution ? tr("El aporte queda en el fondo: los gastos del fondo salen de ahí.") : tr("A {0} le aparece en Actividad para que confirme que le llegó.", short(s, to))}</p>
      </div>
    </>
  );
}

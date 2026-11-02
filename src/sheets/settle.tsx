import { useState } from 'react';
import { nets, simplify, type Id, type Transfer } from '../lib/domain';
import { fdate, moneyT, parseMoney, plural, today } from '../lib/format';
import { allDebts, debts, friends, friendBal, groupOf, listOf, short, whyItems } from '../data/derive';
import { run } from '../data/store';
import type { Backend, Snapshot } from '../data/types';
import { Icon } from '../ui/icons';
import { Av, Money, WhyRow, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';

/** Registra un pago. Sin grupo, lo reparte entre los grupos donde hay deuda (de la más grande a la más chica). */
export async function recordPay(b: Backend, s: Snapshot, from: Id, to: Id, amount: number, groupId?: Id, method: 'transferencia' | 'efectivo' = 'transferencia') {
  const save = (g: Id, x: number) => b.saveExpense({ groupId: g, description: 'Pago', category: 'pago', date: today(), currency: 'DOP', amount: x, fxRate: 1,
    splitMode: 'payment', splitParams: { method }, items: null, tax: 0, tip: 0, note: null, repeat: null, payers: { [from]: x }, shares: { [to]: x }, isPayment: true });
  if (groupId) return [await save(groupId, amount)];
  const ids: Id[] = [];
  let rest = amount;
  for (const t of allDebts(s).filter(t => t.from === from && t.to === to).sort((a, c) => c.amount - a.amount)) {
    if (rest <= 0) break;
    const x = Math.min(rest, t.amount);
    ids.push(await save(t.groupId, x));
    rest -= x;
  }
  if (rest > 0) ids.push(await save(await b.directGroup(from === s.me ? to : from), rest));
  return ids;
}

/** Recordatorio amable por WhatsApp (o lo que el teléfono ofrezca para compartir). */
export async function remind(s: Snapshot, p: Id, amount: number) {
  const open = whyItems(s, s.me, p).filter(it => it.left && !it.e.isPayment && it.x > 0);
  const lines = open.slice(0, 5).map(it => `• ${it.e.description} (${fdate(it.e.date)}): ${moneyT(it.left)}`).join('\n');
  const text = `Hola ${short(s, p)}, según Saldao tenemos pendiente ${moneyT(amount)}:\n${lines}${open.length > 5 ? '\n…' : ''}\n\n${s.profiles[s.me]?.payout ? `Me puedes pagar a: ${s.profiles[s.me].payout}` : ''}`.trim();
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
          <span className="end-wrap"><span className="end"><Money c={t.amount} /></span><span className="more"><Icon n="left" sm className="chev" />Por qué</span></span>
        </summary>
        <ul className="why">{its.map(it => <WhyRow key={it.e.id} it={it} a={t.to} b={t.from} showGroup={!groupId} />)}</ul>
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

export function PaySheet({ to, amount, groupId }: { to: Id; amount: number; groupId?: Id }) {
  const s = useS(), nav = useNav(), p = s.profiles[to];
  const [val, setVal] = useState((amount / 100).toFixed(2));
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
      nav.toast(`Pago registrado. ${short(s, to)} debe confirmarlo.`, () => { run(b => Promise.all(ids.map(id => b.deleteExpense(id)))).catch(e => nav.toast(errMsg(e))); });
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };
  const copy = () => navigator.clipboard.writeText(p.payout!).then(() => nav.toast('Cuenta copiada'), () => nav.toast('No se pudo copiar. Mantén presionado el texto.'));
  return (
    <>
      <SheetHead title={`Pagar a ${short(s, to)}`} />
      <div className="scroll sheet-scroll pad">
        <label className="amount-in"><span>RD$</span><input id="pay-amt" inputMode="decimal" enterKeyHint="done" autoComplete="off" value={val}
          onChange={e => setVal(e.target.value)} aria-label="Monto a pagar" /></label>
        <section className="card plain-card">
          <h2>Dónde pagarle a {short(s, to)}</h2>
          {p.payout ? <><p className="t" style={{ userSelect: 'text' }}>{p.payout}</p><p className="s">{p.name}</p>
            <button className="btn sm tap" onClick={copy}><Icon n="copy" sm />Copiar cuenta</button></>
            : <p className="s">{short(s, to)} todavía no ha puesto sus datos de cobro. Pídeselos o págale en efectivo.</p>}
        </section>
        <div className="seg" role="radiogroup" aria-label="Cómo pagas">
          {(['transferencia', 'efectivo'] as const).map(k => (
            <button key={k} className="tap" role="radio" aria-checked={method === k} onClick={() => setMethod(k)}>{k === 'transferencia' ? 'Transferencia' : 'Efectivo'}</button>
          ))}
        </div>
        <button className="btn primary block tap" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Registrar pago'}</button>
        <p className="note center">A {short(s, to)} le aparece en Actividad para que confirme que le llegó.</p>
      </div>
    </>
  );
}

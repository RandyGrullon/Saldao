import type { CSSProperties, ReactNode } from 'react';
import { cat } from '../lib/categories';
import { involves, ledger, pairVal, type Expense, type Id, type LedgerItem } from '../lib/domain';
import { curSym, dayNum, fdate, monShort, moneyT, parts } from '../lib/format';
import { fullName, groupOf, hueOf, initials, listOf, mineOf, short } from '../data/derive';
import { run, useSnap } from '../data/store';
import type { Backend, Snapshot } from '../data/types';
import { Icon } from './icons';
import { buzz, useNav } from './nav';

export const useS = () => useSnap() as Snapshot;
export const errMsg = (e: unknown) => {
  const m = (e as { message?: string })?.message;
  return m && !/fetch|network/i.test(m) ? m : 'No se pudo completar. Revisa tu conexión e intenta de nuevo.';
};

/** Ejecuta una acción, avisa con un toast y ofrece deshacer cuando se puede. */
export function useAct() {
  const nav = useNav();
  return async (fn: (b: Backend) => Promise<unknown>, okText?: string, undo?: (b: Backend) => Promise<unknown>) => {
    try {
      await run(fn); buzz();
      if (okText) nav.toast(okText, undo ? () => { run(undo).catch(e => nav.toast(errMsg(e))); } : undefined);
      return true;
    } catch (e) { nav.toast(errMsg(e)); return false; }
  };
}

export function Money({ c, cur = 'DOP', sign = false }: { c: number; cur?: string; sign?: boolean }) {
  const [i, d] = parts(c), s = c < 0 ? '−' : sign && c > 0 ? '+' : '';
  return <span className="money">{s}{curSym(cur)}&nbsp;{i}<small>.{d}</small></span>;
}
export function Av({ id, size = '' }: { id: Id; size?: '' | 'xs' | 'sm' | 'lg' }) {
  const s = useS(), h = hueOf(s, id);
  return <span className={`av ${size}`} style={{ '--h': h ?? 0 } as CSSProperties} data-me={id === s.me || undefined} aria-hidden="true">{initials(s, id)}</span>;
}
export const Avs = ({ ids }: { ids: Id[] }) => <span className="avs">{ids.slice(0, 5).map(k => <Av key={k} id={k} size="xs" />)}</span>;
export const Pill = ({ tone, children }: { tone?: 'ok' | 'warn'; children: ReactNode }) => <span className={`pill${tone ? ' ' + tone : ''}`}>{children}</span>;
export const LeadDate = ({ date }: { date: string }) => <span className="lead-date"><b>{dayNum(date)}</b>{monShort(date)}</span>;

/** Saldo con alguien o en un grupo: + te deben (verde), − debes (tinta), cero a mano. */
export function BalText({ c, who }: { c: number; who?: boolean }) {
  if (c > 0) return <span className="end pos"><span className="lbl">{who ? 'te debe' : 'te deben'}</span><Money c={c} sign /></span>;
  if (c < 0) return <span className="end"><span className="lbl">{who ? 'le debes' : 'debes'}</span><Money c={-c} /></span>;
  return <span className="end zero"><span className="lbl">a mano</span></span>;
}

export function payText(s: Snapshot, e: Expense) {
  const from = Object.keys(e.payers)[0], to = Object.keys(e.shares)[0];
  if (from === s.me) return <>Le pagaste a <b>{short(s, to)}</b></>;
  if (to === s.me) return <><b>{short(s, from)}</b> te pagó</>;
  return <><b>{short(s, from)}</b> le pagó a <b>{short(s, to)}</b></>;
}
export function paidText(s: Snapshot, e: Expense) {
  const ps = Object.keys(e.payers);
  if (ps.length > 1) return `Pagaron ${ps.map(k => (k === s.me ? 'tú' : short(s, k))).join(' y ')}`;
  return ps[0] === s.me ? `Pagaste ${moneyT(e.amount, e.currency)}` : `${short(s, ps[0])} pagó ${moneyT(e.amount, e.currency)}`;
}
/** Cuánto mueve este gasto tu saldo. */
export function Impact({ e }: { e: Expense }) {
  const s = useS(), m = mineOf(s, e);
  if (e.isPayment) return m > 0 ? <span className="end pos"><span className="lbl">pagaste</span><Money c={m} /></span>
    : m < 0 ? <span className="end"><span className="lbl">recibiste</span><Money c={-m} /></span> : <span className="end zero"><span className="lbl">no participas</span></span>;
  if (m > 0) return <span className="end pos"><span className="lbl">prestaste</span><Money c={m} sign /></span>;
  if (m < 0) return <span className="end"><span className="lbl">te prestaron</span><Money c={-m} /></span>;
  return <span className="end zero"><span className="lbl">{involves(e, s.me) ? 'pagaste lo tuyo' : 'no participas'}</span></span>;
}

export const canEdit = (s: Snapshot, e: Expense) =>
  e.createdBy === s.me || involves(e, s.me) || groupOf(s, e.groupId)?.roles[s.me] === 'admin';

/** ¿Ya se saldó este movimiento? */
export function ItemStatus({ it }: { it: LedgerItem }) {
  if (!it.left) return <Pill tone="ok">{it.e.isPayment ? 'aplicado' : 'saldado'}{it.closedAt ? ` ${fdate(it.closedAt)}` : ''}</Pill>;
  if (it.e.isPayment) return <Pill>{it.covers.length ? `sobran ${moneyT(it.left)}` : 'a favor'}</Pill>;
  if (it.left < Math.abs(it.x)) return <Pill tone="warn">quedan {moneyT(it.left)}</Pill>;
  return <Pill tone="warn">pendiente</Pill>;
}

/** Un renglón del porqué, visto desde a: + suma a lo que b le debe a a. */
export function WhyRow({ it, a, b, showGroup }: { it: LedgerItem & { groupId?: Id }; a: Id; b: Id; showGroup?: boolean }) {
  const s = useS(), nav = useNav(), e = it.e, debtor = it.x > 0 ? b : a, share = e.shares[debtor] || 0;
  const g = showGroup && it.groupId ? groupOf(s, it.groupId) : null;
  const sub = e.isPayment
    ? (it.covers.length ? `Cubrió ${it.covers.map(c => `«${c.description}»`).join(', ')}${it.left ? ` y sobraron ${moneyT(it.left)}` : ''}` : 'Quedó como saldo a favor')
    : `${paidText(s, e)} · ${debtor === s.me ? 'tu parte' : `parte de ${short(s, debtor)}`} ${moneyT(share, e.currency)}${g && g.kind !== 'directo' ? ` · ${g.name}` : ''}`;
  const closed = it.closedBy && !it.left && !e.isPayment
    ? ` · se saldó con ${it.closedBy.isPayment ? `el pago del ${fdate(it.closedBy.date)}` : `«${it.closedBy.description}»`}` : '';
  return (
    <li>
      <button className="row tap" onClick={() => nav.push({ kind: 'expense', id: e.id })}>
        <LeadDate date={e.date} />
        <span className="main"><span className="t">{e.isPayment ? payText(s, e) : `«${e.description}»`}</span><span className="s">{sub}{closed}</span></span>
        <span className="end-wrap"><span className="end"><Money c={it.x} sign /></span><ItemStatus it={it} /></span>
      </button>
    </li>
  );
}

/** Fila de gasto en una lista. Se desliza a la izquierda para borrar (si puedes). */
export function ExpRow({ e, showGroup }: { e: Expense; showGroup?: boolean }) {
  const s = useS(), nav = useNav(), act = useAct(), c = cat(e.category);
  const g = groupOf(s, e.groupId);
  const status = myStatus(s, e);
  const row = (
    <button className="row tap" onClick={() => nav.push({ kind: 'expense', id: e.id })}>
      <Av id={Object.keys(e.payers)[0]} />
      <span className="main">
        <span className="t">{e.isPayment ? payText(s, e) : e.description}</span>
        <span className="s">
          {e.isPayment ? <>{moneyT(e.amount, e.currency)} · {fdate(e.date)}{e.paymentStatus === 'pendiente' && <Pill tone="warn">por confirmar</Pill>}</>
            : <><Icon n={c.icon} sm />{paidText(s, e)} · {fdate(e.date)}{showGroup && g && g.kind !== 'directo' ? ` · ${g.name}` : ''}
              {status && <Pill tone={status.done === status.total ? 'ok' : undefined}>{status.done === status.total ? 'saldado' : `${status.done} de ${status.total} saldados`}</Pill>}</>}
        </span>
      </span>
      <span className="end-wrap"><Impact e={e} /></span>
    </button>
  );
  if (!canEdit(s, e)) return <li>{row}</li>;
  return (
    <li className="swipe">
      {row}
      <button className="swipe-act tap" tabIndex={-1} onClick={() => act(b => b.deleteExpense(e.id), e.isPayment ? 'Pago eliminado' : 'Gasto eliminado', b => b.restoreExpense(e.id))}>
        <Icon n="trash" /><span>Eliminar</span>
      </button>
    </li>
  );
}
/** En la lista: si tu parte de este gasto ya se saldó con cada persona. */
function myStatus(s: Snapshot, e: Expense) {
  if (e.isPayment) return null;
  const ks = [...new Set([...Object.keys(e.payers), ...Object.keys(e.shares)])].filter(k => k !== s.me && pairVal(e, s.me, k));
  if (!ks.length) return null;
  const done = ks.filter(k => !ledger(s.me, k, listOf(s, e.groupId)).find(it => it.e.id === e.id)?.left).length;
  return done ? { done, total: ks.length } : null;
}

export { fullName, short };

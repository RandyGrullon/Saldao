import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { canEdit, cat, curSym, dayNum, fdate, fullName, groupOf, hueOf, initials, involves, mineOf, moneyT, monShort, myStatus, paidText, parts, run, short, type Backend, type Expense, type Id, type LedgerItem, type Snapshot } from '@saldao/core';
import { useSnap } from '../data/store';
import { Icon, type IconName } from './icons';
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
/** Un saldo que cuenta hasta su valor al aparecer o cambiar (como los números de MatchMate). Quieto con «menos movimiento». */
export function AnimMoney({ c, cur, sign }: { c: number; cur?: string; sign?: boolean }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const finish = () => { from.current = c; setShown(c); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return finish();
    const start = performance.now(), origin = from.current, ms = 700;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(origin + (c - origin) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick); else from.current = c;
    };
    frame = requestAnimationFrame(tick);
    const done = setTimeout(finish, ms + 100); // si los cuadros se pausan a mitad, igual queda en su valor
    return () => { cancelAnimationFrame(frame); clearTimeout(done); };
  }, [c]);
  return <Money c={shown} cur={cur} sign={sign && c > 0} />;
}

export function Av({ id, size = '' }: { id: Id; size?: '' | 'xs' | 'sm' | 'lg' }) {
  const s = useS(), h = hueOf(s, id);
  return <span className={`av ${size}`} style={{ '--h': h ?? 0 } as CSSProperties} data-me={id === s.me || undefined} aria-hidden="true">{initials(s, id)}</span>;
}
export const Avs = ({ ids }: { ids: Id[] }) => <span className="avs">{ids.slice(0, 5).map(k => <Av key={k} id={k} size="xs" />)}</span>;
export const Pill = ({ tone, children }: { tone?: 'ok' | 'warn'; children: ReactNode }) => <span className={`pill${tone ? ' ' + tone : ''}`}>{children}</span>;
export const LeadDate = ({ date }: { date: string }) => <span className="lead-date"><span>{monShort(date)}</span><b>{dayNum(date)}</b></span>;
/** Ícono en caja de 40 px al principio de una fila. */
export const RowIc = ({ n, tone }: { n: IconName; tone?: 'accent' | 'ok' }) => <span className={`row-ic${tone ? ' ' + tone : ''}`} aria-hidden="true"><Icon n={n} /></span>;

/** Vacío: una invitación con ícono, qué es este lugar y, si hay, la acción. */
export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-ic" aria-hidden="true"><Icon n={icon} /></span>
      <p className="t">{title}</p>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** La forma de Inicio mientras llegan tus cuentas: el saldo y unas filas que brillan. */
export function HomeSkeleton() {
  return (
    <div className="sk-page" aria-busy="true" aria-label="Cargando">
      <div className="skeleton" style={{ width: 120, height: 14 }} />
      <div className="skeleton" style={{ width: 200, height: 30, marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 250, borderRadius: 22 }} />
      <div className="skeleton" style={{ width: 110, height: 18, marginTop: 14 }} />
      <div className="card">{[0, 1, 2, 3].map(i => (
        <div key={i} className="sk-row"><div className="skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
          <div className="sk-lines"><div className="skeleton" style={{ height: 13, width: `${62 - i * 9}%` }} /><div className="skeleton" style={{ height: 11, width: '35%' }} /></div>
          <div className="skeleton" style={{ width: 54, height: 16 }} /></div>))}</div>
    </div>
  );
}

/** Saldo con alguien o en un grupo: + te deben (verde), − debes (tinta), cero a mano. */
export function BalText({ c, who }: { c: number; who?: boolean }) {
  if (c > 0) return <span className="end pos"><span className="lbl">{who ? 'te debe' : 'te deben'}</span><Money c={c} sign /></span>;
  if (c < 0) return <span className="end neg"><span className="lbl">{who ? 'le debes' : 'debes'}</span><Money c={-c} /></span>;
  return <span className="end zero"><span className="lbl">a mano</span></span>;
}

export function payText(s: Snapshot, e: Expense) {
  const from = Object.keys(e.payers)[0], to = Object.keys(e.shares)[0];
  if (from === s.me) return <>Le pagaste a <b>{short(s, to)}</b></>;
  if (to === s.me) return <><b>{short(s, from)}</b> te pagó</>;
  return <><b>{short(s, from)}</b> le pagó a <b>{short(s, to)}</b></>;
}
/** Cuánto mueve este gasto tu saldo. */
export function Impact({ e }: { e: Expense }) {
  const s = useS(), m = mineOf(s, e);
  if (e.isPayment) return m > 0 ? <span className="end pos"><span className="lbl">pagaste</span><Money c={m} /></span>
    : m < 0 ? <span className="end"><span className="lbl">recibiste</span><Money c={-m} /></span> : <span className="end zero"><span className="lbl">no participas</span></span>;
  if (m > 0) return <span className="end pos"><span className="lbl">prestaste</span><Money c={m} sign /></span>;
  if (m < 0) return <span className="end neg"><span className="lbl">te prestaron</span><Money c={-m} /></span>;
  return <span className="end zero"><span className="lbl">{involves(e, s.me) ? 'pagaste lo tuyo' : 'no participas'}</span></span>;
}

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
      <RowIc n={c.icon} tone={e.isPayment ? 'ok' : undefined} />
      <span className="main">
        <span className="t">{e.isPayment ? payText(s, e) : e.description}</span>
        <span className="s">
          {e.isPayment ? <>{moneyT(e.amount, e.currency)} · {fdate(e.date)}{e.paymentStatus === 'pendiente' && <Pill tone="warn">por confirmar</Pill>}</>
            : <>{paidText(s, e)} · {fdate(e.date)}{showGroup && g && g.kind !== 'directo' ? ` · ${g.name}` : ''}
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

export { fullName, short };

import { useEffect, useState } from 'react';
import { discard, plural } from '@saldao/core';
import { useSync } from '../data/store';
import { Icon } from './icons';
import { SheetHead, useNav } from './nav';

/**
 * Encima de las pestañas: sin conexión, lo que falta por enviar o lo que la base no aceptó. Con conexión, un guardado
 * normal no la muestra (solo si tarda).
 */
export function SyncPill() {
  const st = useSync(), nav = useNav();
  const urgent = st.offline || st.failed.length > 0, want = urgent || st.pending > 0;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!want) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), urgent ? 0 : 1500);
    return () => clearTimeout(t);
  }, [want, urgent]);
  if (!show) return null;
  if (st.failed.length) return (
    <div className="sync-wrap">
      <button className="sync-pill bad tap" onClick={() => nav.openSheet(<FailedSheet />, 'Cambios que no se guardaron')}>
        <span className="dot" />{st.failed.length === 1 ? 'Un cambio no se guardó' : `${st.failed.length} cambios no se guardaron`}<b>Ver</b>
      </button>
    </div>
  );
  const changes = plural(st.pending, 'cambio', 'cambios');
  return (
    <div className="sync-wrap">
      <p className={`sync-pill${st.offline ? '' : ' busy'}`} role="status">
        <span className="dot" />{st.offline ? (st.pending ? `Sin conexión · ${changes} por enviar` : 'Sin conexión · ves lo último guardado') : `Enviando ${changes}…`}
      </p>
    </div>
  );
}

function FailedSheet() {
  const { failed } = useSync(), nav = useNav();
  useEffect(() => { if (!failed.length) nav.closeSheet(); }, [failed.length, nav]);
  return (
    <>
      <SheetHead title="No se guardaron" />
      <div className="scroll sheet-scroll pad">
        <p className="note">La base no aceptó estos cambios, así que no cuentan en los saldos. Si todavía hacen falta, vuelve a hacerlos.</p>
        <ul className="list card">
          {failed.map(o => (
            <li key={o.id}><div className="row">
              <span className="main"><span className="t wrap">{o.label}</span><span className="s">{o.error}</span></span>
              <button className="btn sm tap" onClick={() => discard(o.id)}><Icon n="trash" sm />Descartar</button>
            </div></li>
          ))}
        </ul>
      </div>
    </>
  );
}

// Mantener la app al día: avisar cuando hay una versión nueva (con un botón para cambiarse) y deslizar hacia abajo en
// cualquier pantalla para traer los datos de nuevo.
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { APP, sync, tr } from '@saldao/core';
import { Icon } from './icons';
import { buzz, useNav } from './nav';

const CHECK_EVERY = 30 * 60_000; // además de al volver a la app

/** «Hay una versión nueva»: el service worker nuevo espera hasta que la persona toca Actualizar. */
export function UpdateBar() {
  const { needRefresh: [need, setNeed], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (!document.hidden && navigator.onLine) reg.update().catch(() => {}); };
      setInterval(check, CHECK_EVERY);
      document.addEventListener('visibilitychange', check);
    },
  });
  const [busy, setBusy] = useState(false);
  if (!need) return null;
  return (
    <div className="update-bar" role="status">
      <Icon n="bolt" sm />
      <span className="main">{tr('Hay una versión nueva de {0}', APP.name)}</span>
      <button className="link tap" onClick={() => setNeed(false)}>{tr('Luego')}</button>
      <button className="btn primary sm tap" disabled={busy} onClick={() => { setBusy(true); updateServiceWorker(true).catch(() => location.reload()); }}>
        {busy ? tr('Actualizando…') : tr('Actualizar')}</button>
    </div>
  );
}

const PULL = 64; // lo que hay que bajar el dedo (ya amortiguado) para recargar

/**
 * Deslizar hacia abajo estando arriba del todo en una pantalla trae los datos de nuevo (y manda lo pendiente). Un solo
 * escucha para todas las pantallas; no se activa dentro de hojas, campos ni listas que se deslizan de lado.
 */
export function PullToRefresh() {
  const nav = useNav();
  const [y, setY] = useState(0);
  const [busy, setBusy] = useState(false);
  const st = useRef({ startY: 0, startX: 0, dist: 0, pulling: false, el: null as HTMLElement | null, busy: false });
  useEffect(() => {
    const s = st.current;
    const down = (e: TouchEvent) => {
      if (s.busy || e.touches.length !== 1) return;
      const t = e.target as HTMLElement;
      if (t.closest('.sheet, [role="dialog"], input, textarea, select, .scroll-x, .tiles')) return;
      const el = t.closest<HTMLElement>('.scroll');
      if (!el || el.scrollTop > 0) return;
      s.el = el; s.pulling = true; s.dist = 0; s.startY = e.touches[0].clientY; s.startX = e.touches[0].clientX;
    };
    const move = (e: TouchEvent) => {
      if (!s.pulling || !s.el) return;
      const dy = e.touches[0].clientY - s.startY, dx = Math.abs(e.touches[0].clientX - s.startX);
      if (s.el.scrollTop > 0 || dx > Math.abs(dy)) { s.pulling = false; setY(0); return; }
      s.dist = Math.max(0, dy) * 0.5;
      setY(Math.min(s.dist, 96));
    };
    const up = async () => {
      if (!s.pulling) return;
      s.pulling = false;
      if (s.dist < PULL) { setY(0); return; }
      buzz(); s.busy = true; setBusy(true); setY(56);
      try { await sync(); nav.toast(tr('Datos al día')); }
      catch { nav.toast(tr('No se pudo completar. Revisa tu conexión e intenta de nuevo.')); }
      finally { s.busy = false; setBusy(false); setY(0); }
    };
    document.addEventListener('touchstart', down, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', up);
    document.addEventListener('touchcancel', up);
    return () => {
      document.removeEventListener('touchstart', down);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', up);
      document.removeEventListener('touchcancel', up);
    };
  }, [nav]);
  if (!y && !busy) return null;
  return (
    <div className={`ptr${busy ? ' busy' : ''}`} style={{ transform: `translate(-50%, ${y}px)`, opacity: Math.min(1, y / PULL) }} role="status"
      aria-label={busy ? tr('Actualizando…') : tr('Suelta para actualizar')}>
      <span className="ptr-ic" style={{ transform: `rotate(${busy ? 0 : y * 4}deg)` }}><Icon n="repeat" sm /></span>
    </div>
  );
}

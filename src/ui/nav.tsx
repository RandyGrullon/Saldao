import { flushSync } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from 'react';

export type Tab = 'home' | 'groups' | 'activity' | 'account';
export type Route = { kind: 'group' | 'person' | 'expense' | 'list' | 'summary' | 'search'; id: string };
type Entry = { key: number; route: Route; leaving?: boolean };
type SheetSt = { key: number; node: ReactNode; label: string; full?: boolean; leaving?: boolean };
type ToastSt = { key: number; text: string; undo?: () => void };

export interface Nav {
  tab: Tab;
  setTab(t: Tab): void;
  push(r: Route): void;
  back(): void;
  top(): Route | undefined;
  openSheet(node: ReactNode, label: string, full?: boolean): void;
  closeSheet(): void;
  toast(text: string, undo?: () => void): void;
}
const Ctx = createContext<Nav | null>(null);
export const useNav = () => useContext(Ctx)!;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const buzz = () => { try { navigator.vibrate?.(8); } catch { /* sin háptica */ } };
let seq = 0;

/** Corre fn cuando termina la transición de transform del elemento (o enseguida si no hay animación). */
function afterTransform(el: HTMLElement | null, fn: () => void) {
  if (!el || reduced()) return fn();
  let done = false;
  const go = () => { if (!done) { done = true; el.removeEventListener('transitionend', h); fn(); } };
  const h = (e: TransitionEvent) => { if (e.target === el && e.propertyName === 'transform') go(); };
  el.addEventListener('transitionend', h);
  setTimeout(go, 700);
}

export function NavShell({ renderTab, renderRoute, tabbar, children }: {
  renderTab: (t: Tab) => ReactNode; renderRoute: (r: Route) => ReactNode; tabbar: (nav: Nav) => ReactNode; children?: ReactNode;
}) {
  const [tab, setTabSt] = useState<Tab>('home');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sheet, setSheet] = useState<SheetSt | null>(null);
  const [toastSt, setToast] = useState<ToastSt | null>(null);
  const st = useRef({ tab, entries, sheet });
  st.current = { tab, entries, sheet };
  const opener = useRef<HTMLElement | null>(null);

  // Atrás del sistema (Android, gesto): una entrada de historial "trampa" que se vuelve a armar cada vez que hay algo que cerrar.
  const armed = useRef(false);
  const arm = useCallback(() => { if (!armed.current) { history.pushState({ saldao: true }, ''); armed.current = true; } }, []);

  const closeSheet = useCallback(() => {
    setSheet(s => (s && !s.leaving ? { ...s, leaving: true } : s));
    opener.current?.focus?.({ preventScroll: true });
  }, []);
  const back = useCallback(() => {
    setEntries(es => { const i = es.map(e => !e.leaving).lastIndexOf(true); return i < 0 ? es : es.map((e, j) => (j === i ? { ...e, leaving: true } : e)); });
  }, []);
  const setTab = useCallback((t: Tab) => { setEntries([]); setTabSt(t); if (t !== 'home') arm(); }, [arm]);

  useEffect(() => {
    const onPop = () => {
      armed.current = false;
      const { sheet: s, entries: es, tab: t } = st.current;
      if (s && !s.leaving) closeSheet();
      else if (es.some(e => !e.leaving)) back();
      else if (t !== 'home') setTabSt('home');
      else return; // nada que cerrar: el siguiente atrás sale de la app
      arm();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { st.current.sheet ? closeSheet() : back(); } };
    addEventListener('popstate', onPop); addEventListener('keydown', onKey);
    return () => { removeEventListener('popstate', onPop); removeEventListener('keydown', onKey); };
  }, [arm, back, closeSheet]);

  const toastTimer = useRef<number | undefined>(undefined);
  const nav = useMemo<Nav>(() => ({
    tab, setTab, back, closeSheet,
    push: r => { setEntries(es => [...es.filter(e => !e.leaving), { key: ++seq, route: r }]); arm(); },
    top: () => [...st.current.entries].reverse().find(e => !e.leaving)?.route,
    openSheet: (node, label, full) => { opener.current = document.activeElement as HTMLElement; setSheet({ key: ++seq, node, label, full }); arm(); },
    toast: (text, undo) => {
      clearTimeout(toastTimer.current);
      setToast({ key: ++seq, text, undo });
      toastTimer.current = window.setTimeout(() => setToast(null), 4500);
    },
  }), [tab, setTab, back, closeSheet, arm]);

  const active = entries.filter(e => !e.leaving);
  return (
    <Ctx.Provider value={nav}>
      <div className="app">
        <div className="stage">
          {(['home', 'groups', 'activity', 'account'] as Tab[]).map(t => (
            <section key={t} className={`view${t === tab && active.length ? ' covered' : ''}`} hidden={t !== tab} data-view>{renderTab(t)}</section>
          ))}
          {entries.map((e, i) => (
            <StackScreen key={e.key} entry={e} covered={entries.slice(i + 1).some(x => !x.leaving)} isTop={e === active[active.length - 1]}
              onGone={() => setEntries(es => es.filter(x => x.key !== e.key))} onBack={back}>{renderRoute(e.route)}</StackScreen>
          ))}
        </div>
        {tabbar(nav)}
        {sheet && <Sheet sheet={sheet} onDismiss={closeSheet} onGone={() => setSheet(s => (s?.key === sheet.key ? null : s))} />}
        <div className="toast-host">{toastSt && <Toast t={toastSt} onDone={() => setToast(null)} />}</div>
      </div>
      {children}
    </Ctx.Provider>
  );
}

function useEntered() {
  const [on, setOn] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setOn(true))); return () => cancelAnimationFrame(r); }, []);
  return on;
}

function StackScreen({ entry, covered, isTop, onGone, onBack, children }: {
  entry: Entry; covered: boolean; isTop: boolean; onGone: () => void; onBack: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const entered = useEntered();
  useEffect(() => { if (entry.leaving) afterTransform(ref.current, onGone); }, [entry.leaving]); // eslint-disable-line react-hooks/exhaustive-deps

  // Volver arrastrando desde el borde izquierdo, como en iOS.
  const onPointerDown = (ev: RPointerEvent<HTMLElement>) => {
    const el = ref.current!, r = el.getBoundingClientRect();
    if (!isTop || ev.clientX - r.left > 24 || (ev.target as HTMLElement).closest('input, textarea')) return;
    const under = (el.previousElementSibling?.matches('.screen') ? el.previousElementSibling : el.parentElement!.querySelector('[data-view]:not([hidden])')) as HTMLElement;
    const w = r.width, x0 = ev.clientX, ac = new AbortController();
    let dx = 0, v = 0, lx = x0, lt = ev.timeStamp;
    el.setPointerCapture(ev.pointerId);
    el.style.transition = under.style.transition = 'none';
    el.addEventListener('pointermove', e => {
      dx = Math.max(0, e.clientX - x0);
      el.style.transform = `translateX(${dx}px)`; under.style.transform = `translateX(${-28 + (dx / w) * 28}%)`;
      v = (e.clientX - lx) / Math.max(1, e.timeStamp - lt); lx = e.clientX; lt = e.timeStamp;
    }, { signal: ac.signal });
    const up = () => {
      ac.abort();
      el.style.transition = under.style.transition = '';
      // se aplica el cambio de clase en el mismo cuadro, así la salida arranca desde donde quedó el dedo
      if (dx > w * 0.35 || v > 0.5) flushSync(onBack);
      el.style.transform = under.style.transform = '';
    };
    el.addEventListener('pointerup', up, { signal: ac.signal });
    el.addEventListener('pointercancel', up, { signal: ac.signal });
  };
  return <section ref={ref} className={`screen${entered && !entry.leaving ? ' in' : ''}${covered ? ' covered' : ''}`} onPointerDown={onPointerDown}>{children}</section>;
}

function Sheet({ sheet, onDismiss, onGone }: { sheet: SheetSt; onDismiss: () => void; onGone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const entered = useEntered();
  const shown = entered && !sheet.leaving;
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { if (sheet.leaving) afterTransform(ref.current, onGone); }, [sheet.leaving]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrastrar hacia abajo cierra; la velocidad cuenta tanto como la distancia.
  const onPointerDown = (ev: RPointerEvent<HTMLDivElement>) => {
    const t = ev.target as HTMLElement, z = t.closest('[data-drag]') as HTMLElement | null;
    if (!z || t.closest('button, input, select, label, textarea')) return;
    const el = ref.current!, h = el.offsetHeight, y0 = ev.clientY, ac = new AbortController();
    let dy = 0, v = 0, ly = y0, lt = ev.timeStamp;
    z.setPointerCapture(ev.pointerId);
    el.style.transition = 'none';
    z.addEventListener('pointermove', e => {
      dy = e.clientY - y0;
      el.style.transform = `translateY(${dy < 0 ? -Math.sqrt(-dy) * 2 : dy}px)`; // resistencia al subir
      v = (e.clientY - ly) / Math.max(1, e.timeStamp - lt); ly = e.clientY; lt = e.timeStamp;
    }, { signal: ac.signal });
    const up = () => {
      ac.abort(); el.style.transition = '';
      if (dy > h * 0.25 || v > 0.45) flushSync(onDismiss);
      el.style.transform = '';
    };
    z.addEventListener('pointerup', up, { signal: ac.signal });
    z.addEventListener('pointercancel', up, { signal: ac.signal });
  };
  return (
    <>
      <div className={`scrim${shown ? ' open' : ''}`} onClick={onDismiss} />
      <div ref={ref} className={`sheet${sheet.full ? ' full' : ''}${shown ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label={sheet.label}
        tabIndex={-1} onPointerDown={onPointerDown}>
        <div className="grab" data-drag><span /></div>
        <div className="sheet-in">{sheet.node}</div>
      </div>
    </>
  );
}

function Toast({ t, onDone }: { t: ToastSt; onDone: () => void }) {
  const on = useEntered();
  return (
    <div className={`toast${on ? ' on' : ''}`} role="status">
      <span>{t.text}</span>
      {t.undo && <button className="tap" onClick={() => { t.undo!(); onDone(); }}>Deshacer</button>}
    </div>
  );
}

/** Cabecera de hoja: izquierda, título, derecha. Se puede arrastrar. */
export function SheetHead({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  const { closeSheet } = useNav();
  return (
    <div className="sheet-head" data-drag>
      {left ?? <button className="link tap" onClick={closeSheet}>Cancelar</button>}
      <h2>{title}</h2>
      {right ?? <span />}
    </div>
  );
}

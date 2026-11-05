import { useEffect, useRef, useState } from 'react';
import { APP } from './app.config';
import { start, stop, useBusy, useSnap } from './data/store';
import { isConfigured, sb, supabaseBackend } from './data/supabase';
import { pendingInvite } from './lib/invite';
import { AuthScreen, NewPasswordScreen } from './screens/auth';
import { LegalGate } from './screens/legal';
import { ExpenseScreen, GroupScreen, PersonScreen } from './screens/detail';
import { Account, ActivityTab, Groups, Home, useUnread } from './screens/tabs';
import { JoinSheet } from './sheets/groups';
import { Icon, type IconName } from './ui/icons';
import { HomeSkeleton, errMsg } from './ui/kit';
import { NavShell, useNav, type Nav, type Tab } from './ui/nav';

/** La bienvenida de index.html se va cuando hay algo que mostrar (y a más tardar a los 4 s). */
function hideSplash() {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('out')) return;
  el.classList.add('out');
  setTimeout(() => el.remove(), 400);
}
setTimeout(hideSplash, 4000);

const DEMO = import.meta.env.VITE_DEMO === '1';
type Phase = 'loading' | 'login' | 'ready' | 'setup' | 'error';

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const user = useRef<string | null | undefined>(undefined);
  // al volver del enlace de "olvidé mi contraseña" se pide la nueva antes de entrar
  const [recovery, setRecovery] = useState(() => location.hash.includes('type=recovery'));
  useEffect(() => {
    if (DEMO) { import('./data/demo').then(m => start(m.demoBackend)).then(() => setPhase('ready')); return; }
    if (!isConfigured()) { setPhase('setup'); return; }
    const boot = async (uid: string | null) => {
      if (uid === user.current) return;
      user.current = uid;
      if (!uid) { stop(); setPhase('login'); return; }
      setPhase('loading');
      try { await start(supabaseBackend); setPhase('ready'); } catch (e) { setErr(errMsg(e)); setPhase('error'); }
    };
    // supabase-js recomienda no llamar a Supabase dentro del callback: se difiere un tick.
    const { data } = sb().auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true);
      setTimeout(() => boot(session?.user.id ?? null), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (phase !== 'loading') hideSplash(); }, [phase]);

  if (recovery && !DEMO && phase !== 'login') return <NewPasswordScreen onDone={() => setRecovery(false)} />;
  if (phase === 'ready') return <Ready />;
  if (phase === 'login') return <AuthScreen />;
  if (phase === 'setup') return (
    <main className="gate"><h1>{APP.name}</h1>
      <p className="lead">Falta conectar Supabase: copia <code>.env.example</code> como <code>.env.local</code> con la URL y la anon key de tu proyecto, y vuelve a arrancar.</p>
      <p className="note">Para verla sin backend: <code>npm run dev:demo</code>.</p></main>);
  if (phase === 'error') return (
    <main className="gate"><h1>No pudimos cargar tus cuentas</h1><p className="lead">{err}</p>
      <button className="btn primary block tap" onClick={() => location.reload()}>Intentar de nuevo</button>
      <button className="btn danger block tap" onClick={() => sb().auth.signOut()}>Cerrar sesión</button></main>);
  return <HomeSkeleton />;
}

function Ready() {
  const s = useSnap();
  const busy = useBusy();
  const unread = useUnread(s);
  const [token] = useState(pendingInvite);
  if (!s) return null;
  // Con Google, una cuenta de antes de los términos o una versión nueva: primero aceptar.
  if (!s.legalOk) return <LegalGate />;
  return (
    <NavShell
      renderTab={t => t === 'home' ? <Home /> : t === 'groups' ? <Groups /> : t === 'activity' ? <ActivityTab unread={unread} /> : <Account demo={DEMO} />}
      renderRoute={r => r.kind === 'group' ? <GroupScreen id={r.id} /> : r.kind === 'person' ? <PersonScreen id={r.id} /> : <ExpenseScreen id={r.id} />}
      tabbar={nav => <Tabbar nav={nav} unread={unread.n} />}>
      {token && <OpenOnce node={<JoinSheet token={token} />} label="Invitación" />}
      {busy && <div className="top-loader" role="progressbar" aria-label="Guardando" />}
    </NavShell>
  );
}

function OpenOnce({ node, label }: { node: React.ReactNode; label: string }) {
  const nav = useNav(), done = useRef(false);
  useEffect(() => { if (!done.current) { done.current = true; nav.openSheet(node, label); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Como en MatchMate: cuatro secciones y ningún botón en el centro. «Añadir gasto» va en la tarjeta principal de
// Inicio, de cada grupo y de cada persona, que ya saben con quién es el gasto.
const TABS: [Tab, IconName, string][] = [['home', 'home', 'Inicio'], ['groups', 'users', 'Grupos'], ['activity', 'bell', 'Actividad'], ['account', 'user', 'Cuenta']];
function Tabbar({ nav, unread }: { nav: Nav; unread: number }) {
  return (
    <nav className="tabbar" aria-label="Secciones">
      {TABS.map(([t, icon, label]) => (
        <button key={t} className="tab" aria-current={nav.tab === t ? 'page' : undefined} onClick={() => nav.setTab(t)}>
          <span className="pip"><Icon n={icon} /></span><span>{label}</span>
          {t === 'activity' && unread > 0 && <span className="badge" aria-label={`${unread} sin leer`}>{unread > 99 ? '99+' : unread}</span>}
        </button>
      ))}
    </nav>
  );
}

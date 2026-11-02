import { useEffect, useRef, useState } from 'react';
import { APP } from './app.config';
import { start, stop, useSnap } from './data/store';
import { isConfigured, sb, sendCode, signInWithGoogle, supabaseBackend, verifyCode } from './data/supabase';
import { ExpenseScreen, GroupScreen, PersonScreen } from './screens/detail';
import { Account, ActivityTab, Groups, Home, useUnread } from './screens/tabs';
import { AddExpenseSheet } from './sheets/AddExpense';
import { JoinSheet } from './sheets/groups';
import { Icon, type IconName } from './ui/icons';
import { errMsg } from './ui/kit';
import { NavShell, useNav, type Nav, type Tab } from './ui/nav';

const DEMO = import.meta.env.VITE_DEMO === '1';
type Phase = 'loading' | 'login' | 'ready' | 'setup' | 'error';

export function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [err, setErr] = useState('');
  const user = useRef<string | null | undefined>(undefined);
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
    const { data } = sb().auth.onAuthStateChange((_ev, session) => { setTimeout(() => boot(session?.user.id ?? null), 0); });
    return () => data.subscription.unsubscribe();
  }, []);

  if (phase === 'ready') return <Ready />;
  if (phase === 'login') return <Login />;
  if (phase === 'setup') return (
    <main className="gate"><h1>{APP.name}</h1>
      <p className="lead">Falta conectar Supabase: copia <code>.env.example</code> como <code>.env.local</code> con la URL y la anon key de tu proyecto, y vuelve a arrancar.</p>
      <p className="note">Para verla sin backend: <code>npm run dev:demo</code>.</p></main>);
  if (phase === 'error') return (
    <main className="gate"><h1>No pudimos cargar tus cuentas</h1><p className="lead">{err}</p>
      <button className="btn primary block tap" onClick={() => location.reload()}>Intentar de nuevo</button>
      <button className="btn danger block tap" onClick={() => sb().auth.signOut()}>Cerrar sesión</button></main>);
  return <main className="gate" aria-busy="true"><p className="note center">Cargando…</p></main>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const go = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg('');
    try { await fn(); } catch (e) { setMsg(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <main className="gate">
      <div><h1>{APP.name}</h1><p className="lead">{APP.description}</p></div>
      {!sent ? (
        <form className="form" onSubmit={e => { e.preventDefault(); go(async () => { await sendCode(email.trim()); setSent(true); }); }}>
          <label>Tu correo<input className="field" type="email" inputMode="email" autoComplete="email" enterKeyHint="send" required value={email}
            onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" /></label>
          <button className="btn primary block tap" disabled={busy || !email.includes('@')}><Icon n="mail" sm />{busy ? 'Enviando…' : 'Enviarme un código'}</button>
        </form>
      ) : (
        <form className="form" onSubmit={e => { e.preventDefault(); go(() => verifyCode(email.trim(), code.trim())); }}>
          <p className="note">Te mandamos un código a <b>{email}</b>. Revisa también spam.</p>
          <label>Código<input className="field code" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="go" maxLength={8} value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" /></label>
          <button className="btn primary block tap" disabled={busy || code.length < 6}>{busy ? 'Entrando…' : 'Entrar'}</button>
          <button type="button" className="link tap" onClick={() => { setSent(false); setCode(''); }}>Usar otro correo</button>
        </form>
      )}
      <p className="or">o</p>
      <button className="btn block tap" disabled={busy} onClick={() => go(signInWithGoogle)}>Entrar con Google</button>
      {msg && <p className="err" role="alert">{msg}</p>}
    </main>
  );
}

function Ready() {
  const s = useSnap();
  const unread = useUnread(s);
  const [token] = useState(() => new URLSearchParams(location.search).get('unirse'));
  if (!s) return null;
  return (
    <NavShell
      renderTab={t => t === 'home' ? <Home /> : t === 'groups' ? <Groups /> : t === 'activity' ? <ActivityTab unread={unread} /> : <Account demo={DEMO} />}
      renderRoute={r => r.kind === 'group' ? <GroupScreen id={r.id} /> : r.kind === 'person' ? <PersonScreen id={r.id} /> : <ExpenseScreen id={r.id} />}
      tabbar={nav => <Tabbar nav={nav} unread={unread.n} />}>
      {token && <OpenOnce node={<JoinSheet token={token} />} label="Invitación" />}
    </NavShell>
  );
}

function OpenOnce({ node, label }: { node: React.ReactNode; label: string }) {
  const nav = useNav(), done = useRef(false);
  useEffect(() => { if (!done.current) { done.current = true; nav.openSheet(node, label); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

const TABS: [Tab, IconName, string][] = [['home', 'home', 'Inicio'], ['groups', 'users', 'Grupos'], ['activity', 'bell', 'Actividad'], ['account', 'user', 'Cuenta']];
function Tabbar({ nav, unread }: { nav: Nav; unread: number }) {
  const s = useSnap()!;
  // El "+" sabe dónde estás: en un grupo, con una persona o viendo un gasto.
  const add = () => {
    const r = nav.top();
    const groupId = r?.kind === 'group' ? r.id : r?.kind === 'expense' ? s.expenses.find(e => e.id === r.id)?.groupId : undefined;
    nav.openSheet(<AddExpenseSheet groupId={groupId} friendId={r?.kind === 'person' ? r.id : undefined} />, 'Nuevo gasto', true);
  };
  const btn = ([t, icon, label]: (typeof TABS)[number]) => (
    <button key={t} className="tab tap" aria-current={nav.tab === t ? 'page' : undefined} onClick={() => nav.setTab(t)}>
      <Icon n={icon} /><span>{label}</span>
      {t === 'activity' && unread > 0 && <span className="badge" aria-label={`${unread} sin leer`}>{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
  return (
    <nav className="tabbar" aria-label="Secciones">
      {TABS.slice(0, 2).map(btn)}
      <button className="tab tab-add tap" aria-label="Añadir gasto" onClick={add}><Icon n="plus" /></button>
      {TABS.slice(2).map(btn)}
    </nav>
  );
}

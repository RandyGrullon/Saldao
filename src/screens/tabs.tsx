import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ago, APP, archivedGroups, groupDates, groupEnded, canEdit, exportCsv, exportHtml, exportName, fdate, monthName, monthStats, overdue, thisMonth, friendBal, friends, groupBal, groupOf, hueOf, moneyT, myTotals, pendingInfo, plural, PRIVACY_URL, run, short, TERMS_URL, typedUser, USERNAME, USERNAME_RULE, visibleGroups, type Activity, type Group, type Snapshot } from '@saldao/core';
import { Icon } from '../ui/icons';
import { AnimMoney, Av, BalText, Empty, RowIc, Impact, Money, errMsg, payText, useAct, useS } from '../ui/kit';
import { buzz, useNav } from '../ui/nav';
import { MySettleSheet } from '../sheets/settle';
import { useSync } from '../data/store';
import { NewGroupSheet } from '../sheets/groups';
import { AddExpenseSheet } from '../sheets/AddExpense';
import { loadTheme, saveTheme, type ThemeMode } from '../lib/theme';
import { DeleteAccountSheet } from './legal';
import { remind } from '../sheets/settle';
import { QrSheet } from '../sheets/qr';
import { download, printReport } from '../sheets/group-settings';
import { GroupPhoto } from '../ui/photo';
import { disablePush, enablePush, pushOn, pushSupported } from '../lib/push';
import { disableLock, enableLock, lockOn, lockSupported } from '../lib/lock';

const KIND: Record<string, string> = { casa: 'Casa', viaje: 'Viaje', pareja: 'Pareja', otro: 'Grupo', directo: 'Entre dos' };

export function GroupRow({ g }: { g: Group }) {
  const nav = useNav(), s = useS();
  return (
    <li><button className="row tap" onClick={() => nav.push({ kind: 'group', id: g.id })}>
      <GroupPhoto g={g} />
      <span className="main"><span className="t">{g.name}</span><span className="s">{KIND[g.kind]} · {groupDates(g) || plural(g.members.filter(m => !s.profiles[m]?.fundOf).length, 'persona', 'personas')}{groupEnded(g) ? ' · terminó' : ''}{g.archivedAt ? ' · archivado' : ''}</span></span>
      <BalText c={groupBal(s, g.id)} />
    </button></li>
  );
}

function FirstRun() {
  const nav = useNav();
  return (
    <Empty icon="users" title="Empieza con un grupo"
      action={<button className="btn primary block tap" onClick={() => nav.openSheet(<NewGroupSheet />, 'Nuevo grupo')}><Icon n="plus" sm />Crear grupo</button>}>
      El apartamento, el viaje, la pareja. Anota los gastos y {APP.name} te dice quién le debe a quién, por qué y desde cuándo.
    </Empty>
  );
}

const DIA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const todayLabel = (d = new Date()) => `${DIA[d.getDay()]} ${d.getDate()} de ${MES[d.getMonth()]}`;

export function Home() {
  const s = useS(), nav = useNav();
  const t = myTotals(s);
  const people = friends(s).map(p => ({ p, b: friendBal(s, p).b, i: pendingInfo(s, p) })).sort((a, b) => b.b - a.b);
  const top = people[0]?.b > 0 ? people[0] : null;
  const owe = people.filter(x => x.b < 0).sort((a, b) => a.b - b.b)[0];
  const late = overdue(s), month = monthStats(s);
  return (
    <div className="scroll pad home">
      <header className="title-row"><div><p className="date">{todayLabel()}</p><h1>Hola, {s.profiles[s.me].name.split(' ')[0]}</h1></div>
        <button className="round tap" onClick={() => nav.setTab('account')} aria-label="Tu cuenta"><Av id={s.me} size="sm" /></button></header>
      {!visibleGroups(s).length && !people.length ? <FirstRun /> : <>
        <section className="card hero">
          <p className="lbl">{t.net > 0 ? 'En total te deben' : t.net < 0 ? 'En total debes' : 'Estás a mano con todo el mundo'}</p>
          <p className={`big${t.net > 0 ? ' pos' : t.net < 0 ? ' neg' : ''}`}><AnimMoney c={Math.abs(t.net)} sign={t.net > 0} /></p>
          <div className="split2"><div><span className="lbl">Te deben</span><span className="pos"><Money c={t.owed} /></span></div><div><span className="lbl">Debes</span><span className="neg"><Money c={t.owe} /></span></div></div>
          {(top || owe) && <p className="finding-line">
            {top && <><b>{short(s, top.p)}</b> es quien más te debe: {moneyT(top.b)}{top.i.since ? `, sin saldar desde el ${fdate(top.i.since)}` : ''}. </>}
            {owe && <>A quien más le debes es a <b>{short(s, owe.p)}</b>: {moneyT(-owe.b)}.</>}
          </p>}
          <div className="actions">
            <button className="btn primary tap" onClick={() => nav.openSheet(<AddExpenseSheet />, 'Nuevo gasto', true)}><Icon n="plus" />Añadir gasto</button>
            <button className="btn tap" disabled={!t.owed && !t.owe} onClick={() => nav.openSheet(<MySettleSheet />, 'Saldar cuentas')}>Saldar cuentas</button>
          </div>
        </section>
        {late.length > 0 && <section className="card plain-card remind">
          <h2>Para cobrar</h2>
          <ul>{late.slice(0, 3).map(x => (
            <li key={x.p}><Av id={x.p} size="sm" /><span className="main"><span className="t">{short(s, x.p)} te debe {moneyT(x.amount)}</span><span className="s">sin saldar hace {x.days} días</span></span>
              <button className="btn sm tap" onClick={() => remind(s, x.p, x.amount)}>Recordar</button></li>))}</ul>
        </section>}
        <button className="row card list-link tap" onClick={() => nav.push({ kind: 'summary', id: '' })}>
          <span className="row-ic accent"><Icon n="cal" /></span>
          <span className="main"><span className="t">Tu {monthName(thisMonth()).split(' ')[0]}</span><span className="s">Tu parte de lo gastado: {moneyT(month.total)}</span></span>
          <Icon n="chevR" className="faint" />
        </button>
        {people.length > 0 && <>
          <h2 className="sec">Personas <span className="hint">toca para ver por qué</span></h2>
          <ul className="tiles">{people.map(x => (
            <li key={x.p}><button className={`tile tap${x.b ? '' : ' zero'}`} style={{ '--h': hueOf(s, x.p) ?? 0 } as CSSProperties} onClick={() => nav.push({ kind: 'person', id: x.p })}>
              <Av id={x.p} /><span className="tile-n">{short(s, x.p)}</span>
              <span className="tile-l">{x.b > 0 ? 'te debe' : x.b < 0 ? 'le debes' : 'están a mano'}</span>
              <span className={`tile-v${x.b > 0 ? ' pos' : x.b < 0 ? ' neg' : ''}`}>{x.b ? <Money c={Math.abs(x.b)} sign={x.b > 0} /> : null}</span>
              <span className="tile-s">{x.i.n ? `${plural(x.i.n, 'gasto', 'gastos')} sin saldar · desde ${fdate(x.i.since!)}` : 'todo saldado'}</span>
            </button></li>))}</ul>
        </>}
        {visibleGroups(s).length > 0 && <>
          <h2 className="sec">Grupos <button className="link tap" onClick={() => nav.setTab('groups')}>Ver todos<Icon n="chevR" sm /></button></h2>
          <ul className="list card">{visibleGroups(s).slice(0, 4).map(g => <GroupRow key={g.id} g={g} />)}</ul>
        </>}
        {s.activity.length > 0 && <>
          <h2 className="sec">Reciente <button className="link tap" onClick={() => nav.setTab('activity')}>Actividad<Icon n="chevR" sm /></button></h2>
          <ul className="list card">{s.activity.slice(0, 4).map(a => <EvRow key={a.id} a={a} />)}</ul>
        </>}
      </>}
    </div>
  );
}

export function Groups() {
  const s = useS(), nav = useNav();
  const duo = friends(s).filter(p => s.groups.some(g => g.kind === 'directo' && g.members.includes(p)));
  return (
    <div className="scroll pad">
      <header className="title-row"><h1>Grupos</h1>
        <span className="bar-actions">
          <button className="round tap" aria-label="Buscar gastos" onClick={() => nav.push({ kind: 'search', id: '' })}><Icon n="eye" /></button>
          <button className="btn sm soft tap" onClick={() => nav.openSheet(<NewGroupSheet />, 'Nuevo grupo')}><Icon n="plus" sm />Nuevo</button>
        </span></header>
      {visibleGroups(s).length ? <ul className="list card">{visibleGroups(s).map(g => <GroupRow key={g.id} g={g} />)}</ul> : <FirstRun />}
      {duo.length > 0 && <>
        <h2 className="sec">Entre dos</h2>
        <ul className="list card">{duo.map(p => {
          const d = s.groups.find(g => g.kind === 'directo' && g.members.includes(p))!;
          return <li key={p}><button className="row tap" onClick={() => nav.push({ kind: 'person', id: p })}><Av id={p} />
            <span className="main"><span className="t">{s.profiles[p].name}</span><span className="s">Gastos entre ustedes dos</span></span>
            <BalText c={friendBal(s, p).by[d.id] || 0} who /></button></li>;
        })}</ul>
      </>}
      {archivedGroups(s).length > 0 && <>
        <h2 className="sec">Archivados <span className="hint">sus saldos siguen contando</span></h2>
        <ul className="list card">{archivedGroups(s).map(g => <GroupRow key={g.id} g={g} />)}</ul>
      </>}
    </div>
  );
}

const SEEN = (me: string) => `saldao:visto:${me}`;
export function useUnread(s: Snapshot | null) {
  const [seen, setSeen] = useState(() => { try { return s ? localStorage.getItem(SEEN(s.me)) ?? '' : ''; } catch { return ''; } });
  const n = s ? s.activity.filter(a => a.actor !== s.me && a.createdAt > seen).length : 0;
  const markSeen = () => { if (!s?.activity[0]) return; const t = s.activity[0].createdAt; setSeen(t); try { localStorage.setItem(SEEN(s.me), t); } catch { /* sin almacenamiento */ } };
  return { n, seen, markSeen };
}

function evText(s: Snapshot, a: Activity): ReactNode {
  const who = <b>{a.actor === s.me ? 'Tú' : short(s, a.actor)}</b>;
  const e = a.expenseId ? s.expenses.find(x => x.id === a.expenseId) : undefined;
  const desc = `«${e?.description ?? (a.payload.descripcion as string) ?? 'un gasto'}»`;
  const g = groupOf(s, a.groupId), where = g && g.kind !== 'directo' ? ` en ${g.name}` : '';
  const me = a.actor === s.me;
  switch (a.verb) {
    case 'grupo_creado': return <>{who} {me ? 'creaste' : 'creó'} el grupo{where}</>;
    case 'miembro_agregado': return <>{who} {me ? 'agregaste' : 'agregó'} a {String(a.payload.nombre ?? 'alguien')}{where}</>;
    case 'se_unio': return <>{who} {me ? 'te uniste' : 'se unió'}{where}</>;
    case 'gasto_creado': return <>{who} {me ? 'añadiste' : 'añadió'} {desc}{where}</>;
    case 'gasto_editado': {
      const an = a.payload.antes as { monto?: number; moneda?: string } | undefined, de = a.payload.despues as { monto?: number; moneda?: string } | undefined;
      const changed = an && de && an.monto !== de.monto ? `: el monto pasó de ${moneyT(Number(an.monto), an.moneda)} a ${moneyT(Number(de.monto), de.moneda)}` : '';
      return <>{who} {me ? 'editaste' : 'editó'} {desc}{where}{changed}</>;
    }
    case 'gasto_borrado': return <>{who} {me ? 'borraste' : 'borró'} {desc}{where}</>;
    case 'gasto_restaurado': return <>{who} {me ? 'restauraste' : 'restauró'} {desc}{where}</>;
    case 'pago_registrado': return e ? <>{payText(s, e)} {moneyT(e.amount)}{where}</> : <>{who} registró un pago</>;
    case 'pago_confirmado': return <>{who} {me ? 'confirmaste' : 'confirmó'} que le llegó el pago{where}</>;
    case 'comentario': return <>{who} {me ? 'comentaste' : 'comentó'} en {desc}: “{String(a.payload.texto ?? '')}”</>;
    case 'grupo_editado': return <>{who} {me ? 'cambiaste' : 'cambió'} {a.payload.archived === true ? 'el grupo al archivo' : a.payload.name ? `el nombre a «${String(a.payload.name)}»` : a.payload.budget !== undefined ? 'el presupuesto' : a.payload.simplify !== undefined ? 'cómo se saldan las deudas' : a.payload.starts_on !== undefined || a.payload.ends_on !== undefined ? 'las fechas' : 'el grupo'}{where}</>;
    case 'salio': return <>{who} {me ? 'saliste' : 'salió'} del grupo{where}</>;
    case 'fondo_creado': return <>{who} {me ? 'creaste' : 'creó'} el fondo común{where}</>;
    case 'miembro_quitado': return <>{who} {me ? 'quitaste' : 'quitó'} a {String(a.payload.nombre ?? 'alguien')} del grupo{where}</>;
  }
}

export function EvRow({ a, fresh }: { a: Activity; fresh?: boolean }) {
  const s = useS(), nav = useNav(), act = useAct();
  const e = a.expenseId ? s.expenses.find(x => x.id === a.expenseId) : undefined;
  const pendingForMe = e?.isPayment && !e.deletedAt && e.paymentStatus === 'pendiente' && e.shares[s.me] != null;
  const restorable = a.verb === 'gasto_borrado' && e?.deletedAt && canEdit(s, e);
  const open = () => e && !e.deletedAt && nav.push({ kind: 'expense', id: e.id });
  return (
    <li><div className={`row${e && !e.deletedAt ? ' tap' : ' static'}${fresh ? ' fresh' : ''}`} role={e && !e.deletedAt ? 'button' : undefined} tabIndex={e && !e.deletedAt ? 0 : undefined}
      onClick={open} onKeyDown={k => k.key === 'Enter' && open()}>
      <Av id={a.actor} />
      <span className="main"><span className="t wrap">{evText(s, a)}</span><span className="s">{ago(a.createdAt)}{fresh && <span className="pill">nuevo</span>}</span></span>
      {pendingForMe ? <button className="btn sm primary tap" onClick={ev => { ev.stopPropagation(); act(b => b.confirmPayment(e!.id), 'Pago confirmado'); }}>Confirmar</button>
        : restorable ? <button className="btn sm tap" onClick={ev => { ev.stopPropagation(); act(b => b.restoreExpense(e!.id), 'Gasto restaurado'); }}>Restaurar</button>
        : e && !e.deletedAt && (a.verb === 'gasto_creado' || a.verb === 'pago_registrado') ? <span className="end-wrap"><Impact e={e} /></span> : null}
    </div></li>
  );
}

export function ActivityTab({ unread }: { unread: ReturnType<typeof useUnread> }) {
  const s = useS(), nav = useNav();
  useEffect(() => { if (nav.tab === 'activity') { const t = setTimeout(unread.markSeen, 1500); return () => clearTimeout(t); } }, [nav.tab, s]); // eslint-disable-line react-hooks/exhaustive-deps
  const toConfirm = s.expenses.filter(e => e.isPayment && !e.deletedAt && e.paymentStatus === 'pendiente' && e.shares[s.me] != null);
  return (
    <div className="scroll pad">
      <header className="title-row"><h1>Actividad</h1></header>
      {toConfirm.length > 0 && <p className="note"><b>{plural(toConfirm.length, 'pago espera', 'pagos esperan')}</b> que confirmes que te llegaron.</p>}
      {s.activity.length ? <ul className="list card">{s.activity.map(a => <EvRow key={a.id} a={a} fresh={a.actor !== s.me && a.createdAt > unread.seen} />)}</ul>
        : <Empty icon="bell" title="Todavía no hay movimiento">Aquí verás cada gasto, pago y comentario de tus grupos.</Empty>}
    </div>
  );
}

// Android/Chrome avisa cuando la app se puede instalar; en iPhone hay que hacerlo desde Compartir.
let installEvt: (Event & { prompt: () => Promise<void> }) | null = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e as typeof installEvt; });
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Lo de este aparato: avisos y bloqueo con huella o cara. */
function PhoneExtras() {
  const s = useS(), nav = useNav();
  const [push, setPush] = useState(false), [lock, setLock] = useState(lockOn()), [canLock, setCanLock] = useState(false), [busy, setBusy] = useState(false);
  useEffect(() => { pushOn().then(setPush); lockSupported().then(setCanLock); }, []);
  const toggle = async (on: boolean, yes: () => Promise<void>, no: () => Promise<void> | void, set: (v: boolean) => void, okText: string) => {
    setBusy(true);
    try { if (on) await yes(); else await no(); set(on); buzz(); nav.toast(on ? okText : 'Desactivado'); } catch (e) { nav.toast(errMsg(e)); } finally { setBusy(false); }
  };
  if (!pushSupported() && !canLock) return null;
  return (
    <ul className="list card">
      {pushSupported() && <li><label className="row toggle tap">
        <span className="main"><span className="t">Avisos en este aparato</span><span className="s">Gastos nuevos, pagos por confirmar y comentarios. En iPhone, con la app instalada.</span></span>
        <input type="checkbox" checked={push} disabled={busy} onChange={e => toggle(e.target.checked, enablePush, disablePush, setPush, 'Avisos activados')} />
      </label></li>}
      {canLock && <li><label className="row toggle tap">
        <span className="main"><span className="t">Pedir huella o cara al abrir</span><span className="s">Con Face ID, la huella o Windows Hello de este aparato.</span></span>
        <input type="checkbox" checked={lock} disabled={busy} onChange={e => toggle(e.target.checked, () => enableLock(s.profiles[s.me].name), disableLock, setLock, 'Bloqueo activado')} />
      </label></li>}
    </ul>
  );
}

export function Account({ demo }: { demo: boolean }) {
  const s = useS(), nav = useNav(), me = s.profiles[s.me];
  const [name, setName] = useState(me.name);
  const [payout, setPayout] = useState(me.payout ?? '');
  const [username, setUsername] = useState(me.username ?? '');
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const { pending } = useSync();
  const [sure, setSure] = useState(false);
  const userOk = !username || USERNAME.test(username);
  const dirty = name.trim() !== me.name || payout.trim() !== (me.payout ?? '') || username !== (me.username ?? '');
  const save = async () => {
    setBusy(true);
    try { await run(b => b.updateProfile({ name: name.trim(), payout: payout.trim(), username })); buzz(); nav.toast('Guardado'); }
    catch (e) { nav.toast(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="scroll pad">
      <header className="title-row"><h1>Cuenta</h1></header>
      <section className="card profile"><Av id={s.me} size="lg" /><div><p className="t">{me.name}</p>{me.username && <p className="s">@{me.username}</p>}{me.email && <p className="s">{me.email}</p>}</div></section>
      <section className="card form">
        <label>Tu nombre<input className="field" value={name} maxLength={80} onChange={e => setName(e.target.value)} autoComplete="name" enterKeyHint="next" /></label>
        <label>Usuario<input className="field" value={username} maxLength={20} onChange={e => setUsername(typedUser(e.target.value))} placeholder="Para entrar sin escribir tu correo"
          autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" /></label>
        {!userOk && <p className="err">{USERNAME_RULE}</p>}
        <label>Dónde te pagan
          <textarea className="field" value={payout} maxLength={200} onChange={e => setPayout(e.target.value)} placeholder="Ej.: Banco Popular · ahorro · 123456789 · a nombre de …" /></label>
        <p className="note">Lo ve la gente de tus grupos cuando te va a pagar, con un botón para copiarlo.</p>
        <button className="btn primary tap" disabled={!dirty || !name.trim() || !userOk || busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </section>
      {!standalone() && <section className="card plain-card">
        <h2>Instala {APP.name}</h2>
        {installEvt ? <><p className="s">Ábrela desde tu pantalla de inicio, a pantalla completa y sin barra del navegador.</p>
          <button className="btn tap" onClick={() => installEvt?.prompt()}>Instalar</button></>
          : <p className="s">{isIOS() ? 'En Safari toca Compartir y luego «Agregar a inicio».' : 'En el menú del navegador elige «Instalar app» o «Agregar a la pantalla de inicio».'}</p>}
      </section>}
      <PhoneExtras />
      <dl className="list card prefs">
        <div className="theme"><dt>Tema</dt>
          <dd className="seg" role="radiogroup" aria-label="Tema">
            {([['dark', 'De noche', 'moon'], ['light', 'Claro', 'sun'], ['auto', 'Auto', 'phone']] as const).map(([k, l, ic]) => (
              <button key={k} className="tap" role="radio" aria-checked={theme === k} aria-label={k === 'auto' ? 'Como el teléfono' : l}
                onClick={() => { setTheme(k); saveTheme(k); buzz(); }}><Icon n={ic} sm />{l}</button>))}
          </dd></div>
        <div><dt>Moneda principal</dt><dd>Peso dominicano (RD$)</dd></div>
        <div><dt>Idioma</dt><dd>Español</dd></div>
      </dl>
      <ul className="list card">
        <li><a className="row tap" href={TERMS_URL} target="_blank" rel="noopener"><RowIc n="receipt" /><span className="main"><span className="t">Términos de uso</span></span><Icon n="chevR" className="faint" /></a></li>
        <li><a className="row tap" href={PRIVACY_URL} target="_blank" rel="noopener"><RowIc n="eye" /><span className="main"><span className="t">Política de privacidad</span></span><Icon n="chevR" className="faint" /></a></li>
      </ul>
      <ul className="list card">
        <li><button className="row tap" onClick={() => nav.openSheet(<QrSheet />, 'Tu código para cobrar')}><RowIc n="share" /><span className="main"><span className="t">Tu código para cobrar</span><span className="s">Un QR con tus datos de pago</span></span><Icon n="chevR" className="faint" /></button></li>
        <li><button className="row tap" onClick={() => { download(`${exportName(s)}.csv`, exportCsv(s), 'text/csv;charset=utf-8'); nav.toast('Archivo listo para Excel'); }}><RowIc n="receipt" /><span className="main"><span className="t">Exportar todo a Excel</span><span className="s">Todos tus grupos, en CSV</span></span></button></li>
        <li><button className="row tap" onClick={() => { if (!printReport(exportHtml(s))) nav.toast('El navegador bloqueó la ventana'); }}><RowIc n="copy" /><span className="main"><span className="t">Imprimir o guardar en PDF</span></span></button></li>
      </ul>
      {sure && <p className="split-status bad">Tienes {plural(pending, 'cambio', 'cambios')} sin enviar. Si sales ahora, se pierden.</p>}
      <button className="btn danger block tap" onClick={() => {
        if (pending && !demo && !sure) { setSure(true); return; } // primero avisa: lo pendiente solo está en este teléfono
        run(b => b.signOut()).catch(() => location.reload());
      }}><Icon n="out" sm />{demo ? 'Reiniciar demostración' : sure ? 'Salir igual' : 'Cerrar sesión'}</button>
      <button className="link danger-link tap" onClick={() => nav.openSheet(<DeleteAccountSheet />, 'Borrar mi cuenta', true)}>Borrar mi cuenta</button>
      {demo && <p className="foot">Modo demostración: personas, montos y cuentas son de ejemplo y nada se guarda.</p>}
    </div>
  );
}


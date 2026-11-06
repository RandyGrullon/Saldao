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
import { getLang, LANG_KEY, LANGS, longToday, setLang, tr } from '@saldao/core';

const KIND: Record<string, string> = { casa: 'Casa', viaje: 'Viaje', pareja: 'Pareja', otro: 'Grupo', directo: 'Entre dos' };

export function GroupRow({ g }: { g: Group }) {
  const nav = useNav(), s = useS();
  return (
    <li><button className="row tap" onClick={() => nav.push({ kind: 'group', id: g.id })}>
      <GroupPhoto g={g} />
      <span className="main"><span className="t">{g.name}</span><span className="s">{tr(KIND[g.kind])} · {groupDates(g) || plural(g.members.filter(m => !s.profiles[m]?.fundOf).length, tr("persona"), tr("personas"))}{groupEnded(g) ? tr(" · terminó") : ''}{g.archivedAt ? tr(" · archivado") : ''}</span></span>
      <BalText c={groupBal(s, g.id)} />
    </button></li>
  );
}

function FirstRun() {
  const nav = useNav();
  return (
    <Empty icon="users" title={tr("Empieza con un grupo")}
      action={<button className="btn primary block tap" onClick={() => nav.openSheet(<NewGroupSheet />, tr("Nuevo grupo"))}><Icon n="plus" sm />{tr("Crear grupo")}</button>}>{tr("El apartamento, el viaje, la pareja. Anota los gastos y {0} te dice quién le debe a quién, por qué y desde cuándo.", APP.name)}</Empty>
  );
}

const todayLabel = () => longToday();

export function Home() {
  const s = useS(), nav = useNav();
  const t = myTotals(s);
  const people = friends(s).map(p => ({ p, b: friendBal(s, p).b, i: pendingInfo(s, p) })).sort((a, b) => b.b - a.b);
  const top = people[0]?.b > 0 ? people[0] : null;
  const owe = people.filter(x => x.b < 0).sort((a, b) => a.b - b.b)[0];
  const late = overdue(s), month = monthStats(s);
  return (
    <div className="scroll pad home">
      <header className="title-row"><div><p className="date">{todayLabel()}</p><h1>{tr("Hola, {0}", s.profiles[s.me].name.split(' ')[0])}</h1></div>
        <button className="round tap" onClick={() => nav.setTab('account')} aria-label={tr("Tu cuenta")}><Av id={s.me} size="sm" /></button></header>
      {!visibleGroups(s).length && !people.length ? <FirstRun /> : <>
        <section className="card hero">
          <p className="lbl">{t.net > 0 ? tr("En total te deben") : t.net < 0 ? tr("En total debes") : tr("Estás a mano con todo el mundo")}</p>
          <p className={`big${t.net > 0 ? ' pos' : t.net < 0 ? ' neg' : ''}`}><AnimMoney c={Math.abs(t.net)} sign={t.net > 0} /></p>
          <div className="split2"><div><span className="lbl">{tr("Te deben")}</span><span className="pos"><Money c={t.owed} /></span></div><div><span className="lbl">{tr("Debes")}</span><span className="neg"><Money c={t.owe} /></span></div></div>
          {(top || owe) && <p className="finding-line">
            {top && <><b>{short(s, top.p)}</b>{" "}{tr("es quien más te debe: {0}{1}.", moneyT(top.b), top.i.since ? tr(", sin saldar desde el {0}", fdate(top.i.since)) : '')}{" "}</>}
            {owe && <>{tr("A quien más le debes es a")}{" "}<b>{short(s, owe.p)}</b>: {moneyT(-owe.b)}.</>}
          </p>}
          <div className="actions">
            <button className="btn primary tap" onClick={() => nav.openSheet(<AddExpenseSheet />, tr("Nuevo gasto"), true)}><Icon n="plus" />{tr("Añadir gasto")}</button>
            <button className="btn tap" disabled={!t.owed && !t.owe} onClick={() => nav.openSheet(<MySettleSheet />, tr("Saldar cuentas"))}>{tr("Saldar cuentas")}</button>
          </div>
        </section>
        {late.length > 0 && <section className="card plain-card remind">
          <h2>{tr("Para cobrar")}</h2>
          <ul>{late.slice(0, 3).map(x => (
            <li key={x.p}><Av id={x.p} size="sm" /><span className="main"><span className="t">{tr("{0} te debe {1}", short(s, x.p), moneyT(x.amount))}</span><span className="s">{tr("sin saldar hace {0} días", x.days)}</span></span>
              <button className="btn sm tap" onClick={() => remind(s, x.p, x.amount)}>{tr("Recordar")}</button></li>))}</ul>
        </section>}
        <button className="row card list-link tap" onClick={() => nav.push({ kind: 'summary', id: '' })}>
          <span className="row-ic accent"><Icon n="cal" /></span>
          <span className="main"><span className="t">{tr("Tu {0}", monthName(thisMonth()).split(' ')[0])}</span><span className="s">{tr("Tu parte de lo gastado: {0}", moneyT(month.total))}</span></span>
          <Icon n="chevR" className="faint" />
        </button>
        {people.length > 0 && <>
          <h2 className="sec">{tr("Personas")}{" "}<span className="hint">{tr("toca para ver por qué")}</span></h2>
          <ul className="tiles">{people.map(x => (
            <li key={x.p}><button className={`tile tap${x.b ? '' : ' zero'}`} style={{ '--h': hueOf(s, x.p) ?? 0 } as CSSProperties} onClick={() => nav.push({ kind: 'person', id: x.p })}>
              <Av id={x.p} /><span className="tile-n">{short(s, x.p)}</span>
              <span className="tile-l">{x.b > 0 ? tr("te debe") : x.b < 0 ? tr("le debes") : tr("están a mano")}</span>
              <span className={`tile-v${x.b > 0 ? ' pos' : x.b < 0 ? ' neg' : ''}`}>{x.b ? <Money c={Math.abs(x.b)} sign={x.b > 0} /> : null}</span>
              <span className="tile-s">{x.i.n ? tr("{0} sin saldar · desde {1}", plural(x.i.n, tr("gasto"), tr("gastos")), fdate(x.i.since!)) : tr("todo saldado")}</span>
            </button></li>))}</ul>
        </>}
        {visibleGroups(s).length > 0 && <>
          <h2 className="sec">{tr("Grupos")}{" "}<button className="link tap" onClick={() => nav.setTab('groups')}>{tr("Ver todos")}<Icon n="chevR" sm /></button></h2>
          <ul className="list card">{visibleGroups(s).slice(0, 4).map(g => <GroupRow key={g.id} g={g} />)}</ul>
        </>}
        {s.activity.length > 0 && <>
          <h2 className="sec">{tr("Reciente")}{" "}<button className="link tap" onClick={() => nav.setTab('activity')}>{tr("Actividad")}<Icon n="chevR" sm /></button></h2>
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
      <header className="title-row"><h1>{tr("Grupos")}</h1>
        <span className="bar-actions">
          <button className="round tap" aria-label={tr("Buscar gastos")} onClick={() => nav.push({ kind: 'search', id: '' })}><Icon n="eye" /></button>
          <button className="btn sm soft tap" onClick={() => nav.openSheet(<NewGroupSheet />, tr("Nuevo grupo"))}><Icon n="plus" sm />{tr("Nuevo")}</button>
        </span></header>
      {visibleGroups(s).length ? <ul className="list card">{visibleGroups(s).map(g => <GroupRow key={g.id} g={g} />)}</ul> : <FirstRun />}
      {duo.length > 0 && <>
        <h2 className="sec">{tr("Entre dos")}</h2>
        <ul className="list card">{duo.map(p => {
          const d = s.groups.find(g => g.kind === 'directo' && g.members.includes(p))!;
          return <li key={p}><button className="row tap" onClick={() => nav.push({ kind: 'person', id: p })}><Av id={p} />
            <span className="main"><span className="t">{s.profiles[p].name}</span><span className="s">{tr("Gastos entre ustedes dos")}</span></span>
            <BalText c={friendBal(s, p).by[d.id] || 0} who /></button></li>;
        })}</ul>
      </>}
      {archivedGroups(s).length > 0 && <>
        <h2 className="sec">{tr("Archivados")}{" "}<span className="hint">{tr("sus saldos siguen contando")}</span></h2>
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
  const who = <b>{a.actor === s.me ? tr("Tú") : short(s, a.actor)}</b>;
  const e = a.expenseId ? s.expenses.find(x => x.id === a.expenseId) : undefined;
  const desc = `«${e?.description ?? (a.payload.descripcion as string) ?? tr("un gasto")}»`;
  const g = groupOf(s, a.groupId), where = g && g.kind !== 'directo' ? tr(' en {0}', g.name) : '';
  const me = a.actor === s.me;
  switch (a.verb) {
    case 'grupo_creado': return <>{who}{" "}{tr("{0} el grupo{1}", me ? tr("creaste") : tr("creó"), where)}</>;
    case 'miembro_agregado': return <>{who}{" "}{tr("{0} a {1}{2}", me ? tr("agregaste") : tr("agregó"), String(a.payload.nombre ?? 'alguien'), where)}</>;
    case 'se_unio': return <>{who} {me ? tr("te uniste") : tr("se unió")}{where}</>;
    case 'gasto_creado': return <>{who} {me ? tr("añadiste") : tr("añadió")} {desc}{where}</>;
    case 'gasto_editado': {
      const an = a.payload.antes as { monto?: number; moneda?: string } | undefined, de = a.payload.despues as { monto?: number; moneda?: string } | undefined;
      const changed = an && de && an.monto !== de.monto ? tr(": el monto pasó de {0} a {1}", moneyT(Number(an.monto), an.moneda), moneyT(Number(de.monto), de.moneda)) : '';
      return <>{who} {me ? tr("editaste") : tr("editó")} {desc}{where}{changed}</>;
    }
    case 'gasto_borrado': return <>{who} {me ? tr("borraste") : tr("borró")} {desc}{where}</>;
    case 'gasto_restaurado': return <>{who} {me ? tr("restauraste") : tr("restauró")} {desc}{where}</>;
    case 'pago_registrado': return e ? <>{payText(s, e)} {moneyT(e.amount)}{where}</> : <>{who}{" "}{tr("registró un pago")}</>;
    case 'pago_confirmado': return <>{who}{" "}{tr("{0} que le llegó el pago{1}", me ? tr("confirmaste") : tr("confirmó"), where)}</>;
    case 'comentario': return <>{who}{" "}{tr("{0} en {1}: “{2}”", me ? tr("comentaste") : tr("comentó"), desc, String(a.payload.texto ?? ''))}</>;
    case 'grupo_editado': return <>{who} {me ? tr("cambiaste") : tr("cambió")} {a.payload.archived === true ? tr("el grupo al archivo") : a.payload.name ? tr("el nombre a «{0}»", String(a.payload.name)) : a.payload.budget !== undefined ? tr("el presupuesto") : a.payload.simplify !== undefined ? tr("cómo se saldan las deudas") : a.payload.starts_on !== undefined || a.payload.ends_on !== undefined ? tr("las fechas") : tr("el grupo")}{where}</>;
    case 'salio': return <>{who}{" "}{tr("{0} del grupo{1}", me ? tr("saliste") : tr("salió"), where)}</>;
    case 'fondo_creado': return <>{who}{" "}{tr("{0} el fondo común{1}", me ? tr("creaste") : tr("creó"), where)}</>;
    case 'miembro_quitado': return <>{who}{" "}{tr("{0} a {1} del grupo{2}", me ? tr("quitaste") : tr("quitó"), String(a.payload.nombre ?? 'alguien'), where)}</>;
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
      <span className="main"><span className="t wrap">{evText(s, a)}</span><span className="s">{ago(a.createdAt)}{fresh && <span className="pill">{tr("nuevo")}</span>}</span></span>
      {pendingForMe ? <button className="btn sm primary tap" onClick={ev => { ev.stopPropagation(); act(b => b.confirmPayment(e!.id), tr("Pago confirmado")); }}>{tr("Confirmar")}</button>
        : restorable ? <button className="btn sm tap" onClick={ev => { ev.stopPropagation(); act(b => b.restoreExpense(e!.id), tr("Gasto restaurado")); }}>{tr("Restaurar")}</button>
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
      <header className="title-row"><h1>{tr("Actividad")}</h1></header>
      {toConfirm.length > 0 && <p className="note"><b>{plural(toConfirm.length, tr("pago espera"), tr("pagos esperan"))}</b>{" "}{tr("que confirmes que te llegaron.")}</p>}
      {s.activity.length ? <ul className="list card">{s.activity.map(a => <EvRow key={a.id} a={a} fresh={a.actor !== s.me && a.createdAt > unread.seen} />)}</ul>
        : <Empty icon="bell" title={tr("Todavía no hay movimiento")}>{tr("Aquí verás cada gasto, pago y comentario de tus grupos.")}</Empty>}
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
    try { if (on) await yes(); else await no(); set(on); buzz(); nav.toast(on ? okText : tr("Desactivado")); } catch (e) { nav.toast(errMsg(e)); } finally { setBusy(false); }
  };
  if (!pushSupported() && !canLock) return null;
  return (
    <ul className="list card">
      {pushSupported() && <li><label className="row toggle tap">
        <span className="main"><span className="t">{tr("Avisos en este aparato")}</span><span className="s">{tr("Gastos nuevos, pagos por confirmar y comentarios. En iPhone, con la app instalada.")}</span></span>
        <input type="checkbox" checked={push} disabled={busy} onChange={e => toggle(e.target.checked, enablePush, disablePush, setPush, 'Avisos activados')} />
      </label></li>}
      {canLock && <li><label className="row toggle tap">
        <span className="main"><span className="t">{tr("Pedir huella o cara al abrir")}</span><span className="s">{tr("Con Face ID, la huella o Windows Hello de este aparato.")}</span></span>
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
    try { await run(b => b.updateProfile({ name: name.trim(), payout: payout.trim(), username })); buzz(); nav.toast(tr("Guardado")); }
    catch (e) { nav.toast(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <div className="scroll pad">
      <header className="title-row"><h1>{tr("Cuenta")}</h1></header>
      <section className="card profile"><Av id={s.me} size="lg" /><div><p className="t">{me.name}</p>{me.username && <p className="s">@{me.username}</p>}{me.email && <p className="s">{me.email}</p>}</div></section>
      <section className="card form">
        <label>{tr("Tu nombre")}<input className="field" value={name} maxLength={80} onChange={e => setName(e.target.value)} autoComplete="name" enterKeyHint="next" /></label>
        <label>{tr("Usuario")}<input className="field" value={username} maxLength={20} onChange={e => setUsername(typedUser(e.target.value))} placeholder={tr("Para entrar sin escribir tu correo")}
          autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" /></label>
        {!userOk && <p className="err">{tr(USERNAME_RULE)}</p>}
        <label>{tr("Dónde te pagan")}<textarea className="field" value={payout} maxLength={200} onChange={e => setPayout(e.target.value)} placeholder={tr("Ej.: Banco Popular · ahorro · 123456789 · a nombre de …")} /></label>
        <p className="note">{tr("Lo ve la gente de tus grupos cuando te va a pagar, con un botón para copiarlo.")}</p>
        <button className="btn primary tap" disabled={!dirty || !name.trim() || !userOk || busy} onClick={save}>{busy ? tr("Guardando…") : tr("Guardar")}</button>
      </section>
      {!standalone() && <section className="card plain-card">
        <h2>{tr("Instala {0}", APP.name)}</h2>
        {installEvt ? <><p className="s">{tr("Ábrela desde tu pantalla de inicio, a pantalla completa y sin barra del navegador.")}</p>
          <button className="btn tap" onClick={() => installEvt?.prompt()}>{tr("Instalar")}</button></>
          : <p className="s">{isIOS() ? tr("En Safari toca Compartir y luego «Agregar a inicio».") : tr("En el menú del navegador elige «Instalar app» o «Agregar a la pantalla de inicio».")}</p>}
      </section>}
      <PhoneExtras />
      <dl className="list card prefs">
        <div className="theme"><dt>{tr("Tema")}</dt>
          <dd className="seg" role="radiogroup" aria-label={tr("Tema")}>
            {([['dark', tr("De noche"), 'moon'], ['light', tr("Claro"), 'sun'], ['auto', tr("Auto"), 'phone']] as const).map(([k, l, ic]) => (
              <button key={k} className="tap" role="radio" aria-checked={theme === k} aria-label={k === 'auto' ? tr("Como el teléfono") : l}
                onClick={() => { setTheme(k); saveTheme(k); buzz(); }}><Icon n={ic} sm />{l}</button>))}
          </dd></div>
        <div><dt>{tr("Moneda principal")}</dt><dd>{tr("Peso dominicano (RD$)")}</dd></div>
        <div className="theme"><dt>{tr("Idioma")}</dt>
          <dd className="seg" role="radiogroup" aria-label={tr("Idioma")}>
            {LANGS.map(([k, l]) => (
              <button key={k} className="tap" role="radio" aria-checked={getLang() === k} lang={k}
                onClick={() => { if (k === getLang()) return; try { localStorage.setItem(LANG_KEY, k); } catch { /* sin almacenamiento: solo esta vez */ } setLang(k); location.reload(); }}>{l}</button>))}
          </dd></div>
      </dl>
      <ul className="list card">
        <li><a className="row tap" href={TERMS_URL} target="_blank" rel="noopener"><RowIc n="receipt" /><span className="main"><span className="t">{tr("Términos de uso")}</span></span><Icon n="chevR" className="faint" /></a></li>
        <li><a className="row tap" href={PRIVACY_URL} target="_blank" rel="noopener"><RowIc n="eye" /><span className="main"><span className="t">{tr("Política de privacidad")}</span></span><Icon n="chevR" className="faint" /></a></li>
      </ul>
      <ul className="list card">
        <li><button className="row tap" onClick={() => nav.openSheet(<QrSheet />, tr("Tu código para cobrar"))}><RowIc n="share" /><span className="main"><span className="t">{tr("Tu código para cobrar")}</span><span className="s">{tr("Un QR con tus datos de pago")}</span></span><Icon n="chevR" className="faint" /></button></li>
        <li><button className="row tap" onClick={() => { download(`${exportName(s)}.csv`, exportCsv(s), 'text/csv;charset=utf-8'); nav.toast(tr("Archivo listo para Excel")); }}><RowIc n="receipt" /><span className="main"><span className="t">{tr("Exportar todo a Excel")}</span><span className="s">{tr("Todos tus grupos, en CSV")}</span></span></button></li>
        <li><button className="row tap" onClick={() => { if (!printReport(exportHtml(s))) nav.toast(tr("El navegador bloqueó la ventana")); }}><RowIc n="copy" /><span className="main"><span className="t">{tr("Imprimir o guardar en PDF")}</span></span></button></li>
      </ul>
      {sure && <p className="split-status bad">{tr("Tienes {0} sin enviar. Si sales ahora, se pierden.", plural(pending, tr("cambio"), tr("cambios")))}</p>}
      <button className="btn danger block tap" onClick={() => {
        if (pending && !demo && !sure) { setSure(true); return; } // primero avisa: lo pendiente solo está en este teléfono
        run(b => b.signOut()).catch(() => location.reload());
      }}><Icon n="out" sm />{demo ? tr("Reiniciar demostración") : sure ? tr("Salir igual") : tr("Cerrar sesión")}</button>
      <button className="link danger-link tap" onClick={() => nav.openSheet(<DeleteAccountSheet />, tr("Borrar mi cuenta"), true)}>{tr("Borrar mi cuenta")}</button>
      {demo && <p className="foot">{tr("Modo demostración: personas, montos y cuentas son de ejemplo y nada se guarda.")}</p>}
    </div>
  );
}


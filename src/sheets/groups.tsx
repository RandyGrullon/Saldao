import { useEffect, useState } from 'react';
import { friends, getBackend, groupOf, inviteLink, run, short, type GroupKind, type Id, type InvitePreview } from '@saldao/core';
import { clearInvite } from '../lib/invite';
import { Icon } from '../ui/icons';
import { Av, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';
import { tr } from '@saldao/core';

const KINDS: [GroupKind, string][] = [['casa', 'Casa'], ['viaje', 'Viaje'], ['pareja', 'Pareja'], ['otro', 'Otro']];

export function NewGroupSheet() {
  const s = useS(), nav = useNav();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('viaje');
  const [picked, setPicked] = useState<Id[]>([]);
  const known = friends(s).filter(p => !s.profiles[p].deletedAt);
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const addDraft = () => { const n = draft.trim(); if (n) { setNewPeople(p => [...p, n]); setDraft(''); buzz(); } };
  const create = async () => {
    setBusy(true);
    try {
      let g = '';
      await run(async b => {
        g = await b.createGroup(name.trim(), kind);
        if (from || to) await b.updateGroup(g, { startsOn: from || null, endsOn: to || null });
        for (const p of picked) await b.addMember(g, p);
        for (const n of newPeople) await b.addPlaceholder(g, n);
      });
      buzz(); nav.closeSheet(); nav.push({ kind: 'group', id: g });
      nav.toast(tr("Grupo creado. Invita a los demás con el enlace."));
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };
  return (
    <>
      <SheetHead title={tr("Nuevo grupo")} right={<button className="link strong tap" disabled={!name.trim() || busy} onClick={create}>{tr("Crear")}</button>} />
      <div className="scroll sheet-scroll pad">
        <input className="field" placeholder={tr("Nombre del grupo")} value={name} onChange={e => setName(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label={tr("Nombre del grupo")} maxLength={60} />
        <h3>{tr("Tipo")}</h3>
        <div className="seg" role="radiogroup" aria-label={tr("Tipo de grupo")}>
          {KINDS.map(([k, l]) => <button key={k} className="tap" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{tr(l)}</button>)}
        </div>
        <h3>{tr("Fechas, si es de fecha a fecha (opcional)")}</h3>
        <div className="chips">
          <label className="chip"><Icon n="cal" sm />{tr("Desde")}<input type="date" value={from} onChange={e => { setFrom(e.target.value); if (to && e.target.value > to) setTo(''); }} aria-label={tr("Desde")} /></label>
          <label className="chip"><Icon n="cal" sm />{tr("Hasta")}<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label={tr("Hasta")} /></label>
        </div>
        {(from || to) && <p className="note">{tr("Un viaje o un evento: al terminar, el grupo te propone saldar y archivarlo.")}</p>}
        {known.length > 0 && <>
          <h3>{tr("Personas de tus otros grupos")}</h3>
          <div className="chips">{known.map(p => (
            <button key={p} className="chip person tap" role="checkbox" aria-checked={picked.includes(p)}
              onClick={() => { buzz(); setPicked(x => (x.includes(p) ? x.filter(y => y !== p) : [...x, p])); }}><Av id={p} size="xs" />{short(s, p)}</button>))}</div>
        </>}
        <h3>{tr("Alguien que todavía no usa Saldao")}</h3>
        <div className="composer">
          <input placeholder={tr("Nombre")} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDraft()} enterKeyHint="done" autoComplete="off" aria-label={tr("Nombre de la persona")} />
          <button className="icon-btn tap" aria-label={tr("Agregar persona")} onClick={addDraft}><Icon n="plus" /></button>
        </div>
        {newPeople.length > 0 && <div className="chips">{newPeople.map((n, i) => (
          <button key={i} className="chip tap" aria-label={tr("Quitar a {0}", n)} onClick={() => setNewPeople(p => p.filter((_, j) => j !== i))}>{n} ×</button>))}</div>}
        <p className="note">{tr("Puedes cargarle gastos desde ya. Cuando entre con el enlace de invitación, reclama su lugar y ve todo su historial.")}</p>
      </div>
    </>
  );
}

export function InviteSheet({ groupId }: { groupId: Id }) {
  const s = useS(), nav = useNav(), g = groupOf(s, groupId);
  const [draft, setDraft] = useState('');
  if (!g) return null;
  const link = inviteLink(location.origin, g.inviteToken);
  const others = friends(s).filter(p => !g.members.includes(p) && !s.profiles[p].deletedAt);
  const share = async () => {
    const text = tr("Únete a «{0}» en Saldao para llevar las cuentas claras:", g.name);
    if (navigator.share) { try { await navigator.share({ title: g.name, text, url: link }); } catch { /* cancelado */ } return; }
    navigator.clipboard.writeText(`${text} ${link}`).then(() => nav.toast(tr("Enlace copiado")), () => nav.toast(tr("No se pudo copiar")));
  };
  const add = async (fn: () => Promise<unknown>, text: string) => {
    try { await run(() => fn().then(() => undefined)); buzz(); nav.toast(text); } catch (e) { nav.toast(errMsg(e)); }
  };
  return (
    <>
      <SheetHead title={tr("Invitar")} left={<button className="link tap" onClick={nav.closeSheet}>{tr("Listo")}</button>} />
      <div className="scroll sheet-scroll pad">
        <section className="card plain-card">
          <h2>{tr("Enlace de {0}", g.name)}</h2>
          <p className="s" style={{ userSelect: 'text', wordBreak: 'break-all' }}>{link}</p>
          <div className="actions">
            <button className="btn primary tap" onClick={share}><Icon n="share" sm />{tr("Compartir")}</button>
            <button className="btn tap" onClick={() => navigator.clipboard.writeText(link).then(() => nav.toast(tr("Enlace copiado")), () => nav.toast(tr("No se pudo copiar")))}><Icon n="link" sm />{tr("Copiar")}</button>
          </div>
        </section>
        {others.length > 0 && <>
          <h3>{tr("Agregar de tus otros grupos")}</h3>
          <div className="chips">{others.map(p => (
            <button key={p} className="chip person tap" onClick={() => add(() => getBackend()!.addMember(g.id, p), `${short(s, p)} ya está en ${g.name}`)}>
              <Av id={p} size="xs" />{short(s, p)} <Icon n="plus" sm /></button>))}</div>
        </>}
        <h3>{tr("Alguien que todavía no usa Saldao")}</h3>
        <div className="composer">
          <input placeholder={tr("Nombre")} value={draft} onChange={e => setDraft(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label={tr("Nombre de la persona")} />
          <button className="icon-btn tap" aria-label={tr("Agregar persona")} disabled={!draft.trim()}
            onClick={() => { const n = draft.trim(); setDraft(''); add(() => getBackend()!.addPlaceholder(g.id, n), `${n} agregado. Mándale el enlace para que reclame su lugar.`); }}><Icon n="plus" /></button>
        </div>
      </div>
    </>
  );
}

export function JoinSheet({ token }: { token: string }) {
  const nav = useNav();
  const [p, setP] = useState<InvitePreview | null | undefined>(undefined);
  const [as, setAs] = useState<Id | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getBackend()?.invitePreview(token).then(setP, () => setP(null)); }, [token]);
  const join = async () => {
    setBusy(true);
    try {
      let g = '';
      await run(async b => { g = await b.joinGroup(token, as); });
      clearInvite(); buzz(); nav.closeSheet(); nav.push({ kind: 'group', id: g });
      nav.toast(tr("Ya estás en {0}", p!.name));
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };
  return (
    <>
      <SheetHead title={tr("Invitación")} left={<button className="link tap" onClick={() => { clearInvite(); nav.closeSheet(); }}>{tr("Ahora no")}</button>} />
      <div className="scroll sheet-scroll pad">
        {p === undefined ? <p className="note center">{tr("Buscando el grupo…")}</p>
          : p === null ? <p className="finding">{tr("Esta invitación no es válida o ya expiró. Pide un enlace nuevo.")}</p> : <>
            <p className="finding">{tr("Te invitaron a")}{" "}<strong>{p.name}</strong> ({p.members} {p.members === 1 ? tr("persona") : tr("personas")}).</p>
            {p.placeholders.length > 0 && <>
              <h3>{tr("¿Ya te habían agregado con otro nombre?")}</h3>
              <p className="note">{tr("Elige tu nombre y todo lo que te cargaron pasa a tu cuenta.")}</p>
              <div className="chips">
                {p.placeholders.map(x => <button key={x.id} className="chip tap" role="radio" aria-checked={as === x.id} onClick={() => setAs(a => (a === x.id ? null : x.id))}>{x.name}</button>)}
              </div>
            </>}
            <button className="btn primary block tap" disabled={busy} onClick={join}>{busy ? tr("Uniéndote…") : as ? tr("Unirme como {0}", p.placeholders.find(x => x.id === as)?.name) : tr("Unirme al grupo")}</button>
          </>}
      </div>
    </>
  );
}

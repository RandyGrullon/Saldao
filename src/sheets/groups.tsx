import { useEffect, useState } from 'react';
import type { Id } from '../lib/domain';
import { friends, groupOf, short } from '../data/derive';
import { run } from '../data/store';
import type { GroupKind, InvitePreview } from '../data/types';
import { getBackend } from '../data/store';
import { clearInvite } from '../lib/invite';
import { Icon } from '../ui/icons';
import { Av, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';

const KINDS: [GroupKind, string][] = [['casa', 'Casa'], ['viaje', 'Viaje'], ['pareja', 'Pareja'], ['otro', 'Otro']];
export const inviteLink = (token: string) => `${location.origin}/?unirse=${token}`;

export function NewGroupSheet() {
  const s = useS(), nav = useNav();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<GroupKind>('viaje');
  const [picked, setPicked] = useState<Id[]>([]);
  const [newPeople, setNewPeople] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const addDraft = () => { const n = draft.trim(); if (n) { setNewPeople(p => [...p, n]); setDraft(''); buzz(); } };
  const create = async () => {
    setBusy(true);
    try {
      let g = '';
      await run(async b => {
        g = await b.createGroup(name.trim(), kind);
        for (const p of picked) await b.addMember(g, p);
        for (const n of newPeople) await b.addPlaceholder(g, n);
      });
      buzz(); nav.closeSheet(); nav.push({ kind: 'group', id: g });
      nav.toast('Grupo creado. Invita a los demás con el enlace.');
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };
  return (
    <>
      <SheetHead title="Nuevo grupo" right={<button className="link strong tap" disabled={!name.trim() || busy} onClick={create}>Crear</button>} />
      <div className="scroll sheet-scroll pad">
        <input className="field" placeholder="Nombre del grupo" value={name} onChange={e => setName(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label="Nombre del grupo" maxLength={60} />
        <h3>Tipo</h3>
        <div className="seg" role="radiogroup" aria-label="Tipo de grupo">
          {KINDS.map(([k, l]) => <button key={k} className="tap" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>{l}</button>)}
        </div>
        {friends(s).length > 0 && <>
          <h3>Personas de tus otros grupos</h3>
          <div className="chips">{friends(s).map(p => (
            <button key={p} className="chip person tap" role="checkbox" aria-checked={picked.includes(p)}
              onClick={() => { buzz(); setPicked(x => (x.includes(p) ? x.filter(y => y !== p) : [...x, p])); }}><Av id={p} size="xs" />{short(s, p)}</button>))}</div>
        </>}
        <h3>Alguien que todavía no usa Saldao</h3>
        <div className="composer">
          <input placeholder="Nombre" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && addDraft()} enterKeyHint="done" autoComplete="off" aria-label="Nombre de la persona" />
          <button className="icon-btn tap" aria-label="Agregar persona" onClick={addDraft}><Icon n="plus" /></button>
        </div>
        {newPeople.length > 0 && <div className="chips">{newPeople.map((n, i) => (
          <button key={i} className="chip tap" aria-label={`Quitar a ${n}`} onClick={() => setNewPeople(p => p.filter((_, j) => j !== i))}>{n} ×</button>))}</div>}
        <p className="note">Puedes cargarle gastos desde ya. Cuando entre con el enlace de invitación, reclama su lugar y ve todo su historial.</p>
      </div>
    </>
  );
}

export function InviteSheet({ groupId }: { groupId: Id }) {
  const s = useS(), nav = useNav(), g = groupOf(s, groupId);
  const [draft, setDraft] = useState('');
  if (!g) return null;
  const link = inviteLink(g.inviteToken);
  const others = friends(s).filter(p => !g.members.includes(p));
  const share = async () => {
    const text = `Únete a «${g.name}» en Saldao para llevar las cuentas claras:`;
    if (navigator.share) { try { await navigator.share({ title: g.name, text, url: link }); } catch { /* cancelado */ } return; }
    navigator.clipboard.writeText(`${text} ${link}`).then(() => nav.toast('Enlace copiado'), () => nav.toast('No se pudo copiar'));
  };
  const add = async (fn: () => Promise<unknown>, text: string) => {
    try { await run(() => fn().then(() => undefined)); buzz(); nav.toast(text); } catch (e) { nav.toast(errMsg(e)); }
  };
  return (
    <>
      <SheetHead title="Invitar" left={<button className="link tap" onClick={nav.closeSheet}>Listo</button>} />
      <div className="scroll sheet-scroll pad">
        <section className="card plain-card">
          <h2>Enlace de {g.name}</h2>
          <p className="s" style={{ userSelect: 'text', wordBreak: 'break-all' }}>{link}</p>
          <div className="actions">
            <button className="btn primary tap" onClick={share}><Icon n="share" sm />Compartir</button>
            <button className="btn tap" onClick={() => navigator.clipboard.writeText(link).then(() => nav.toast('Enlace copiado'), () => nav.toast('No se pudo copiar'))}><Icon n="link" sm />Copiar</button>
          </div>
        </section>
        {others.length > 0 && <>
          <h3>Agregar de tus otros grupos</h3>
          <div className="chips">{others.map(p => (
            <button key={p} className="chip person tap" onClick={() => add(() => getBackend()!.addMember(g.id, p), `${short(s, p)} ya está en ${g.name}`)}>
              <Av id={p} size="xs" />{short(s, p)} <Icon n="plus" sm /></button>))}</div>
        </>}
        <h3>Alguien que todavía no usa Saldao</h3>
        <div className="composer">
          <input placeholder="Nombre" value={draft} onChange={e => setDraft(e.target.value)} enterKeyHint="done" autoComplete="off" aria-label="Nombre de la persona" />
          <button className="icon-btn tap" aria-label="Agregar persona" disabled={!draft.trim()}
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
      nav.toast(`Ya estás en ${p!.name}`);
    } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };
  return (
    <>
      <SheetHead title="Invitación" left={<button className="link tap" onClick={() => { clearInvite(); nav.closeSheet(); }}>Ahora no</button>} />
      <div className="scroll sheet-scroll pad">
        {p === undefined ? <p className="note center">Buscando el grupo…</p>
          : p === null ? <p className="finding">Esta invitación no es válida o ya expiró. Pide un enlace nuevo.</p> : <>
            <p className="finding">Te invitaron a <strong>{p.name}</strong> ({p.members} {p.members === 1 ? 'persona' : 'personas'}).</p>
            {p.placeholders.length > 0 && <>
              <h3>¿Ya te habían agregado con otro nombre?</h3>
              <p className="note">Elige tu nombre y todo lo que te cargaron pasa a tu cuenta.</p>
              <div className="chips">
                {p.placeholders.map(x => <button key={x.id} className="chip tap" role="radio" aria-checked={as === x.id} onClick={() => setAs(a => (a === x.id ? null : x.id))}>{x.name}</button>)}
              </div>
            </>}
            <button className="btn primary block tap" disabled={busy} onClick={join}>{busy ? 'Uniéndote…' : as ? `Unirme como ${p.placeholders.find(x => x.id === as)?.name}` : 'Unirme al grupo'}</button>
          </>}
      </div>
    </>
  );
}

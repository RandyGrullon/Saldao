import { useEffect, useState } from 'react';
import {
  debts, exportCsv, exportHtml, exportName, fundOf, getBackend, groupOf, groupPhotoPath, moneyT, parseMoney, run, short, type Id,
} from '@saldao/core';
import { pickPhoto, readPhoto } from '../lib/photo';
import { Icon } from '../ui/icons';
import { Av, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';
import { GroupPhoto } from '../ui/photo';
import { tr } from '@saldao/core';

/** Bajar un archivo (CSV) o abrir el informe para imprimir o guardar en PDF. */
export function download(name: string, text: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function printReport(html: string) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}
export const debtLines = (s: ReturnType<typeof useS>, g: Id) => debts(s, g).map(t => tr("{0} le debe a {1} {2}", short(s, t.from), short(s, t.to), moneyT(t.amount)));

export function GroupSettingsSheet({ groupId }: { groupId: Id }) {
  const s = useS(), nav = useNav(), g = groupOf(s, groupId);
  const admin = g?.roles[s.me] === 'admin';
  const [name, setName] = useState(g?.name ?? '');
  const [budget, setBudget] = useState(g?.budget ? (g.budget / 100).toFixed(0) : '');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [from, setFrom] = useState(g?.startsOn ?? ''), [to, setTo] = useState(g?.endsOn ?? '');
  const [removing, setRemoving] = useState<Id | null>(null), [renaming, setRenaming] = useState<{ id: Id; name: string } | null>(null);
  useEffect(() => { if (!g) nav.closeSheet(); }, [g, nav]);
  if (!g) return null;
  const fund = fundOf(s, groupId);
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await run(() => fn().then(() => undefined)); buzz(); if (ok) nav.toast(ok); return true; }
    catch (e) { nav.toast(errMsg(e)); return false; } finally { setBusy(false); }
  };
  const b = getBackend()!;
  const photo = async () => {
    const f = await pickPhoto(false); if (!f) return;
    const p = await readPhoto(f, 800), path = groupPhotoPath(groupId);
    await act(async () => { await b.uploadPhoto(path, { data: p.blob, type: 'image/jpeg', uri: p.uri }); await b.updateGroup(groupId, { photoPath: path }); }, tr("Foto del grupo cambiada"));
  };
  const members = g.members.filter(m => !s.profiles[m]?.fundOf);
  return (
    <>
      <SheetHead title={tr("Ajustes del grupo")} left={<button className="link tap" onClick={nav.closeSheet}>{tr("Listo")}</button>} />
      <div className="scroll sheet-scroll pad">
        <section className="card form">
          <div className="group-head"><GroupPhoto g={g} size={56} />
            {admin && <button className="btn sm tap" disabled={busy} onClick={photo}><Icon n="edit" sm />{g.photoPath ? tr("Cambiar foto") : tr("Poner foto")}</button>}
            {admin && g.photoPath && <button className="link tap" disabled={busy} onClick={() => act(() => b.updateGroup(groupId, { photoPath: null }), tr("Foto quitada"))}>{tr("Quitar")}</button>}</div>
          <label>{tr("Nombre")}<input className="field" value={name} maxLength={60} disabled={!admin} onChange={e => setName(e.target.value)} /></label>
          {admin && name.trim() && name.trim() !== g.name && <button className="btn primary tap" disabled={busy} onClick={() => act(() => b.updateGroup(groupId, { name: name.trim() }), tr("Nombre cambiado"))}>{tr("Guardar nombre")}</button>}
          <label>{tr("Presupuesto del mes")}<span className="num-in wide"><span>{tr("RD$")}</span><input inputMode="decimal" placeholder={tr("Sin presupuesto")} value={budget} disabled={!admin} onChange={e => setBudget(e.target.value)} aria-label={tr("Presupuesto del mes")} /></span></label>
          <p className="note">{tr("Lo que el grupo piensa gastar al mes (sin contar pagos). Avisa al llegar al 80 %.")}</p>
          <label>{tr("Fechas (si es de fecha a fecha)")}<span className="chips">
              <span className="chip"><Icon n="cal" sm />{tr("Desde")}<input type="date" value={from} disabled={!admin} onChange={e => { setFrom(e.target.value); if (to && e.target.value > to) setTo(''); }} aria-label={tr("Desde")} /></span>
              <span className="chip"><Icon n="cal" sm />{tr("Hasta")}<input type="date" value={to} min={from || undefined} disabled={!admin} onChange={e => setTo(e.target.value)} aria-label={tr("Hasta")} /></span>
            </span></label>
          {admin && (from !== (g.startsOn ?? '') || to !== (g.endsOn ?? '')) && (
            <button className="btn tap" disabled={busy} onClick={() => act(() => b.updateGroup(groupId, { startsOn: from || null, endsOn: to || null }), from || to ? tr("Fechas guardadas") : tr("Fechas quitadas"))}>
              {from || to ? tr("Guardar fechas") : tr("Quitar fechas")}</button>)}
          {admin && String(g.budget ? g.budget / 100 : '') !== budget.trim() && (
            <button className="btn tap" disabled={busy} onClick={() => act(() => b.updateGroup(groupId, { budget: parseMoney(budget) || null }), budget.trim() ? tr("Presupuesto guardado") : tr("Presupuesto quitado"))}>
              {budget.trim() ? tr("Guardar presupuesto") : tr("Quitar presupuesto")}</button>)}
        </section>
        <ul className="list card">
          <li><label className="row toggle tap">
            <span className="main"><span className="t">{tr("Simplificar deudas")}</span><span className="s">{tr("El grupo salda con el menor número de pagos, aunque a veces le pagues a alguien con quien no tuviste gastos.")}</span></span>
            <input type="checkbox" checked={g.simplify} disabled={!admin || busy} onChange={e => act(() => b.updateGroup(groupId, { simplify: e.target.checked }), e.target.checked ? tr("Deudas simplificadas") : tr("Deudas de a pares"))} />
          </label></li>
          <li>{fund
            ? <div className="row static"><span className="row-ic accent"><Icon n="receipt" /></span><span className="main"><span className="t">{tr("Fondo común")}</span><span className="s">{tr("Ya existe: aporta o paga desde la pantalla del grupo.")}</span></span></div>
            : <button className="row tap" disabled={busy} onClick={() => act(() => b.createFund(groupId), tr("Fondo común creado"))}>
              <span className="row-ic accent"><Icon n="plus" /></span><span className="main"><span className="t">{tr("Crear fondo común")}</span><span className="s">{tr("Para un viaje: cada uno aporta al principio y los gastos salen de ahí.")}</span></span></button>}</li>
        </ul>
        <h3>{tr("Personas")}</h3>
        <ul className="list card">{members.map(m => {
          const p = s.profiles[m], noAccount = !p?.userId && !p?.deletedAt;
          return (
            <li key={m}><div className="row static member"><Av id={m} />
              {renaming?.id === m
                ? <form className="composer" style={{ flex: 1 }} onSubmit={async ev => { ev.preventDefault(); if (await act(() => b.renamePlaceholder(groupId, m, renaming.name.trim()), tr("Nombre cambiado"))) setRenaming(null); }}>
                    <input value={renaming.name} autoFocus maxLength={80} onChange={e => setRenaming({ id: m, name: e.target.value })} aria-label={tr("Nombre nuevo")} />
                    <button className="icon-btn tap" aria-label={tr("Guardar nombre")} disabled={!renaming.name.trim() || busy}><Icon n="check" /></button></form>
                : <span className="main"><span className="t">{m === s.me ? tr("Tú") : p?.name}</span>
                    <span className="s">{g.roles[m] === 'admin' ? tr("Admin") : p?.deletedAt ? tr("Borró su cuenta") : p?.userId ? tr("Miembro") : tr("Sin cuenta todavía")}</span></span>}
              {admin && m !== s.me && renaming?.id !== m && <span className="member-acts">
                {p?.userId && <button className="btn sm tap" disabled={busy} onClick={() => act(() => b.setMemberRole(groupId, m, g.roles[m] === 'admin' ? 'miembro' : 'admin'), g.roles[m] === 'admin' ? tr("Ya no es admin") : tr("Ahora es admin"))}>
                  {g.roles[m] === 'admin' ? tr("Quitar admin") : tr("Hacer admin")}</button>}
                {noAccount && <button className="btn sm tap" disabled={busy} onClick={() => setRenaming({ id: m, name: p?.name ?? '' })}><Icon n="edit" sm />{tr("Nombre")}</button>}
                <button className="btn sm danger tap" disabled={busy} aria-label={tr("Quitar a {0} del grupo", p?.name)} onClick={async () => {
                  if (removing !== m) { setRemoving(m); return; }
                  if (await act(() => b.removeMember(groupId, m), tr("{0} ya no está en el grupo", p?.name ?? tr("La persona")))) setRemoving(null);
                }}>{removing === m ? tr("¿Quitar?") : tr("Quitar")}</button>
              </span>}
            </div></li>
          );
        })}</ul>
        {removing && <p className="note">{tr("Toca «¿Quitar?» otra vez para confirmar. Solo se puede con sus cuentas saldadas en el grupo; lo que compartió se queda.")}</p>}
        <h3>{tr("Exportar")}</h3>
        <div className="actions">
          <button className="btn tap" onClick={() => { download(`${exportName(s, groupId)}.csv`, exportCsv(s, groupId), 'text/csv;charset=utf-8'); nav.toast(tr("Archivo listo para Excel")); }}><Icon n="receipt" sm />{tr("Excel (CSV)")}</button>
          <button className="btn tap" onClick={() => { if (!printReport(exportHtml(s, groupId, debtLines(s, groupId)))) nav.toast(tr("El navegador bloqueó la ventana")); }}><Icon n="share" sm />{tr("Imprimir o PDF")}</button>
        </div>
        {admin && <button className="btn block tap" disabled={busy} onClick={async () => { if (await act(() => b.updateGroup(groupId, { archived: !g.archivedAt }), g.archivedAt ? tr("Grupo de vuelta en la lista") : tr("Grupo archivado"))) nav.closeSheet(); }}>
          {g.archivedAt ? tr("Sacar del archivo") : tr("Archivar el grupo")}</button>}
        {leaving && <p className="split-status bad">{tr("Solo puedes salir con tus cuentas saldadas en este grupo. Lo que compartiste se queda.")}</p>}
        <button className="btn danger block tap" disabled={busy} onClick={async () => {
          if (!leaving) { setLeaving(true); return; }
          if (await act(() => b.leaveGroup(groupId), tr("Saliste de {0}", g.name))) { nav.closeSheet(); nav.back(); }
        }}><Icon n="out" sm />{leaving ? tr("Salir del grupo") : tr("Salir del grupo…")}</button>
      </div>
    </>
  );
}

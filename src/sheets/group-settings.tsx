import { useEffect, useState } from 'react';
import {
  debts, exportCsv, exportHtml, exportName, fundOf, getBackend, groupOf, groupPhotoPath, moneyT, parseMoney, run, short, type Id,
} from '@saldao/core';
import { pickPhoto, readPhoto } from '../lib/photo';
import { Icon } from '../ui/icons';
import { Av, errMsg, useS } from '../ui/kit';
import { SheetHead, buzz, useNav } from '../ui/nav';
import { GroupPhoto } from '../ui/photo';

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
export const debtLines = (s: ReturnType<typeof useS>, g: Id) => debts(s, g).map(t => `${short(s, t.from)} le debe a ${short(s, t.to)} ${moneyT(t.amount)}`);

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
    await act(async () => { await b.uploadPhoto(path, { data: p.blob, type: 'image/jpeg', uri: p.uri }); await b.updateGroup(groupId, { photoPath: path }); }, 'Foto del grupo cambiada');
  };
  const members = g.members.filter(m => !s.profiles[m]?.fundOf);
  return (
    <>
      <SheetHead title="Ajustes del grupo" left={<button className="link tap" onClick={nav.closeSheet}>Listo</button>} />
      <div className="scroll sheet-scroll pad">
        <section className="card form">
          <div className="group-head"><GroupPhoto g={g} size={56} />
            {admin && <button className="btn sm tap" disabled={busy} onClick={photo}><Icon n="edit" sm />{g.photoPath ? 'Cambiar foto' : 'Poner foto'}</button>}
            {admin && g.photoPath && <button className="link tap" disabled={busy} onClick={() => act(() => b.updateGroup(groupId, { photoPath: null }), 'Foto quitada')}>Quitar</button>}</div>
          <label>Nombre<input className="field" value={name} maxLength={60} disabled={!admin} onChange={e => setName(e.target.value)} /></label>
          {admin && name.trim() && name.trim() !== g.name && <button className="btn primary tap" disabled={busy} onClick={() => act(() => b.updateGroup(groupId, { name: name.trim() }), 'Nombre cambiado')}>Guardar nombre</button>}
          <label>Presupuesto del mes
            <span className="num-in wide"><span>RD$</span><input inputMode="decimal" placeholder="Sin presupuesto" value={budget} disabled={!admin} onChange={e => setBudget(e.target.value)} aria-label="Presupuesto del mes" /></span></label>
          <p className="note">Lo que el grupo piensa gastar al mes (sin contar pagos). Avisa al llegar al 80 %.</p>
          <label>Fechas (si es de fecha a fecha)
            <span className="chips">
              <span className="chip"><Icon n="cal" sm />Desde<input type="date" value={from} disabled={!admin} onChange={e => { setFrom(e.target.value); if (to && e.target.value > to) setTo(''); }} aria-label="Desde" /></span>
              <span className="chip"><Icon n="cal" sm />Hasta<input type="date" value={to} min={from || undefined} disabled={!admin} onChange={e => setTo(e.target.value)} aria-label="Hasta" /></span>
            </span></label>
          {admin && (from !== (g.startsOn ?? '') || to !== (g.endsOn ?? '')) && (
            <button className="btn tap" disabled={busy} onClick={() => act(() => b.updateGroup(groupId, { startsOn: from || null, endsOn: to || null }), from || to ? 'Fechas guardadas' : 'Fechas quitadas')}>
              {from || to ? 'Guardar fechas' : 'Quitar fechas'}</button>)}
          {admin && String(g.budget ? g.budget / 100 : '') !== budget.trim() && (
            <button className="btn tap" disabled={busy} onClick={() => act(() => b.updateGroup(groupId, { budget: parseMoney(budget) || null }), budget.trim() ? 'Presupuesto guardado' : 'Presupuesto quitado')}>
              {budget.trim() ? 'Guardar presupuesto' : 'Quitar presupuesto'}</button>)}
        </section>
        <ul className="list card">
          <li><label className="row toggle tap">
            <span className="main"><span className="t">Simplificar deudas</span><span className="s">El grupo salda con el menor número de pagos, aunque a veces le pagues a alguien con quien no tuviste gastos.</span></span>
            <input type="checkbox" checked={g.simplify} disabled={!admin || busy} onChange={e => act(() => b.updateGroup(groupId, { simplify: e.target.checked }), e.target.checked ? 'Deudas simplificadas' : 'Deudas de a pares')} />
          </label></li>
          <li>{fund
            ? <div className="row static"><span className="row-ic accent"><Icon n="receipt" /></span><span className="main"><span className="t">Fondo común</span><span className="s">Ya existe: aporta o paga desde la pantalla del grupo.</span></span></div>
            : <button className="row tap" disabled={busy} onClick={() => act(() => b.createFund(groupId), 'Fondo común creado')}>
              <span className="row-ic accent"><Icon n="plus" /></span><span className="main"><span className="t">Crear fondo común</span><span className="s">Para un viaje: cada uno aporta al principio y los gastos salen de ahí.</span></span></button>}</li>
        </ul>
        <h3>Personas</h3>
        <ul className="list card">{members.map(m => {
          const p = s.profiles[m], noAccount = !p?.userId && !p?.deletedAt;
          return (
            <li key={m}><div className="row static member"><Av id={m} />
              {renaming?.id === m
                ? <form className="composer" style={{ flex: 1 }} onSubmit={async ev => { ev.preventDefault(); if (await act(() => b.renamePlaceholder(groupId, m, renaming.name.trim()), 'Nombre cambiado')) setRenaming(null); }}>
                    <input value={renaming.name} autoFocus maxLength={80} onChange={e => setRenaming({ id: m, name: e.target.value })} aria-label="Nombre nuevo" />
                    <button className="icon-btn tap" aria-label="Guardar nombre" disabled={!renaming.name.trim() || busy}><Icon n="check" /></button></form>
                : <span className="main"><span className="t">{m === s.me ? 'Tú' : p?.name}</span>
                    <span className="s">{g.roles[m] === 'admin' ? 'Admin' : p?.deletedAt ? 'Borró su cuenta' : p?.userId ? 'Miembro' : 'Sin cuenta todavía'}</span></span>}
              {admin && m !== s.me && renaming?.id !== m && <span className="member-acts">
                {p?.userId && <button className="btn sm tap" disabled={busy} onClick={() => act(() => b.setMemberRole(groupId, m, g.roles[m] === 'admin' ? 'miembro' : 'admin'), g.roles[m] === 'admin' ? 'Ya no es admin' : 'Ahora es admin')}>
                  {g.roles[m] === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>}
                {noAccount && <button className="btn sm tap" disabled={busy} onClick={() => setRenaming({ id: m, name: p?.name ?? '' })}><Icon n="edit" sm />Nombre</button>}
                <button className="btn sm danger tap" disabled={busy} aria-label={`Quitar a ${p?.name} del grupo`} onClick={async () => {
                  if (removing !== m) { setRemoving(m); return; }
                  if (await act(() => b.removeMember(groupId, m), `${p?.name ?? 'La persona'} ya no está en el grupo`)) setRemoving(null);
                }}>{removing === m ? '¿Quitar?' : 'Quitar'}</button>
              </span>}
            </div></li>
          );
        })}</ul>
        {removing && <p className="note">Toca «¿Quitar?» otra vez para confirmar. Solo se puede con sus cuentas saldadas en el grupo; lo que compartió se queda.</p>}
        <h3>Exportar</h3>
        <div className="actions">
          <button className="btn tap" onClick={() => { download(`${exportName(s, groupId)}.csv`, exportCsv(s, groupId), 'text/csv;charset=utf-8'); nav.toast('Archivo listo para Excel'); }}><Icon n="receipt" sm />Excel (CSV)</button>
          <button className="btn tap" onClick={() => { if (!printReport(exportHtml(s, groupId, debtLines(s, groupId)))) nav.toast('El navegador bloqueó la ventana'); }}><Icon n="share" sm />Imprimir o PDF</button>
        </div>
        {admin && <button className="btn block tap" disabled={busy} onClick={async () => { if (await act(() => b.updateGroup(groupId, { archived: !g.archivedAt }), g.archivedAt ? 'Grupo de vuelta en la lista' : 'Grupo archivado')) nav.closeSheet(); }}>
          {g.archivedAt ? 'Sacar del archivo' : 'Archivar el grupo'}</button>}
        {leaving && <p className="split-status bad">Solo puedes salir con tus cuentas saldadas en este grupo. Lo que compartiste se queda.</p>}
        <button className="btn danger block tap" disabled={busy} onClick={async () => {
          if (!leaving) { setLeaving(true); return; }
          if (await act(() => b.leaveGroup(groupId), `Saliste de ${g.name}`)) { nav.closeSheet(); nav.back(); }
        }}><Icon n="out" sm />{leaving ? 'Salir del grupo' : 'Salir del grupo…'}</button>
      </div>
    </>
  );
}

import { useState } from 'react';
import { APP, getBackend, moneyT, myTotals, PRIVACY_URL, run, TERMS_URL } from '@saldao/core';
import { Icon } from '../ui/icons';
import { errMsg, useS } from '../ui/kit';
import { SheetHead, useNav } from '../ui/nav';
import { tr } from '@saldao/core';

/** Los dos enlaces, para abrir en otra pestaña (en la app instalada abren el navegador). */
export const LegalLinks = () => (
  <><a href={TERMS_URL} target="_blank" rel="noopener">{tr("Términos de uso")}</a>{" "}{tr("y la")}{" "}<a href={PRIVACY_URL} target="_blank" rel="noopener">{tr("Política de privacidad")}</a></>
);

/**
 * Antes de seguir: quien entró con Google, una cuenta de antes de los términos o cuando cambia la versión. Lo esencial en
 * cuatro líneas y los documentos completos a un toque.
 */
export function LegalGate() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const accept = async () => {
    setBusy(true); setMsg('');
    try { await run(b => b.acceptLegal()); } catch (e) { setMsg(errMsg(e)); setBusy(false); }
  };
  return (
    <main className="gate">
      <div><img className="brand-ic" src="/favicon.svg" alt="" width="56" height="56" /><h1>{tr("Antes de seguir")}</h1>
        <p className="lead">{tr("Lee y acepta cómo funciona {0} y qué hacemos con tus datos.", APP.name)}</p></div>
      <ul className="legal-sum card">
        <li><Icon n="users" />{tr("Las personas de tus grupos ven tu nombre, los gastos que comparten y dónde te pagan. Tu correo, no.")}</li>
        <li><Icon n="swap" />{tr("{0} no mueve dinero: anota lo que pagan entre ustedes.", APP.name)}</li>
        <li><Icon n="eyeOff" />{tr("No vendemos tus datos ni mostramos anuncios.")}</li>
        <li><Icon n="trash" />{tr("Puedes borrar tu cuenta cuando quieras desde Cuenta.")}</li>
      </ul>
      <p className="note">{tr("Al seguir aceptas los")}{" "}<LegalLinks />.</p>
      <button className="btn primary block tap" disabled={busy} onClick={accept}>{busy ? tr("Un momento…") : tr("Aceptar y seguir")}</button>
      <button className="link tap" disabled={busy} onClick={() => run(b => b.signOut()).catch(() => location.reload())}>{tr("Salir")}</button>
      {msg && <p className="err" role="alert">{msg}</p>}
    </main>
  );
}

/** Borrar la cuenta: qué se va, qué se queda en los grupos, y escribir BORRAR para que no sea un toque sin querer. */
export function DeleteAccountSheet() {
  const s = useS(), nav = useNav(), t = myTotals(s);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = word.trim().toUpperCase() === 'BORRAR';
  const go = async () => {
    setBusy(true);
    // sin run(): después de borrar ya no hay sesión con qué recargar; la app vuelve sola a la pantalla de entrar
    try { await getBackend()!.deleteAccount('BORRAR'); } catch (e) { nav.toast(errMsg(e)); setBusy(false); }
  };
  return (
    <>
      <SheetHead title={tr("Borrar mi cuenta")} />
      <div className="scroll sheet-scroll pad">
        {(t.owed > 0 || t.owe > 0) && <p className="split-status bad">{tr("Tienes saldos abiertos: te deben {0} y debes {1}. Quedan anotados en los grupos.", moneyT(t.owed), moneyT(t.owe))}</p>}
        <section className="card plain-card">
          <h2>{tr("Se borra")}</h2>
          <ul className="legal-sum">
            <li><Icon n="out" />{tr("Tu acceso: no podrás volver a entrar con este correo ni con tu usuario.")}</li>
            <li><Icon n="mail" />{tr("Tu correo, tu usuario y dónde te pagan.")}</li>
            <li><Icon n="trash" />{tr("Los grupos donde no queda nadie más con cuenta, con todos sus gastos.")}</li>
          </ul>
        </section>
        <section className="card plain-card">
          <h2>{tr("Se queda en los grupos")}</h2>
          <ul className="legal-sum">
            <li><Icon n="receipt" />{tr("Los gastos, pagos y comentarios que compartiste, con tu nombre: también son las cuentas de las otras personas.")}</li>
          </ul>
        </section>
        <label className="form-label">{tr("Escribe BORRAR para confirmar")}<input className="field" value={word} onChange={e => setWord(e.target.value)} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            autoComplete="off" enterKeyHint="done" aria-label={tr("Escribe BORRAR para confirmar")} /></label>
        <button className="btn danger-solid block tap" disabled={!ready || busy} onClick={go}><Icon n="trash" sm />{busy ? tr("Borrando…") : tr("Borrar mi cuenta para siempre")}</button>
        <p className="note center">{tr("Esto no se puede deshacer.")}</p>
      </div>
    </>
  );
}

import { useState } from 'react';
import { APP, getBackend, moneyT, myTotals, PRIVACY_URL, run, TERMS_URL } from '@saldao/core';
import { Icon } from '../ui/icons';
import { errMsg, useS } from '../ui/kit';
import { SheetHead, useNav } from '../ui/nav';

/** Los dos enlaces, para abrir en otra pestaña (en la app instalada abren el navegador). */
export const LegalLinks = () => (
  <><a href={TERMS_URL} target="_blank" rel="noopener">Términos de uso</a> y la <a href={PRIVACY_URL} target="_blank" rel="noopener">Política de privacidad</a></>
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
      <div><img className="brand-ic" src="/favicon.svg" alt="" width="56" height="56" /><h1>Antes de seguir</h1>
        <p className="lead">Lee y acepta cómo funciona {APP.name} y qué hacemos con tus datos.</p></div>
      <ul className="legal-sum card">
        <li><Icon n="users" />Las personas de tus grupos ven tu nombre, los gastos que comparten y dónde te pagan. Tu correo, no.</li>
        <li><Icon n="swap" />{APP.name} no mueve dinero: anota lo que pagan entre ustedes.</li>
        <li><Icon n="eyeOff" />No vendemos tus datos ni mostramos anuncios.</li>
        <li><Icon n="trash" />Puedes borrar tu cuenta cuando quieras desde Cuenta.</li>
      </ul>
      <p className="note">Al seguir aceptas los <LegalLinks />.</p>
      <button className="btn primary block tap" disabled={busy} onClick={accept}>{busy ? 'Un momento…' : 'Aceptar y seguir'}</button>
      <button className="link tap" disabled={busy} onClick={() => run(b => b.signOut()).catch(() => location.reload())}>Salir</button>
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
      <SheetHead title="Borrar mi cuenta" />
      <div className="scroll sheet-scroll pad">
        {(t.owed > 0 || t.owe > 0) && <p className="split-status bad">Tienes saldos abiertos: te deben {moneyT(t.owed)} y debes {moneyT(t.owe)}. Quedan anotados en los grupos.</p>}
        <section className="card plain-card">
          <h2>Se borra</h2>
          <ul className="legal-sum">
            <li><Icon n="out" />Tu acceso: no podrás volver a entrar con este correo ni con tu usuario.</li>
            <li><Icon n="mail" />Tu correo, tu usuario y dónde te pagan.</li>
            <li><Icon n="trash" />Los grupos donde no queda nadie más con cuenta, con todos sus gastos.</li>
          </ul>
        </section>
        <section className="card plain-card">
          <h2>Se queda en los grupos</h2>
          <ul className="legal-sum">
            <li><Icon n="receipt" />Los gastos, pagos y comentarios que compartiste, con tu nombre: también son las cuentas de las otras personas.</li>
          </ul>
        </section>
        <label className="form-label">Escribe BORRAR para confirmar
          <input className="field" value={word} onChange={e => setWord(e.target.value)} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            autoComplete="off" enterKeyHint="done" aria-label="Escribe BORRAR para confirmar" /></label>
        <button className="btn danger-solid block tap" disabled={!ready || busy} onClick={go}><Icon n="trash" sm />{busy ? 'Borrando…' : 'Borrar mi cuenta para siempre'}</button>
        <p className="note center">Esto no se puede deshacer.</p>
      </div>
    </>
  );
}

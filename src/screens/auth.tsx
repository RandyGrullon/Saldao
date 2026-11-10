import { useEffect, useState, type FormEvent } from 'react';
import { APP, typedUser, USERNAME, USERNAME_RULE } from '@saldao/core';
import { resendConfirmation, sendPasswordReset, setNewPassword, signIn, signInWithGoogle, signUp, UNCONFIRMED, usernameAvailable } from '@saldao/core/supabase';
import { DELETED } from '../data/connect';
import { Icon } from '../ui/icons';
import { errMsg } from '../ui/kit';
import { LegalLinks } from './legal';
import { tr } from '@saldao/core';

const MIN = 8;

// Si se abre un enlace del correo que venció o ya se usó, Supabase vuelve con el error en la URL.
const LINK_ERR = (() => {
  const q = new URLSearchParams(`${location.hash.slice(1)}&${location.search.slice(1)}`);
  const code = q.get('error_code');
  if (!code) return '';
  const rest = new URLSearchParams(location.search);
  for (const k of ['error', 'error_code', 'error_description']) rest.delete(k);
  history.replaceState(history.state, '', location.pathname + (rest.toString() ? `?${rest}` : ''));
  return code === 'otp_expired'
    ? tr("Ese enlace ya venció o ya se usó. Si ya confirmaste tu correo, entra normal. Si no, escribe tu correo y pide otro.")
    : tr("No pudimos abrir ese enlace. Entra con tu correo y contraseña o pide otro correo.");
})();

// Después de borrar la cuenta, la pantalla de entrar lo confirma una vez.
function justDeleted() {
  try { if (sessionStorage.getItem(DELETED)) { sessionStorage.removeItem(DELETED); return tr("Tu cuenta se borró. Gracias por usar Saldao."); } } catch { /* sin almacenamiento */ }
  return '';
}

function PasswordField({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete: 'current-password' | 'new-password';
}) {
  const [show, setShow] = useState(false);
  return (
    <label>{label}
      <span className="pass">
        <input className="field" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} required
          autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={e => onChange(e.target.value)} />
        <button type="button" className="pass-eye" aria-label={show ? tr("Ocultar contraseña") : tr("Mostrar contraseña")} onClick={() => setShow(v => !v)}>
          <Icon n={show ? 'eyeOff' : 'eye'} />
        </button>
      </span>
    </label>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(LINK_ERR);
  const [info, setInfo] = useState(justDeleted);
  const [agree, setAgree] = useState(false);
  const [resend, setResend] = useState(!!LINK_ERR);
  const [resendTo, setResendTo] = useState(''); // el correo de la cuenta, aunque haya entrado con su usuario
  const [free, setFree] = useState<boolean | null>(null);
  const go = (m: typeof mode) => { setMode(m); setMsg(''); setInfo(''); setResend(false); setResendTo(''); };
  const em = email.trim();
  const userOk = USERNAME.test(username);
  const valid = mode === 'login' ? em.length > 0 && pass.length > 0
    : em.includes('@') && (mode === 'reset' || (pass.length >= MIN && name.trim().length > 0 && userOk && free !== false && agree));
  const to = resendTo || em;

  // ¿está libre el usuario? Se pregunta cuando deja de escribir.
  useEffect(() => {
    setFree(null);
    if (mode !== 'register' || !userOk) return;
    let live = true;
    const t = setTimeout(() => usernameAvailable(username).then(ok => live && setFree(ok), () => {}), 400);
    return () => { live = false; clearTimeout(t); };
  }, [mode, username, userOk]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setMsg(''); setInfo('');
    try {
      if (mode === 'login') await signIn(em, pass);
      else if (mode === 'register') {
        const { needsConfirm } = await signUp(name.trim(), username, em, pass);
        if (needsConfirm) { setMode('login'); setPass(''); setResend(true); setResendTo(em); setInfo(tr("Te enviamos un correo a {0}. Abre el enlace para activar tu cuenta y luego entra aquí.", em)); }
      } else {
        await sendPasswordReset(em);
        setInfo(tr("Si hay una cuenta con {0}, te llegará un enlace para crear una contraseña nueva. Revisa también spam.", em));
      }
    } catch (err) {
      setMsg(errMsg(err));
      if (err instanceof Error && err.message === UNCONFIRMED) { setResend(true); setResendTo((err as { email?: string }).email ?? ''); }
    } finally { setBusy(false); }
  };
  const again = async () => {
    setBusy(true); setMsg(''); setInfo('');
    try {
      await resendConfirmation(to);
      setInfo(tr("Te enviamos otro correo a {0}. Abre el enlace para activar tu cuenta. Revisa también spam.", to));
    } catch (err) { setMsg(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <main className="gate">
      <div><img className="brand-ic" src="/favicon.svg" alt="" width="56" height="56" /><h1>{APP.name}</h1><p className="lead">{tr(APP.description)}</p></div>
      {mode === 'reset' ? <p className="note">{tr("Escribe tu correo y te mandamos un enlace para crear una contraseña nueva.")}</p> : (
        <div className="seg" role="tablist" aria-label={tr("Entrar o crear cuenta")}>
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => go('login')}>{tr("Entrar")}</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => go('register')}>{tr("Crear cuenta")}</button>
        </div>
      )}
      <form className="form" onSubmit={submit} noValidate>
        {mode === 'register' && <label>{tr("Tu nombre")}<input className="field" autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder={tr("Como te conocen tus amigos")} /></label>}
        {mode === 'register' && <>
          <label>{tr("Usuario")}<input className="field" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="next" maxLength={20}
              value={username} onChange={e => setUsername(typedUser(e.target.value))} placeholder={tr("Para entrar sin escribir tu correo")} /></label>
          {username && (!userOk ? <p className="err">{tr(USERNAME_RULE)}</p>
            : free === false ? <p className="err">{tr("Ese usuario ya lo tiene otra persona.")}</p>
            : free && <p className="note"><Icon n="check" sm />{" "}{tr("@{0} está libre", username)}</p>)}
        </>}
        <label>{mode === 'login' ? tr("Correo o usuario") : tr("Correo")}
          <input className="field" type={mode === 'login' ? 'text' : 'email'} inputMode="email" autoComplete={mode === 'login' ? 'username' : 'email'}
            autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint={mode === 'reset' ? 'send' : 'next'}
            value={email} onChange={e => setEmail(e.target.value)} placeholder={mode === 'login' ? tr("tu@correo.com o tu usuario") : tr("tu@correo.com")} /></label>
        {mode !== 'reset' && <PasswordField label={mode === 'register' ? tr("Contraseña (mínimo {0} caracteres)", MIN) : tr("Contraseña")}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={pass} onChange={setPass} />}
        {mode === 'register' && <label className="agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
          <span>{tr("Acepto los")}{" "}<LegalLinks />.</span></label>}
        <button className="btn primary block tap" disabled={busy || !valid}>
          {busy ? tr("Un momento…") : mode === 'login' ? tr("Entrar") : mode === 'register' ? tr("Crear cuenta") : tr("Enviarme el enlace")}</button>
      </form>
      {mode !== 'reset' && <>
        <p className="or">{tr("o")}</p>
        <button type="button" className="btn block tap" disabled={busy}
          onClick={() => { setBusy(true); setMsg(''); signInWithGoogle().catch(err => { setMsg(errMsg(err)); setBusy(false); }); }}>
          <Icon n="google" />{tr("Continuar con Google")}</button>
      </>}
      {mode === 'login' && <button type="button" className="link tap" onClick={() => go('reset')}>{tr("¿Olvidaste tu contraseña?")}</button>}
      {mode === 'reset' && <button type="button" className="link tap" onClick={() => go('login')}>{tr("Volver a entrar")}</button>}
      {info && <p className="note" role="status">{info}</p>}
      {msg && <p className="err" role="alert">{msg}</p>}
      {mode === 'login' && resend && <button type="button" className="link tap" disabled={busy || !to.includes('@')} onClick={again}>{tr("Reenviar el correo de confirmación")}</button>}
    </main>
  );
}

/** Al volver del enlace de "olvidé mi contraseña": ya hay sesión y solo falta la contraseña nueva. */
export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pass !== pass2) return setMsg(tr("Las contraseñas no coinciden."));
    setBusy(true); setMsg('');
    try {
      await setNewPassword(pass);
      history.replaceState(history.state, '', location.pathname + location.search);
      onDone();
    } catch (err) { setMsg(errMsg(err)); setBusy(false); }
  };
  return (
    <main className="gate">
      <div><h1>{tr("Contraseña nueva")}</h1><p className="lead">{tr("Elige una de al menos {0} caracteres.", MIN)}</p></div>
      <form className="form" onSubmit={submit} noValidate>
        <PasswordField label={tr("Contraseña nueva")} autoComplete="new-password" value={pass} onChange={setPass} />
        <PasswordField label={tr("Repítela")} autoComplete="new-password" value={pass2} onChange={setPass2} />
        <button className="btn primary block tap" disabled={busy || pass.length < MIN || !pass2}>{busy ? tr("Guardando…") : tr("Guardar y entrar")}</button>
      </form>
      {msg && <p className="err" role="alert">{msg}</p>}
    </main>
  );
}

import { useState, type FormEvent } from 'react';
import { APP } from '../app.config';
import { sendPasswordReset, setNewPassword, signIn, signInWithGoogle, signUp } from '../data/supabase';
import { Icon } from '../ui/icons';
import { errMsg } from '../ui/kit';

const MIN = 8;

function PasswordField({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete: 'current-password' | 'new-password';
}) {
  const [show, setShow] = useState(false);
  return (
    <label>{label}
      <span className="pass">
        <input className="field" type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} required
          autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={e => onChange(e.target.value)} />
        <button type="button" className="pass-eye" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(v => !v)}>
          <Icon n={show ? 'eyeOff' : 'eye'} />
        </button>
      </span>
    </label>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState('');
  const go = (m: typeof mode) => { setMode(m); setMsg(''); setInfo(''); };
  const em = email.trim();
  const valid = em.includes('@') && (mode === 'reset' || (mode === 'login' ? pass.length > 0 : pass.length >= MIN && name.trim().length > 0));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setMsg(''); setInfo('');
    try {
      if (mode === 'login') await signIn(em, pass);
      else if (mode === 'register') {
        const { needsConfirm } = await signUp(name.trim(), em, pass);
        if (needsConfirm) { setMode('login'); setPass(''); setInfo(`Te enviamos un correo a ${em}. Abre el enlace para activar tu cuenta y luego entra aquí.`); }
      } else {
        await sendPasswordReset(em);
        setInfo(`Si hay una cuenta con ${em}, te llegará un enlace para crear una contraseña nueva. Revisa también spam.`);
      }
    } catch (err) { setMsg(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <main className="gate">
      <div><h1>{APP.name}</h1><p className="lead">{APP.description}</p></div>
      {mode === 'reset' ? <p className="note">Escribe tu correo y te mandamos un enlace para crear una contraseña nueva.</p> : (
        <div className="seg" role="tablist" aria-label="Entrar o crear cuenta">
          <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => go('login')}>Entrar</button>
          <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => go('register')}>Crear cuenta</button>
        </div>
      )}
      <form className="form" onSubmit={submit} noValidate>
        {mode === 'register' && <label>Tu nombre
          <input className="field" autoComplete="name" autoCapitalize="words" enterKeyHint="next" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Como te conocen tus amigos" /></label>}
        <label>Correo
          <input className="field" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" enterKeyHint={mode === 'reset' ? 'send' : 'next'}
            value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" /></label>
        {mode !== 'reset' && <PasswordField label={mode === 'register' ? `Contraseña (mínimo ${MIN} caracteres)` : 'Contraseña'}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={pass} onChange={setPass} />}
        <button className="btn primary block tap" disabled={busy || !valid}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviarme el enlace'}</button>
      </form>
      {mode !== 'reset' && <>
        <p className="or">o</p>
        <button type="button" className="btn block tap" disabled={busy}
          onClick={() => { setBusy(true); setMsg(''); signInWithGoogle().catch(err => { setMsg(errMsg(err)); setBusy(false); }); }}>
          <Icon n="google" />Continuar con Google</button>
      </>}
      {mode === 'login' && <button type="button" className="link tap" onClick={() => go('reset')}>¿Olvidaste tu contraseña?</button>}
      {mode === 'reset' && <button type="button" className="link tap" onClick={() => go('login')}>Volver a entrar</button>}
      {info && <p className="note" role="status">{info}</p>}
      {msg && <p className="err" role="alert">{msg}</p>}
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
    if (pass !== pass2) return setMsg('Las contraseñas no coinciden.');
    setBusy(true); setMsg('');
    try {
      await setNewPassword(pass);
      history.replaceState(history.state, '', location.pathname + location.search);
      onDone();
    } catch (err) { setMsg(errMsg(err)); setBusy(false); }
  };
  return (
    <main className="gate">
      <div><h1>Contraseña nueva</h1><p className="lead">Elige una de al menos {MIN} caracteres.</p></div>
      <form className="form" onSubmit={submit} noValidate>
        <PasswordField label="Contraseña nueva" autoComplete="new-password" value={pass} onChange={setPass} />
        <PasswordField label="Repítela" autoComplete="new-password" value={pass2} onChange={setPass2} />
        <button className="btn primary block tap" disabled={busy || pass.length < MIN || !pass2}>{busy ? 'Guardando…' : 'Guardar y entrar'}</button>
      </form>
      {msg && <p className="err" role="alert">{msg}</p>}
    </main>
  );
}

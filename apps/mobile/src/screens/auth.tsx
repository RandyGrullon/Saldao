import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP, typedUser, USERNAME, USERNAME_RULE } from '@saldao/core';
import { authError, requireGoogle, resendConfirmation, sb, sendPasswordReset, signIn, signUp, UNCONFIRMED, usernameAvailable } from '@saldao/core/supabase';
import { deleted } from '../lib/connect';
import { buzz, errMsg } from '../lib/nav';
import { F, R, SIZE, useC } from '../lib/theme';
import { Btn, Card, Label, LinkBtn, Note, Seg } from '../ui/base';
import { Icon } from '../ui/icons';
import { H1, Txt } from '../ui/text';
import { LegalRow } from './legal';

WebBrowser.maybeCompleteAuthSession();
const MIN = 8;

/** Google en el navegador seguro del teléfono; al volver, la sesión viene en el enlace (#access_token=…). */
async function signInWithGoogleNative() {
  await requireGoogle();
  const redirectTo = Linking.createURL('auth');
  const { data, error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw authError(error);
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return; // la persona cerró el navegador
  const q = new URLSearchParams(res.url.split('#')[1] ?? res.url.split('?')[1] ?? '');
  if (q.get('error')) throw new Error('No se pudo entrar con Google. Intenta de nuevo o usa tu correo.');
  const access_token = q.get('access_token'), refresh_token = q.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('No se pudo entrar con Google. Intenta de nuevo o usa tu correo.');
  const { error: e2 } = await sb().auth.setSession({ access_token, refresh_token });
  if (e2) throw authError(e2);
}

function Input(p: TextInputProps & { right?: React.ReactNode }) {
  const c = useC();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[a.field, { borderColor: focus ? c.accentInk : c.line, backgroundColor: c.bg }]}>
      <TextInput placeholderTextColor={c.faint} {...p} onFocus={e => { setFocus(true); p.onFocus?.(e); }} onBlur={e => { setFocus(false); p.onBlur?.(e); }}
        style={[a.input, { color: c.fg }]} />
      {p.right}
    </View>
  );
}
function PasswordField({ value, onChange, isNew, onSubmit }: { value: string; onChange: (v: string) => void; isNew?: boolean; onSubmit?: () => void }) {
  const c = useC();
  const [show, setShow] = useState(false);
  return (
    <Input value={value} onChangeText={onChange} secureTextEntry={!show} autoCapitalize="none" autoCorrect={false}
      autoComplete={isNew ? 'new-password' : 'current-password'} textContentType={isNew ? 'newPassword' : 'password'} returnKeyType="go" onSubmitEditing={onSubmit}
      right={<Pressable onPress={() => setShow(v => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={a.eye}>
        <Icon n={show ? 'eyeOff' : 'eye'} color={c.muted} /></Pressable>} />
  );
}

export function AuthScreen() {
  const c = useC(), insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState(() => { if (deleted.now) { deleted.now = false; return 'Tu cuenta se borró. Gracias por usar Saldao.'; } return ''; });
  const [agree, setAgree] = useState(false);
  const [resend, setResend] = useState(false);
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

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setMsg(''); setInfo('');
    try {
      if (mode === 'login') await signIn(em, pass);
      else if (mode === 'register') {
        const { needsConfirm } = await signUp(name.trim(), username, em, pass);
        if (needsConfirm) { setMode('login'); setPass(''); setResend(true); setResendTo(em); setInfo(`Te enviamos un correo a ${em}. Abre el enlace para activar tu cuenta y luego entra aquí.`); }
      } else {
        await sendPasswordReset(em);
        setInfo(`Si hay una cuenta con ${em}, te llegará un enlace para crear una contraseña nueva. Revisa también spam.`);
      }
    } catch (err) {
      setMsg(errMsg(err));
      if (err instanceof Error && err.message === UNCONFIRMED) { setResend(true); setResendTo((err as { email?: string }).email ?? ''); }
    } finally { setBusy(false); }
  };
  const again = async () => {
    setBusy(true); setMsg(''); setInfo('');
    try { await resendConfirmation(to); setInfo(`Te enviamos otro correo a ${to}. Abre el enlace para activar tu cuenta. Revisa también spam.`); }
    catch (err) { setMsg(errMsg(err)); } finally { setBusy(false); }
  };
  const google = async () => {
    setBusy(true); setMsg('');
    try { await signInWithGoogleNative(); } catch (err) { setMsg(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} keyboardShouldPersistTaps="handled"
      contentContainerStyle={[a.gate, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View>
        <Image source={require('../../assets/splash-icon.png')} style={a.brand} accessibilityIgnoresInvertColors />
        <H1 s={34}>{APP.name}</H1>
        <Txt s={17} c="muted" style={{ marginTop: 8 }}>{APP.description}</Txt>
      </View>
      {mode === 'reset' ? <Note>Escribe tu correo y te mandamos un enlace para crear una contraseña nueva.</Note>
        : <Seg label="Entrar o crear cuenta" value={mode} onChange={m => go(m)} options={[['login', 'Entrar'], ['register', 'Crear cuenta']]} />}
      <Card style={{ padding: 22, gap: 12 }}>
        {mode === 'register' && <Label title="Tu nombre">
          <Input value={name} onChangeText={setName} maxLength={80} placeholder="Como te conocen tus amigos" autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" /></Label>}
        {mode === 'register' && <Label title="Usuario">
          <Input value={username} onChangeText={v => setUsername(typedUser(v))} maxLength={20} placeholder="Para entrar sin escribir tu correo"
            autoCapitalize="none" autoCorrect={false} autoComplete="username-new" textContentType="username" returnKeyType="next" /></Label>}
        {mode === 'register' && !!username && (!userOk ? <Txt f="medium" s={15} c="danger">{USERNAME_RULE}</Txt>
          : free === false ? <Txt f="medium" s={15} c="danger">Ese usuario ya lo tiene otra persona.</Txt>
          : free ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon n="check" sm color={c.ok} /><Txt s={15} c="muted">@{username} está libre</Txt></View> : null)}
        <Label title={mode === 'login' ? 'Correo o usuario' : 'Correo'}>
          <Input value={email} onChangeText={setEmail} placeholder={mode === 'login' ? 'tu@correo.com o tu usuario' : 'tu@correo.com'}
            keyboardType={mode === 'login' ? 'default' : 'email-address'} autoCapitalize="none" autoCorrect={false}
            autoComplete={mode === 'login' ? 'username' : 'email'} textContentType={mode === 'login' ? 'username' : 'emailAddress'}
            returnKeyType={mode === 'reset' ? 'send' : 'next'} onSubmitEditing={mode === 'reset' ? submit : undefined} /></Label>
        {mode !== 'reset' && <Label title={mode === 'register' ? `Contraseña (mínimo ${MIN} caracteres)` : 'Contraseña'}>
          <PasswordField value={pass} onChange={setPass} isNew={mode === 'register'} onSubmit={submit} /></Label>}
        {mode === 'register' && (
          <Pressable onPress={() => { buzz(); setAgree(v => !v); }} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} style={a.agree}>
            <View style={[a.check, { borderColor: agree ? c.accent : c.line, backgroundColor: agree ? c.accent : 'transparent' }]}>{agree && <Icon n="check" size={14} color={c.accentFg} weight={3} />}</View>
            <View style={{ flex: 1 }}><LegalRow prefix="Acepto los" /></View>
          </Pressable>
        )}
        <Btn title={busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviarme el enlace'} kind="primary" size="lg" disabled={busy || !valid} onPress={submit} />
      </Card>
      {mode !== 'reset' && <>
        <View style={a.or}><View style={[a.line, { backgroundColor: c.line }]} /><Txt s={13} c="muted">o</Txt><View style={[a.line, { backgroundColor: c.line }]} /></View>
        <Btn title="Continuar con Google" icon="google" size="lg" disabled={busy} onPress={google} />
      </>}
      {mode === 'login' && <LinkBtn title="¿Olvidaste tu contraseña?" style={{ alignSelf: 'center' }} onPress={() => go('reset')} />}
      {mode === 'reset' && <LinkBtn title="Volver a entrar" style={{ alignSelf: 'center' }} onPress={() => go('login')} />}
      {info ? <Note>{info}</Note> : null}
      {msg ? <Txt f="medium" s={15} c="danger" style={{ textAlign: 'center' }}>{msg}</Txt> : null}
      {mode === 'login' && resend && <LinkBtn title="Reenviar el correo de confirmación" style={{ alignSelf: 'center' }} disabled={busy || !to.includes('@')} onPress={again} />}
    </ScrollView>
  );
}

/** Falta configurar Supabase (sin .env.local) o no se pudo cargar: un aviso y qué hacer. */
export function Notice({ title, text, action, secondary }: { title: string; text: string; action?: { title: string; onPress: () => void }; secondary?: { title: string; onPress: () => void } }) {
  const c = useC(), insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[a.gate, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <H1 s={30}>{title}</H1>
      <Txt s={17} c="muted">{text}</Txt>
      {action && <Btn title={action.title} kind="primary" size="lg" onPress={action.onPress} />}
      {secondary && <Btn title={secondary.title} kind="danger" size="lg" onPress={secondary.onPress} />}
    </ScrollView>
  );
}

const a = StyleSheet.create({
  gate: { flexGrow: 1, justifyContent: 'center', gap: 20, paddingHorizontal: SIZE.gut, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { width: 56, height: 56, marginBottom: 20, borderRadius: 16 },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 50, borderRadius: R.control, borderWidth: 1 },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 14, fontFamily: F.regular, fontSize: 16 },
  eye: { width: 46, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  agree: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
});

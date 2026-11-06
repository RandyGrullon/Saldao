import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP, discard, getBackend, moneyT, myTotals, PRIVACY_URL, run, TERMS_URL } from '@saldao/core';
import { errMsg, go } from '../lib/nav';
import { useS, useSync } from '../lib/store';
import { SIZE, useC } from '../lib/theme';
import { Btn, Card, Field, Label, LinkBtn, List, Main, Note, Row, Section, Sheet, SheetHead, SplitStatus } from '../ui/base';
import { Icon, type IconName } from '../ui/icons';
import { H1, H2, Txt } from '../ui/text';
import { tr } from '@saldao/core';

const open = (path: string) => () => WebBrowser.openBrowserAsync(`${APP.site}${path}`).catch(() => {});

/** «… los Términos de uso y la Política de privacidad», cada uno se abre en el navegador del teléfono. */
export function LegalRow({ prefix }: { prefix: string }) {
  const c = useC();
  return (
    <Txt s={14} c="fg2">
      {prefix} <Txt f="semi" s={14} color={c.accentInk} onPress={open(TERMS_URL)}>{tr("Términos de uso")}</Txt>{" "}{tr("y la{0}", ' ')}<Txt f="semi" s={14} color={c.accentInk} onPress={open(PRIVACY_URL)}>{tr("Política de privacidad")}</Txt>.
    </Txt>
  );
}

const Bullet = ({ icon, children }: { icon: IconName; children: string }) => {
  const c = useC();
  return <View style={l.bullet}><Icon n={icon} color={c.accentInk} /><Txt s={15} c="fg2" style={{ flex: 1 }}>{children}</Txt></View>;
};

/**
 * Antes de seguir: quien entró con Google, una cuenta de antes de los términos o cuando cambia la versión. Lo esencial en
 * cuatro líneas y los documentos completos a un toque.
 */
export function LegalGate() {
  const c = useC(), insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const accept = async () => {
    setBusy(true); setMsg('');
    try { await run(b => b.acceptLegal()); } catch (e) { setMsg(errMsg(e)); setBusy(false); }
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={[l.gate, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View><Image source={require('../../assets/splash-icon.png')} style={l.brand} accessibilityIgnoresInvertColors /><H1 s={34}>{tr("Antes de seguir")}</H1>
        <Txt s={17} c="muted" style={{ marginTop: 8 }}>{tr("Lee y acepta cómo funciona {0} y qué hacemos con tus datos.", APP.name)}</Txt></View>
      <Card style={{ padding: 22, gap: 14 }}>
        <Bullet icon="users">{tr("Las personas de tus grupos ven tu nombre, los gastos que comparten y dónde te pagan. Tu correo, no.")}</Bullet>
        <Bullet icon="swap">{tr("{0} no mueve dinero: anota lo que pagan entre ustedes.", APP.name)}</Bullet>
        <Bullet icon="eyeOff">{tr("No vendemos tus datos ni mostramos anuncios.")}</Bullet>
        <Bullet icon="trash">{tr("Puedes borrar tu cuenta cuando quieras desde Cuenta.")}</Bullet>
      </Card>
      <LegalRow prefix={tr("Al seguir aceptas los")} />
      <Btn title={busy ? tr("Un momento…") : tr("Aceptar y seguir")} kind="primary" size="lg" disabled={busy} onPress={accept} />
      <LinkBtn title={tr("Salir")} disabled={busy} style={{ alignSelf: 'center' }} onPress={() => run(b => b.signOut()).catch(() => {})} />
      {msg ? <Txt f="medium" s={15} c="danger">{msg}</Txt> : null}
    </ScrollView>
  );
}

/** Borrar la cuenta: qué se va, qué se queda en los grupos, y escribir BORRAR para que no sea un toque sin querer. */
export function DeleteAccountSheet() {
  const s = useS(), t = myTotals(s);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ready = word.trim().toUpperCase() === 'BORRAR';
  const del = async () => {
    setBusy(true); setErr('');
    // sin run(): después de borrar ya no hay sesión con qué recargar; la app vuelve sola a la pantalla de entrar
    try { await getBackend()!.deleteAccount('BORRAR'); } catch (e) { setErr(errMsg(e)); setBusy(false); }
  };
  return (
    <Sheet head={<SheetHead title={tr("Borrar mi cuenta")} />}>
      {(t.owed > 0 || t.owe > 0) ? <SplitStatus ok={false}>{tr("Tienes saldos abiertos: te deben {0} y debes {1}. Quedan anotados en los grupos.", moneyT(t.owed), moneyT(t.owe))}</SplitStatus> : null}
      <Section>
        <H2>{tr("Se borra")}</H2>
        <Bullet icon="out">{tr("Tu acceso: no podrás volver a entrar con este correo ni con tu usuario.")}</Bullet>
        <Bullet icon="mail">{tr("Tu correo, tu usuario y dónde te pagan.")}</Bullet>
        <Bullet icon="trash">{tr("Los grupos donde no queda nadie más con cuenta, con todos sus gastos.")}</Bullet>
      </Section>
      <Section>
        <H2>{tr("Se queda en los grupos")}</H2>
        <Bullet icon="receipt">{tr("Los gastos, pagos y comentarios que compartiste, con tu nombre: también son las cuentas de las otras personas.")}</Bullet>
      </Section>
      <Label title={tr("Escribe BORRAR para confirmar")}>
        <Field value={word} onChangeText={setWord} autoCapitalize="characters" autoCorrect={false} autoComplete="off" returnKeyType="done" accessibilityLabel={tr("Escribe BORRAR para confirmar")} />
      </Label>
      {err ? <Txt f="medium" s={15} c="danger">{err}</Txt> : null}
      <Btn title={busy ? tr("Borrando…") : tr("Borrar mi cuenta para siempre")} icon="trash" kind="dangerSolid" size="lg" disabled={!ready || busy} onPress={del} />
      <Note center>{tr("Esto no se puede deshacer.")}</Note>
    </Sheet>
  );
}

/** Lo que la base no aceptó: la persona lo ve con su motivo y lo descarta. */
export function FailedSheet() {
  const { failed } = useSync();
  if (!failed.length) return (
    <Sheet head={<SheetHead title={tr("No se guardaron")} left={<LinkBtn title={tr("Listo")} onPress={go.back} />} />}><Note>{tr("Ya no hay cambios pendientes.")}</Note></Sheet>
  );
  return (
    <Sheet head={<SheetHead title={tr("No se guardaron")} left={<LinkBtn title={tr("Listo")} onPress={go.back} />} />}>
      <Note>{tr("La base no aceptó estos cambios, así que no cuentan en los saldos. Si todavía hacen falta, vuelve a hacerlos.")}</Note>
      <List>{failed.map(o => (
        <Row key={o.id}>
          <Main><Txt f="semi">{o.label}</Txt><Txt s={14} c="muted">{o.error}</Txt></Main>
          <Btn title={tr("Descartar")} icon="trash" size="sm" onPress={() => discard(o.id)} />
        </Row>
      ))}</List>
    </Sheet>
  );
}

const l = StyleSheet.create({
  gate: { flexGrow: 1, justifyContent: 'center', gap: 20, paddingHorizontal: SIZE.gut, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { width: 56, height: 56, marginBottom: 20, borderRadius: 16 },
  bullet: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});

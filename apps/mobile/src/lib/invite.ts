// La invitación llega en un enlace (…?unirse=<uuid> o saldao://unirse/<uuid>). Se guarda al abrirlo: así sobrevive a
// crear la cuenta y confirmar el correo, y se ofrece al entrar.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { INVITE_PARAM, inviteToken } from '@saldao/core';

const KEY = 'saldao:unirse';

function fromUrl(url: string | null): string | null {
  if (!url) return null;
  const { path, queryParams } = Linking.parse(url);
  const q = queryParams?.[INVITE_PARAM] ?? queryParams?.token;
  const p = path?.match(/(?:^|\/)unirse\/([^/?#]+)/)?.[1];
  return inviteToken(typeof q === 'string' ? q : p ?? null);
}
const keep = (url: string | null) => { const t = fromUrl(url); if (t) AsyncStorage.setItem(KEY, t).catch(() => {}); };

Linking.getInitialURL().then(keep, () => {});
Linking.addEventListener('url', e => keep(e.url));

export async function pendingInvite(): Promise<string | null> {
  try { return inviteToken(await AsyncStorage.getItem(KEY)); } catch { return null; }
}
export const clearInvite = () => AsyncStorage.removeItem(KEY).catch(() => {});

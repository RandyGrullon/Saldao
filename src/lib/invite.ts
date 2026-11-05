// La invitación (?unirse=…) se guarda al abrir el enlace: así sobrevive a crear la cuenta y confirmar el correo.
import { INVITE_PARAM, inviteToken } from '@saldao/core';

const KEY = 'saldao:unirse';
const fromUrl = inviteToken(new URLSearchParams(location.search).get(INVITE_PARAM));
if (fromUrl) { try { localStorage.setItem(KEY, fromUrl); } catch { /* sin almacenamiento: queda la de la URL */ } }

export function pendingInvite(): string | null {
  try { return inviteToken(localStorage.getItem(KEY)) ?? fromUrl; } catch { return fromUrl; }
}
export function clearInvite() {
  try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  if (location.search.includes(INVITE_PARAM)) history.replaceState(history.state, '', location.pathname);
}

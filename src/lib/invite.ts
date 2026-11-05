// La invitación (?unirse=…) se guarda al abrir el enlace: así sobrevive a crear la cuenta y confirmar el correo.
// Solo se acepta con forma de enlace de Saldao (un uuid): cualquier otra cosa en la URL se ignora.
const KEY = 'saldao:unirse';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = (t: string | null) => (t && UUID.test(t) ? t : null);
const fromUrl = valid(new URLSearchParams(location.search).get('unirse'));
if (fromUrl) { try { localStorage.setItem(KEY, fromUrl); } catch { /* sin almacenamiento: queda la de la URL */ } }

export function pendingInvite(): string | null {
  try { return valid(localStorage.getItem(KEY)) ?? fromUrl; } catch { return fromUrl; }
}
export function clearInvite() {
  try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  if (location.search.includes('unirse')) history.replaceState(history.state, '', location.pathname);
}

// La invitación (?unirse=…) se guarda al abrir el enlace: así sobrevive a crear la cuenta y confirmar el correo.
const KEY = 'saldao:unirse';
const fromUrl = new URLSearchParams(location.search).get('unirse');
if (fromUrl) { try { localStorage.setItem(KEY, fromUrl); } catch { /* sin almacenamiento: queda la de la URL */ } }

export function pendingInvite(): string | null {
  try { return localStorage.getItem(KEY) ?? fromUrl; } catch { return fromUrl; }
}
export function clearInvite() {
  try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
  if (location.search.includes('unirse')) history.replaceState(history.state, '', location.pathname);
}

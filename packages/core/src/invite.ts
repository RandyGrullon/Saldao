// La invitación es un enlace con ?unirse=<uuid>. Solo se acepta con forma de enlace de Saldao: cualquier otra cosa se ignora.
export const INVITE_PARAM = 'unirse';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const inviteToken = (t: string | null | undefined) => (t && UUID.test(t) ? t : null);
/** `origin`: en la web, el de la página; en la app nativa, el sitio publicado. */
export const inviteLink = (origin: string, token: string) => `${origin}/?${INVITE_PARAM}=${token}`;

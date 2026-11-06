// Web Push sin librerías: la firma VAPID (RFC 8292) y el cifrado aes128gcm (RFC 8291) con WebCrypto, que existe igual
// en Deno (la función de avisos) y en Node (las pruebas). Un aviso es un solo registro cifrado de menos de 4 KB.
type Bytes = Uint8Array<ArrayBuffer>;
const enc = new TextEncoder();

export const b64u = {
  encode(b: Uint8Array) {
    let s = '';
    for (const x of b) s += String.fromCharCode(x);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Bytes {
    const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
    return out;
  },
};

const concat = (...xs: Uint8Array[]): Bytes => {
  const out = new Uint8Array(xs.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of xs) { out.set(x, o); o += x.length; }
  return out;
};
const bytes = (...xs: number[]): Bytes => Uint8Array.from(xs);

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

export interface Subscription { endpoint: string; keys: { p256dh: string; auth: string } }
export interface Vapid { publicKey: string; privateKey: string; subject: string }

/** Los servicios de avisos de los navegadores. A cualquier otra dirección no se le manda nada. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.apple.com', 'notify.windows.com', 'push.services.mozilla.com'];
export function parseSubscription(token: string): Subscription | null {
  try {
    const s = JSON.parse(token) as Subscription;
    const u = new URL(s.endpoint);
    const okHost = PUSH_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`));
    if (u.protocol !== 'https:' || !okHost || !s.keys?.p256dh || !s.keys?.auth) return null;
    if (b64u.decode(s.keys.p256dh).length !== 65 || b64u.decode(s.keys.auth).length !== 16) return null;
    return s;
  } catch { return null; }
}

/** Cifra el contenido para una suscripción (RFC 8291). `salt` y `local` solo se pasan en las pruebas. */
export async function encrypt(payload: Uint8Array<ArrayBuffer>, sub: Subscription, salt: Bytes = crypto.getRandomValues(new Uint8Array(16)), local?: CryptoKeyPair): Promise<Bytes> {
  const ua = b64u.decode(sub.keys.p256dh), auth = b64u.decode(sub.keys.auth);
  const as = local ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  // HKDF de un solo bloque: extraer con la sal y expandir con la info y 0x01
  const ikm = await hmac(await hmac(auth, ecdh), concat(enc.encode('WebPush: info\0'), ua, asPub, bytes(1)));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), bytes(1)))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), bytes(1)))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, bytes(2)))); // 0x02: último registro
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, bytes(asPub.length), asPub, ct);
}

/** El encabezado Authorization con la firma VAPID para el servicio de avisos de esa suscripción. */
export async function vapidAuth(endpoint: string, v: Vapid, now = Date.now()): Promise<string> {
  const pub = b64u.decode(v.publicKey);
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), d: v.privateKey, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: v.subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64u.encode(sig)}, k=${v.publicKey}`;
}

/** Manda un aviso. `gone`: la suscripción ya no existe (se borra). */
export async function sendWebPush(sub: Subscription, data: unknown, v: Vapid, ttl = 86400): Promise<{ ok: boolean; gone: boolean; status: number }> {
  const body = await encrypt(enc.encode(JSON.stringify(data)), sub);
  const r = await fetch(sub.endpoint, {
    method: 'POST', body,
    headers: { Authorization: await vapidAuth(sub.endpoint, v), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'normal' },
  });
  await r.body?.cancel();
  return { ok: r.ok, gone: r.status === 404 || r.status === 410, status: r.status };
}

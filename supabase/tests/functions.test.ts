// Lo que hacen las funciones de Supabase sin red: el cifrado de los avisos web (descifrado aquí con el HKDF de WebCrypto,
// por un camino distinto al de la función), la firma VAPID, el texto de cada aviso y cómo se pasa un recibo leído a la app.
import { describe, expect, it } from 'vitest';
import { avisoDe, type ActivityRow } from '../functions/_shared/avisos';
import { toScan } from '../functions/_shared/recibo';
import { b64u, encrypt, parseSubscription, vapidAuth } from '../functions/_shared/webpush';

const enc = new TextEncoder();
const concat = (...xs: Uint8Array[]) => { const o = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of xs) { o.set(x, i); i += x.length; } return o; };
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bits: number) =>
  new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bits));

/** El lado del navegador (RFC 8291), escrito aparte: lo que la función cifra, esto lo tiene que poder abrir. */
async function decrypt(body: Uint8Array, ua: CryptoKeyPair, auth: Uint8Array) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 256);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 128);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 96);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  expect(plain[plain.length - 1]).toBe(2); // último registro
  expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096);
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe('avisos en la web', () => {
  it('el navegador abre lo que la función cifra', async () => {
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: b64u.encode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64u.encode(auth) } };
    const msg = JSON.stringify({ title: 'Samaná', body: 'Laura añadió «Cena en la playa» · RD$ 10,790.40', url: '/' });
    const body = await encrypt(enc.encode(msg), sub);
    expect(await decrypt(body, ua, auth)).toBe(msg);
    // cada aviso lleva su propia sal y su propia clave de un solo uso
    expect(b64u.encode((await encrypt(enc.encode(msg), sub)).slice(0, 86))).not.toBe(b64u.encode(body.slice(0, 86)));
  });

  it('la firma VAPID es un JWT ES256 para el servicio de esa suscripción', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const pub = b64u.encode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
    const h = await vapidAuth('https://web.push.apple.com/QGuQyavXut', { publicKey: pub, privateKey: jwk.d!, subject: 'mailto:hola@saldao.app' }, 1_800_000_000_000);
    const [, t, k] = h.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(pub);
    const [head, claims, sig] = t.split('.');
    expect(JSON.parse(new TextDecoder().decode(b64u.decode(claims)))).toEqual({ aud: 'https://web.push.apple.com', exp: 1_800_000_000 + 12 * 3600, sub: 'mailto:hola@saldao.app' });
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64u.decode(sig), enc.encode(`${head}.${claims}`))).toBe(true);
  });

  it('solo se manda a los servicios de avisos de los navegadores', () => {
    const keys = { p256dh: b64u.encode(new Uint8Array(65).fill(4)), auth: b64u.encode(new Uint8Array(16)) };
    expect(parseSubscription(JSON.stringify({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys }))).not.toBeNull();
    expect(parseSubscription(JSON.stringify({ endpoint: 'https://web.push.apple.com/x', keys }))).not.toBeNull();
    expect(parseSubscription(JSON.stringify({ endpoint: 'https://wns2-par02p.notify.windows.com/w/?token=x', keys }))).not.toBeNull();
    expect(parseSubscription(JSON.stringify({ endpoint: 'https://169.254.169.254/latest', keys }))).toBeNull();
    expect(parseSubscription(JSON.stringify({ endpoint: 'http://fcm.googleapis.com/x', keys }))).toBeNull();
    expect(parseSubscription(JSON.stringify({ endpoint: 'https://evilfcm.googleapis.com.ejemplo.com/x', keys }))).toBeNull();
    expect(parseSubscription('{"endpoint":"https://push.ejemplo/ivo"}')).toBeNull();
    expect(parseSubscription('no es json')).toBeNull();
  });
});

describe('el texto de cada aviso', () => {
  const row = (verb: string, payload: Record<string, unknown> = {}): ActivityRow => ({ id: 1, group_id: 'g1', actor: 'p1', verb, expense_id: 'e1', payload });
  const ctx = { actorName: 'Laura Peña', group: { name: 'Samaná', kind: 'viaje' }, expense: { description: 'Cena en la playa', amount: 1079040, currency: 'DOP', is_payment: false } };
  it('gastos, pagos y comentarios, con el grupo de título y a dónde lleva', () => {
    expect(avisoDe(row('gasto_creado'), ctx)).toEqual({ title: 'Samaná', body: 'Laura añadió «Cena en la playa» · RD$ 10,790.40', path: '/gasto/e1', tag: 'gasto_creado-e1' });
    expect(avisoDe(row('gasto_creado', { repetido: true }), ctx)!.body).toBe('Se anotó solo: «Cena en la playa» · RD$ 10,790.40');
    expect(avisoDe(row('pago_registrado'), { ...ctx, expense: { ...ctx.expense, amount: 500000, is_payment: true } })!.body).toBe('Laura registró un pago de RD$ 5,000.00. Confírmalo si te llegó.');
    expect(avisoDe(row('comentario', { texto: 'La langosta valió cada peso.' }), ctx)!.body).toBe('Laura en «Cena en la playa»: La langosta valió cada peso.');
    expect(avisoDe(row('gasto_borrado'), { ...ctx, expense: null })).toMatchObject({ body: 'Laura borró «un gasto»', path: '/grupo/g1' });
  });
  it('entre dos, el título es la app; los ajustes del grupo no avisan', () => {
    expect(avisoDe(row('gasto_creado'), { ...ctx, group: { name: 'Laura y tú', kind: 'directo' } })!.title).toBe('Saldao');
    expect(avisoDe(row('grupo_editado'), ctx)).toBeNull();
    expect(avisoDe(row('fondo_creado'), ctx)).toBeNull();
  });
});

describe('un recibo leído', () => {
  it('pasa a centavos y el ITBIS y la ley a porcentaje sobre los ítems', () => {
    expect(toScan({
      readable: true, merchant: ' Adrian Tropical ', date: '2026-11-05', total: 2100.06,
      items: [{ name: 'Mofongo de chicharrón', price: 595 }, { name: 'Presidente grande ×2', price: 650 }, { name: '', price: 10 }, { name: 'Servilletas', price: 0 }],
      tax_amount: 224.1, tip_amount: 124.5,
    })).toEqual({
      merchant: 'Adrian Tropical', date: '2026-11-05', total: 210006,
      items: [{ name: 'Mofongo de chicharrón', price: 59500 }, { name: 'Presidente grande ×2', price: 65000 }],
      tax: 18, tip: 10,
    });
  });
  it('lo que no se leyó queda vacío en vez de inventado', () => {
    expect(toScan({ readable: true, merchant: '', date: '5 de nov', total: null, items: [{ name: 'Café', price: 120 }], tax_amount: 0, tip_amount: 0 }))
      .toEqual({ merchant: null, date: null, total: null, items: [{ name: 'Café', price: 12000 }], tax: 0, tip: 0 });
    expect(toScan({ readable: true, merchant: null, date: null, total: 500, items: [{ name: 'Algo', price: 100 }], tax_amount: 16, tip_amount: 0 }).tax).toBe(16);
  });
});

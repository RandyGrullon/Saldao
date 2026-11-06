import { tr } from '@saldao/core';
// Bloqueo con Face ID, huella o Windows Hello (WebAuthn con el lector del propio aparato). Es un candado para quien
// agarre el teléfono desbloqueado: la sesión y los datos siguen protegidos por la cuenta.
const KEY = 'saldao:bloqueo';
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function lockSupported(): Promise<boolean> {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}
export const lockOn = () => { try { return !!localStorage.getItem(KEY); } catch { return false; } };

export async function enableLock(name: string) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rand(32), rp: { name: tr("Saldao") }, user: { id: rand(16), name, displayName: name },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' }, timeout: 60000,
  } }) as PublicKeyCredential | null;
  if (!cred) throw new Error(tr("No se pudo activar el bloqueo"));
  localStorage.setItem(KEY, toB64(cred.rawId));
}
export const disableLock = () => { try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } };

/** Pide la huella o la cara. true si la persona es quien activó el bloqueo. */
export async function unlock(): Promise<boolean> {
  const id = localStorage.getItem(KEY);
  if (!id) return true;
  try {
    await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: fromB64(id) }], userVerification: 'required', timeout: 60000 } });
    return true;
  } catch { return false; }
}

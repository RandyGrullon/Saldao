// Avisos en la web (Web Push): el navegador se suscribe con la clave pública y la suscripción se guarda en la cuenta.
// En iPhone solo funcionan con la app instalada en la pantalla de inicio (iOS 16.4 o más nuevo).
import { APP, getBackend } from '@saldao/core';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const key = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
};

async function current() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
export async function pushOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  return !!(await current().catch(() => null));
}
export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('El navegador no dio permiso para avisos. Actívalo en la configuración del sitio.');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(APP.vapidPublicKey) });
  await getBackend()!.savePushToken('web', JSON.stringify(sub));
}
export async function disablePush() {
  const sub = await current();
  if (!sub) return;
  await getBackend()?.deletePushToken(JSON.stringify(sub)).catch(() => {});
  await sub.unsubscribe();
}

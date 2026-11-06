// Avisos: un Database Webhook de Supabase llama a esta función con cada fila nueva de public.activity. Busca a quién
// avisar (la gente del grupo con cuenta, menos quien lo hizo) y manda el aviso a sus navegadores (Web Push) y teléfonos
// (Expo). Las suscripciones que ya no existen se borran.
// Secretos: AVISOS_SECRETO (el mismo valor va en el encabezado x-avisos del webhook), VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT y, si se activó en Expo, EXPO_ACCESS_TOKEN. Se publica con --no-verify-jwt: el
// webhook no trae sesión de nadie y entra con el secreto.
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import { avisoDe, type ActivityRow } from '../_shared/avisos.ts';
import { parseSubscription, sendWebPush, type Vapid } from '../_shared/webpush.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const vapid: Vapid = {
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '', privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? '', subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:avisos@saldao.app',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Comparar sin que el tiempo delate cuántas letras coinciden. */
function same(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function sendExpo(msgs: { to: string; title: string; body: string; data: { path: string } }[]): Promise<string[]> {
  const gone: string[] = [];
  const token = Deno.env.get('EXPO_ACCESS_TOKEN');
  for (let i = 0; i < msgs.length; i += 100) {
    const batch = msgs.slice(i, i + 100).map(m => ({ ...m, sound: 'default', channelId: 'default', priority: 'high' }));
    const r = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', body: JSON.stringify(batch),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!r.ok) { console.error('expo', r.status, await r.text()); continue; }
    const { data } = await r.json() as { data?: { status: string; details?: { error?: string } }[] };
    data?.forEach((t, j) => { if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') gone.push(batch[j].to); });
  }
  return gone;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return reply({ error: 'Método no permitido' }, 405);
  if (!same(req.headers.get('x-avisos') ?? '', Deno.env.get('AVISOS_SECRETO') ?? '')) return reply({ error: 'No autorizado' }, 401);

  const payload = await req.json().catch(() => null) as { type?: string; table?: string; record?: ActivityRow } | null;
  const a = payload?.record;
  if (payload?.type !== 'INSERT' || payload.table !== 'activity' || !a?.id || !a.group_id || !a.actor) return reply({ skipped: 'no es un movimiento' });

  const [actor, group, expense] = await Promise.all([
    admin.from('profiles').select('name, user_id').eq('id', a.actor).maybeSingle(),
    admin.from('groups').select('name, kind').eq('id', a.group_id).maybeSingle(),
    a.expense_id ? admin.from('expenses').select('description, amount, currency, is_payment').eq('id', a.expense_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!actor.data?.user_id) return reply({ skipped: 'sin cuenta' });
  const aviso = avisoDe(a, { actorName: actor.data.name, group: group.data, expense: expense.data });
  if (!aviso) return reply({ skipped: a.verb });

  const { data: targets, error } = await admin.rpc('push_targets', { p_activity: a.id, p_user: actor.data.user_id });
  if (error) { console.error('push_targets', error.message); return reply({ error: 'No se pudo buscar a quién avisar' }, 500); }
  const list = (targets ?? []) as { token: string; kind: 'web' | 'expo' }[];
  if (!list.length) return reply({ sent: 0 });

  const gone: string[] = [];
  const web = list.filter(t => t.kind === 'web');
  if (web.length && vapid.publicKey && vapid.privateKey) {
    const res = await Promise.allSettled(web.map(async t => {
      const sub = parseSubscription(t.token);
      if (!sub) { gone.push(t.token); return; }
      const r = await sendWebPush(sub, { title: aviso.title, body: aviso.body, tag: aviso.tag, url: '/' }, vapid);
      if (r.gone) gone.push(t.token);
      else if (!r.ok) console.error('webpush', r.status, new URL(sub.endpoint).host);
    }));
    res.forEach(r => { if (r.status === 'rejected') console.error('webpush', String(r.reason)); });
  }
  const expo = list.filter(t => t.kind === 'expo' && /^Expo(nent)?PushToken\[.+\]$/.test(t.token));
  if (expo.length) gone.push(...await sendExpo(expo.map(t => ({ to: t.token, title: aviso.title, body: aviso.body, data: { path: aviso.path } }))).catch(e => { console.error('expo', String(e)); return []; }));

  if (gone.length) await admin.rpc('forget_push_tokens', { p_tokens: gone });
  return reply({ sent: list.length - gone.length, gone: gone.length });
});

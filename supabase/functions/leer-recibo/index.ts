// Leer un recibo: la app manda la foto (JPEG en base64, ya achicada a 1600 px) y Claude devuelve el negocio, la fecha,
// los ítems, el ITBIS y la ley con un formato fijo. Hasta 40 por persona al día (scan_quota, en la base).
// Secreto: ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets). Con verify_jwt: solo entra quien tiene sesión.
import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.109.0';
import { cors, json } from '../_shared/http.ts';
import { RECIBO_PROMPT, RECIBO_SCHEMA, toScan, type ReciboLeido } from '../_shared/recibo.ts';

const MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_B64 = 5_000_000; // ~3.7 MB de imagen; la app manda bastante menos
const anthropic = new Anthropic(); // lee ANTHROPIC_API_KEY

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Método no permitido' }, 405);

  const auth = req.headers.get('Authorization');
  if (!auth) return json(req, { error: 'Entra a tu cuenta para leer recibos.' }, 401);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });

  let image = '', mime = '';
  try { ({ image, mime } = await req.json()); } catch { /* abajo */ }
  if (typeof image !== 'string' || !image || image.length > MAX_B64 || !/^[A-Za-z0-9+/=\s]+$/.test(image.slice(0, 200))) {
    return json(req, { error: 'La foto no llegó bien. Prueba otra vez.' }, 400);
  }
  if (!MIMES.includes(mime as (typeof MIMES)[number])) return json(req, { error: 'Esa foto no es JPEG, PNG ni WebP.' }, 400);

  // la cuota se cuenta antes de mandar la foto: también sirve para saber que la sesión es válida
  const { data: ok, error: qErr } = await sb.rpc('scan_quota');
  if (qErr) return json(req, { error: 'Tu sesión venció. Vuelve a entrar.' }, 401);
  if (!ok) return json(req, { error: 'Ya leíste muchos recibos hoy. Mañana se puede de nuevo; mientras, anótalo a mano.' }, 429);

  try {
    const res = await anthropic.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: RECIBO_SCHEMA } },
      // si el modelo declina, la API reintenta sola con otro modelo (la misma llamada)
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: RECIBO_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime as (typeof MIMES)[number], data: image.replace(/\s/g, '') } },
          { type: 'text', text: 'Lee este recibo.' },
        ],
      }],
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      return json(req, { error: 'No se pudo leer este recibo. Anótalo a mano.' }, 422);
    }
    const text = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    const leido = JSON.parse(text) as ReciboLeido;
    if (!leido.readable) return json(req, { error: 'No se ve un recibo en la foto. Prueba con más luz y el papel derecho.' }, 422);
    const scan = toScan(leido);
    if (!scan.items.length && !scan.total) return json(req, { error: 'No se leyeron los montos. Prueba con una foto más clara.' }, 422);
    return json(req, scan);
  } catch (e) {
    if (e instanceof SyntaxError) return json(req, { error: 'No se pudo leer el recibo. Prueba otra vez.' }, 502);
    if (e instanceof Anthropic.RateLimitError) return json(req, { error: 'El lector está ocupado. Prueba en un minuto.' }, 503);
    if (e instanceof Anthropic.APIError) {
      console.error('anthropic', e.status, e.message);
      return json(req, { error: 'El lector de recibos no responde ahora. Prueba en un rato o anótalo a mano.' }, 502);
    }
    console.error(e);
    return json(req, { error: 'No se pudo leer el recibo.' }, 500);
  }
});

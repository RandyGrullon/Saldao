// Respuestas JSON con CORS solo para la web de Saldao (y localhost al desarrollar). La app nativa no manda Origin.
const SITES = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://saldao-green.vercel.app').split(',').map(s => s.trim()).filter(Boolean);
const allowed = (o: string | null) => !!o && (SITES.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o));

export function cors(req: Request): Record<string, string> {
  const o = req.headers.get('origin');
  return allowed(o) ? {
    'Access-Control-Allow-Origin': o!, Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  } : {};
}

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(req) } });

import type { Cents } from './domain';

const NF = new Intl.NumberFormat('en-US'); // en RD se escribe 1,234.56
const SYM: Record<string, string> = { DOP: 'RD$', USD: 'US$', EUR: '€' };
export const curSym = (c: string) => SYM[c] ?? c;

export function parts(c: Cents): [string, string] {
  const a = Math.abs(Math.round(c));
  return [NF.format(Math.floor(a / 100)), String(a % 100).padStart(2, '0')];
}
export function moneyT(c: Cents, cur = 'DOP') {
  const [i, d] = parts(c);
  return `${c < 0 ? '−' : ''}${curSym(cur)} ${i}.${d}`;
}
/** Lo que el teclado lleva escrito, con separador de miles: "1234.5" → "1,234.5". */
export function typed(s: string) {
  const [i, d] = s.split('.');
  return NF.format(Number(i) || 0) + (d !== undefined ? '.' + d : '');
}
export const parseMoney = (s: string) => Math.round(parseFloat(s.replace(/,/g, '')) * 100) || 0;

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const D = (s: string) => new Date(s.length === 10 ? s + 'T12:00:00' : s);
export const dayNum = (s: string) => D(s).getDate();
export const monShort = (s: string) => MES[D(s).getMonth()];
export const fdate = (s: string) => `${dayNum(s)} ${monShort(s)}`;
export const fday = (s: string) => { const d = D(s); const t = `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}`; return t[0].toUpperCase() + t.slice(1); };
export const ftime = (s: string) => { const d = D(s); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const pad2 = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD en hora local (a mano: el formato regional cambia entre navegadores y teléfonos). */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const today = () => isoDay(new Date());

export function ago(s: string, now = Date.now()) {
  const m = (now - D(s).getTime()) / 60000;
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${Math.round(m)} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  if (m < 2880) return 'ayer';
  if (m < 10080) return `hace ${Math.floor(m / 1440)} días`;
  return fdate(s); // fecha absoluta pasada una semana
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Usuario para entrar: igual que en la base (profiles.username).
export const USERNAME = /^[a-z0-9._]{3,20}$/;
export const USERNAME_RULE = 'De 3 a 20: minúsculas, números, punto o guion bajo.';
export const typedUser = (v: string) => v.toLowerCase().replace(/^@|\s/g, '');

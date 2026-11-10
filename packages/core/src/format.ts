import type { Cents } from './domain';
import { getLang, tr } from './i18n';

const NF = new Intl.NumberFormat('en-US'); // en RD se escribe 1,234.56

// ── monedas ──────────────────────────────────────────────────
// Los montos van siempre en centésimas de su moneda (también en yenes, para que todo se sume igual). El yen no tiene
// centavos: sus montos son siempre yenes redondos (múltiplos de 100) y se muestran sin decimales.
export const CURRENCIES = ['DOP', 'USD', 'EUR', 'CNY', 'JPY'] as const;
export type Currency = (typeof CURRENCIES)[number];
const SYM: Record<string, string> = { DOP: 'RD$', USD: 'US$', EUR: '€', CNY: 'CN¥', JPY: '¥' };
const NAME: Record<string, string> = { DOP: 'Peso dominicano', USD: 'Dólar', EUR: 'Euro', CNY: 'Yuan', JPY: 'Yen' };
export const curSym = (c: string) => SYM[c] ?? c;
/** El nombre de la moneda, en el idioma elegido. */
export const curName = (c: string) => tr(NAME[c] ?? c);
export const curDecimals = (c: string) => (c === 'JPY' ? 0 : 2);
/** Lo mínimo que se puede anotar, en centésimas: un centavo, o un yen (100). */
export const curStep = (c: string) => 10 ** (2 - curDecimals(c));
/** Un monto redondeado a lo que existe en esa moneda (en yenes, a yenes enteros). */
export const roundCur = (c: Cents, cur: string) => { const st = curStep(cur); return st === 1 ? Math.round(c) : Math.round(c / st) * st; };

/** La parte entera con miles y los decimales (vacíos en yenes). */
export function parts(c: Cents, cur = 'DOP'): [string, string] {
  const a = Math.abs(Math.round(c));
  if (!curDecimals(cur)) return [NF.format(Math.round(a / 100)), ''];
  return [NF.format(Math.floor(a / 100)), String(a % 100).padStart(2, '0')];
}
export function moneyT(c: Cents, cur = 'DOP') {
  const [i, d] = parts(c, cur);
  return `${c < 0 ? '−' : ''}${curSym(cur)} ${i}${d ? `.${d}` : ''}`;
}
/** Lo que el teclado lleva escrito, con separador de miles: "1234.5" → "1,234.5". */
export function typed(s: string) {
  const [i, d] = s.split('.');
  return NF.format(Number(i) || 0) + (d !== undefined ? '.' + d : '');
}
/**
 * Lo que una persona escribe como número, con el punto decimal de RD («1,234.56») o la coma de Europa («1.234,56»,
 * «12,50»). Con los dos signos, el último es el decimal. Una sola coma con 1 o 2 cifras detrás (o detrás de un 0) es
 * decimal; con 3 cifras («1,234») es de miles, como se escribe aquí. Un solo punto siempre es decimal. Lo que no es un
 * número da "".
 */
function normNum(raw: string | number | null | undefined): string {
  if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : '';
  let s = String(raw ?? '').replace(/[\s\u00a0']/g, '');
  const neg = /^[-−]/.test(s);
  s = s.replace(/^[-−+]/, '');
  if (!/^[\d.,]*\d[\d.,]*$/.test(s)) return '';
  const dots = (s.match(/\./g) ?? []).length, commas = (s.match(/,/g) ?? []).length;
  let int = s, dec = '';
  const cut = (sep: string) => { const i = s.lastIndexOf(sep); int = s.slice(0, i); dec = s.slice(i + 1); };
  if (dots && commas) cut(s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',');
  else if (dots === 1) cut('.');
  else if (commas === 1) { const after = s.slice(s.indexOf(',') + 1); if (after.length !== 3 || /^0*$/.test(s.slice(0, s.indexOf(',')))) cut(','); }
  // los miles van en grupos de tres: «12,50,3» o «1.2.3» no son números
  if (/[.,]/.test(int) && !/^\d{1,3}([.,]\d{3})+$/.test(int)) return '';
  int = int.replace(/[.,]/g, '');
  if (/[.,]/.test(dec)) return '';
  return `${neg ? '-' : ''}${int || '0'}${dec ? `.${dec}` : ''}`;
}
/** Un número escrito (ver normNum); 0 si no lo es. */
export const parseNum = (s: string | number | null | undefined) => { const n = Number(normNum(s)); return Number.isFinite(n) ? n : 0; };
/** Un monto escrito, en centésimas, redondeado a lo que existe en la moneda. Sin coma flotante: «1.005» son 101. */
export function parseMoney(s: string | number | null | undefined, cur = 'DOP'): Cents {
  const x = normNum(s);
  if (!x) return 0;
  const neg = x.startsWith('-'), [i, f = ''] = x.replace('-', '').split('.');
  const c = Number(i) * 100 + Number((f + '00').slice(0, 2)) + (Number(f[2] ?? 0) >= 5 ? 1 : 0);
  if (!Number.isFinite(c)) return 0;
  return roundCur(neg ? -c : c, cur) || 0;
}
/** Centésimas como texto para un campo: 1250 → "12.50"; en yenes, sin decimales. */
export const centsText = (c: Cents, cur = 'DOP') => (curDecimals(cur) ? (c / 100).toFixed(2) : String(Math.round(c / 100)));

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DIA_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS: Record<'es' | 'en', string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const en = () => getLang() === 'en';
const D = (s: string) => new Date(s.length === 10 ? s + 'T12:00:00' : s);
export const dayNum = (s: string) => D(s).getDate();
export const monShort = (s: string) => (en() ? MES_EN : MES)[D(s).getMonth()];
export const fdate = (s: string) => (en() ? `${monShort(s)} ${dayNum(s)}` : `${dayNum(s)} ${monShort(s)}`);
export const fday = (s: string) => {
  const d = D(s);
  if (en()) return `${DIA_EN[d.getDay()]}, ${MES_EN[d.getMonth()]} ${d.getDate()}`;
  const t = `${DIA[d.getDay()]} ${d.getDate()} ${MES[d.getMonth()]}`;
  return t[0].toUpperCase() + t.slice(1);
};
/** «Viernes 6 de noviembre» / «Friday, November 6»: el saludo de Inicio. */
export const longToday = (d = new Date()) => {
  if (en()) return `${DIA_EN[d.getDay()]}, ${MONTHS.en[d.getMonth()]} ${d.getDate()}`;
  const t = DIA[d.getDay()];
  return `${t[0].toUpperCase() + t.slice(1)} ${d.getDate()} de ${MONTHS.es[d.getMonth()]}`;
};
export const ftime = (s: string) => { const d = D(s); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const pad2 = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD en hora local (a mano: el formato regional cambia entre navegadores y teléfonos). */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const today = () => isoDay(new Date());

export function ago(s: string, now = Date.now()) {
  const m = (now - D(s).getTime()) / 60000;
  if (m < 1) return tr('ahora');
  if (m < 60) return tr("hace {0} min", Math.round(m));
  if (m < 1440) return tr("hace {0} h", Math.round(m / 60));
  if (m < 2880) return tr('ayer');
  if (m < 10080) return tr("hace {0} días", Math.floor(m / 1440));
  return fdate(s); // fecha absoluta pasada una semana
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Usuario para entrar: igual que en la base (profiles.username).
export const USERNAME = /^[a-z0-9._]{3,20}$/;
export const USERNAME_RULE = 'De 3 a 20: minúsculas, números, punto o guion bajo.';
export const typedUser = (v: string) => v.toLowerCase().replace(/^@|\s/g, '');

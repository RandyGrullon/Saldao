// Idiomas. La app está escrita en español; tr() devuelve el texto en inglés si se eligió inglés (diccionario en en.ts)
// y, si una frase no está en el diccionario, la deja en español. {0}, {1}… se cambian por los valores, en orden.
import { EN } from './en';

export type Lang = 'es' | 'en';
export const LANGS: [Lang, string][] = [['es', 'Español'], ['en', 'English']];
let lang: Lang = 'es';

export const getLang = () => lang;
export function setLang(l: string | null | undefined) { lang = l === 'en' ? 'en' : 'es'; }
/** El idioma que corresponde a un locale del teléfono o del navegador (la app empieza en español; esto es por si se quiere sugerir). */
export const guessLang = (locale?: string | null): Lang => (locale?.toLowerCase().startsWith('en') ? 'en' : 'es');
export const LANG_KEY = 'saldao:idioma';

/** Un mensaje de error para la pantalla: el del diccionario, o uno con números adentro que se arma aparte. */
const PATTERNS: [RegExp, string][] = [
  [/^La contraseña debe tener al menos (\d+) caracteres\.$/, 'Your password must be at least {0} characters.'],
];
export function trError(m: string): string {
  if (lang !== 'en') return m;
  if (EN[m]) return EN[m];
  for (const [r, en] of PATTERNS) { const x = m.match(r); if (x) return en.replace(/\{(\d+)\}/g, (_, i) => x[Number(i) + 1] ?? ''); }
  return m;
}

export function tr(es: string, ...args: unknown[]): string {
  const s = lang === 'en' ? EN[es] ?? es : es;
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s;
}

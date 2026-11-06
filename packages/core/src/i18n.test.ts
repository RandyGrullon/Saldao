// El inglés: tr() con y sin valores, y que toda frase que pasa por tr() en la web, la app nativa y el núcleo tenga su
// traducción (con los mismos {0}, {1}…). Si esto falla, agrega la frase a en.ts.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { EN } from './en';
import { fdate, fday, longToday } from './format';
import { cat } from './categories';
import { getLang, guessLang, setLang, tr, trError } from './i18n';

const ROOT = path.resolve(__dirname, '../../..');
const SAME = new Set(['RD$', 'Saldao', '.env.example', '.env.local', 'npm run dev:demo', 'already registered']); // no se traducen

function phrases() {
  const out = new Set<string>();
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (!/node_modules|\.expo|dist/.test(f.name)) walk(p); continue; }
      if (!/\.tsx?$/.test(f.name) || /\.test\.|db\.types|en\.ts$/.test(f.name)) continue;
      const sf = ts.createSourceFile(p, fs.readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true, p.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tr') {
          const a = n.arguments[0];
          if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) out.add(a.text);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  };
  for (const d of ['src', 'apps/mobile/src', 'packages/core/src']) walk(path.join(ROOT, d));
  return [...out];
}

afterEach(() => setLang('es'));

describe('idioma', () => {
  it('en español deja el texto y cambia los valores; en inglés traduce', () => {
    expect(tr('Hola, {0}', 'Ana')).toBe('Hola, Ana');
    setLang('en');
    expect(getLang()).toBe('en');
    expect(tr('Hola, {0}', 'Ana')).toBe('Hi, Ana');
    expect(tr('{0} te debe {1}', 'Ana', 'RD$ 5.00')).toBe('Ana owes you RD$ 5.00');
    expect(tr('Una frase que no está')).toBe('Una frase que no está');
    expect(trError('La contraseña debe tener al menos 8 caracteres.')).toBe('Your password must be at least 8 characters.');
    expect(trError('Correo o contraseña incorrectos.')).toBe('Wrong email or password.');
  });

  it('fechas, categorías y el idioma del teléfono', () => {
    setLang('en');
    expect(fdate('2026-11-06')).toBe('Nov 6');
    expect(fday('2026-11-06')).toBe('Friday, Nov 6');
    expect(longToday(new Date(2026, 10, 6))).toBe('Friday, November 6');
    expect(cat('super').name).toBe('Groceries');
    setLang('es');
    expect(fdate('2026-11-06')).toBe('6 nov');
    expect(longToday(new Date(2026, 10, 6))).toBe('Viernes 6 de noviembre');
    expect(cat('super').name).toBe('Supermercado');
    expect(guessLang('en-US')).toBe('en');
    expect(guessLang('es-DO')).toBe('es');
    expect(guessLang(undefined)).toBe('es');
  });

  it('toda frase de las apps tiene su traducción, con los mismos valores', () => {
    const ph = (k: string) => (k.match(/\{\d+\}/g) ?? []).sort().join();
    const missing = phrases().filter(k => /\p{L}/u.test(k) && !SAME.has(k) && !(k in EN));
    expect(missing).toEqual([]);
    expect(Object.entries(EN).filter(([k, v]) => ph(k) !== ph(v)).map(([k]) => k)).toEqual([]);
  });
});

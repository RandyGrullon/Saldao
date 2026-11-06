// El núcleo también lo usará la app nativa: nada del navegador, de Vite ni de React. Cada app pone eso por su lado.
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const dir = new URL('./', import.meta.url);
const FORBIDDEN = /\b(window|document|location|localStorage|sessionStorage|navigator|history|matchMedia)\s*[.(]|import\.meta\.env|from 'react/;

it('no usa nada del navegador, de Vite ni de React', () => {
  // en.ts es solo texto (dice «history.» en inglés, por ejemplo): no tiene código que revisar
  const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'en.ts');
  expect(files.length).toBeGreaterThan(5);
  for (const f of files) {
    const code = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code.match(FORBIDDEN)?.[0], f).toBeUndefined();
  }
});

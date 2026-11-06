// Los íconos de la app nativa, con el mismo dibujo de la web (public/favicon.svg): `node scripts/icons.mjs`.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const LIME = '#c8f169', INK = '#0e0f13';
const bars = (s, k = 1) => {
  // las dos barras del logo, centradas, a escala k del cuadrado de lado s
  const w = 240 / 512 * s * k, h = 44 / 512 * s * k, r = h / 2, x = (s - w) / 2, gap = 96 / 512 * s * k;
  const y1 = s / 2 - gap / 2 - h / 2, y2 = s / 2 + gap / 2 - h / 2;
  return `<rect x="${x}" y="${y1}" width="${w}" height="${h}" rx="${r}" fill="${INK}"/><rect x="${x}" y="${y2}" width="${w}" height="${h}" rx="${r}" fill="${INK}"/>`;
};
const svg = (s, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${body}</svg>`);

mkdirSync(new URL('../assets/', import.meta.url), { recursive: true });
const out = f => new URL(`../assets/${f}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// iOS redondea solo: el ícono va a sangre, sin transparencia.
await sharp(svg(1024, `<rect width="1024" height="1024" fill="${LIME}"/>${bars(1024)}`)).png().toFile(out('icon.png'));
// Android: el fondo lima va en app.json; el frente, con las barras dentro de la zona segura (66 % del centro).
await sharp(svg(1024, bars(1024, 0.72))).png().toFile(out('adaptive-icon.png'));
// La bienvenida: el ícono redondeado sobre el fondo de noche.
await sharp(svg(512, `<rect width="512" height="512" rx="112" fill="${LIME}"/>${bars(512)}`)).png().toFile(out('splash-icon.png'));
await sharp(svg(48, `<rect width="48" height="48" rx="11" fill="${LIME}"/>${bars(48)}`)).png().toFile(out('favicon.png'));
console.log('íconos listos');

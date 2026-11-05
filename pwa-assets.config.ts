import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// `npm run icons` genera los PNG del manifest y el apple-touch-icon a partir de public/favicon.svg.
// El ícono adaptable de Android y el de iPhone se rellenan con el mismo lima (sin borde blanco alrededor).
const lima = { resizeOptions: { background: '#c8f169' } };
export default defineConfig({
  preset: { ...preset, maskable: { ...preset.maskable, ...lima }, apple: { ...preset.apple, ...lima } },
  images: ['public/favicon.svg'],
});

import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// `npm run icons` genera los PNG del manifest y el apple-touch-icon a partir de public/favicon.svg.
export default defineConfig({ preset: minimal2023Preset, images: ['public/favicon.svg'] });

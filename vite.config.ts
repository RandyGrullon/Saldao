import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { APP } from './packages/core/src/app';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // la versión nueva espera a que la persona toque «Actualizar» (src/ui/update.tsx)
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: APP.name,
        short_name: APP.short,
        description: APP.description,
        lang: 'es-DO',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e0f13',
        theme_color: '#0e0f13',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // los términos y la privacidad son páginas propias, no la app
        navigateFallbackDenylist: [/^\/(terminos|privacidad)\.html$/],
        // los avisos (Web Push): el service worker los muestra y abre la app al tocarlos
        importScripts: ['push-sw.js'],
        runtimeCaching: [{
          urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
          handler: 'CacheFirst',
          options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
        }],
      },
    }),
  ],
  test: { environment: 'node', exclude: ['**/node_modules/**', 'apps/**'] },
});

/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'offline.html'],
      manifest: {
        name: 'Траектория',
        short_name: 'Траектория',
        description: 'Личный планировщик: фокус, направления, проекты и напоминания.',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        background_color: '#f1f0f4',
        theme_color: '#221f2c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/docs/, /^\/health/, /^\/ready/],
        runtimeCaching: [
          {
            // API не кешируем надолго: устаревший дедлайн опаснее отсутствия данных.
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@planner/contracts': path.resolve(root, '../../packages/contracts/src/index.ts'),
      '@planner/shared': path.resolve(root, '../../packages/shared/src/index.ts'),
      '@planner/ui/styles.css': path.resolve(root, '../../packages/ui/src/styles.css'),
      '@planner/ui': path.resolve(root, '../../packages/ui/src/index.ts'),
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_API_URL ?? 'http://localhost:3000', changeOrigin: true },
    },
  },
});

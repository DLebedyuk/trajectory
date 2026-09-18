/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      // Десктоп: файлы и так вшиты в exe, офлайн-кеш не нужен, а service
      // worker от прошлой сборки может залипнуть в профиле WebView2 и
      // подсовывать старый бандл поверх нового exe. selfDestroying сносит
      // такой SW и его кеш при следующем запуске вместо того, чтобы
      // регистрировать новый.
      selfDestroying: mode === 'desktop',
      // autoUpdate, а не prompt: интерфейса «доступна новая версия» у нас нет,
      // поэтому при prompt новый service worker вставал в очередь и навсегда
      // оставался ждать, а браузер продолжал отдавать старую сборку из кеша.
      registerType: 'autoUpdate',
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
        // новая сборка заменяет старую сразу, не дожидаясь закрытия всех вкладок
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
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
}));

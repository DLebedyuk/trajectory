import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from '@planner/ui';
import './styles/components.css';
import '@planner/ui/styles.css';
import './styles/app.css';
import { App } from './App.js';
import { applyTheme, useUiStore } from './store/ui.js';

applyTheme(useUiStore.getState().theme);

/*
  Без явной регистрации новый service worker тихо вставал в фоне, а вкладка
  продолжала показывать старую сборку до второй перезагрузки — «обновила,
  не появилось». registerSW при autoUpdate сам перезагружает страницу, как
  только новая версия взяла управление. Вкладка PWA живёт днями, поэтому
  раз в час ещё и спрашиваем сервер, нет ли новой сборки.
  На десктопе service worker не нужен (см. selfDestroying в vite.config).
*/
if (import.meta.env.MODE !== 'desktop') {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegisteredSW(_url, registration) {
        if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
      },
    });
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

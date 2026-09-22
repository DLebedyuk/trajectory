import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

/** Только desktop-сборка: собрана в mode=desktop, см. apps/web/.env.desktop и vite.config.ts. */
const IS_DESKTOP = import.meta.env.MODE === 'desktop';

/**
 * Полный сброс вместо простого location.reload(): в desktop-сборке у
 * WebView2 есть свой профиль, переживающий пересборку exe, и старый service
 * worker может годами отдавать закэшированный бандл поверх свежего кода.
 */
async function hardReload() {
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  window.location.reload();
}

type BrowserLoginState = 'idle' | 'waiting' | 'error';

/**
 * Google блокирует OAuth-вход из встроенного WebView (ошибка
 * disallowed_useragent), поэтому desktop-сборка ведёт человека в системный
 * браузер, а обратно в приложение возвращается через deep-link
 * traektoria://auth-callback?code=... — см. AuthService.createDesktopExchangeCode
 * на сервере. Код одноразовый и меняется на сессию тут же, отдельным
 * запросом из WebView.
 */
function useBrowserLogin(): { state: BrowserLoginState; start: () => void; cancel: () => void } {
  const [state, setState] = useState<BrowserLoginState>('idle');
  const queryClient = useQueryClient();
  const unlistenRef = useRef<null | (() => void)>(null);
  const cancelledRef = useRef(false);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      unlistenRef.current?.();
    },
    [],
  );

  const start = () => {
    if (!IS_DESKTOP) return;
    setState('waiting');
    cancelledRef.current = false;
    void (async () => {
      const [{ openUrl }, { onOpenUrl }] = await Promise.all([
        import('@tauri-apps/plugin-opener'),
        import('@tauri-apps/plugin-deep-link'),
      ]);
      const unlisten = await onOpenUrl(async (urls) => {
        const url = urls[0];
        if (!url) return;
        const code = new URL(url).searchParams.get('code');
        if (!code) {
          setState('error');
          return;
        }
        try {
          await api.auth.desktopExchange(code);
          if (cancelledRef.current) return;
          await queryClient.invalidateQueries({ queryKey: qk.authStatus });
        } catch {
          if (!cancelledRef.current) setState('error');
        }
      });
      unlistenRef.current = unlisten;
      if (cancelledRef.current) {
        unlisten();
        return;
      }
      await openUrl(api.auth.desktopLoginUrl());
    })();
  };

  const cancel = () => {
    cancelledRef.current = true;
    unlistenRef.current?.();
    unlistenRef.current = null;
    setState('idle');
  };

  return { state, start, cancel };
}

/**
 * Состояние неавторизованного пользователя. Показывается вместо приложения,
 * чтобы не мигать пустыми экранами и не делать запросов, которые всё равно
 * вернут 401.
 */
export function LoginPage({ googleConfigured }: { googleConfigured: boolean }) {
  const browserLogin = useBrowserLogin();

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="logo" aria-hidden="true" />
        <h1>Траектория</h1>
        <p className="sub">Личный планировщик, который считает пройденное, а не оставшееся.</p>

        {googleConfigured ? (
          IS_DESKTOP ? (
            browserLogin.state === 'waiting' ? (
              <>
                <p className="perm-note">Ждём вход в браузере…</p>
                <button type="button" className="google-btn" onClick={browserLogin.cancel}>
                  Отмена
                </button>
              </>
            ) : (
              <>
                {browserLogin.state === 'error' ? (
                  <p className="perm-note">Не получилось войти. Попробуйте ещё раз.</p>
                ) : null}
                <button type="button" className="google-btn" onClick={browserLogin.start}>
                  <GoogleLogo />
                  Войти через браузер
                </button>
                <p className="perm-note">
                  Мы запросим только <b>имя и почту</b>. Откроется системный браузер — Google не
                  пускает вход из окна приложения напрямую.
                </p>
              </>
            )
          ) : (
            <>
              <button
                type="button"
                className="google-btn"
                onClick={() => {
                  window.location.href = api.auth.loginUrl(window.location.href);
                }}
              >
                <GoogleLogo />
                Войти через Google
              </button>
              {/*
                Вход даёт только имя и почту. Доступ к календарю — отдельное
                согласие позже: это разные разрешения, и обещать одно вместо
                другого нечестно.
              */}
              <p className="perm-note">
                Мы запросим только <b>имя и почту</b>. Доступ к календарю — отдельно и позже, когда
                сами решите его подключить.
              </p>
            </>
          )
        ) : (
          <p className="perm-note">
            Вход через Google не настроен: на сервере нет <code>GOOGLE_CLIENT_ID</code> и{' '}
            <code>GOOGLE_CLIENT_SECRET</code>. Для локальной разработки можно включить{' '}
            <code>DEV_AUTH=true</code>.
          </p>
        )}

        <button type="button" className="reload-btn" onClick={() => void hardReload()}>
          Обновить
        </button>
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="g-logo" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.6z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
      <path
        fill="#EA4335"
        d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"
      />
    </svg>
  );
}

import { Button } from '@planner/ui';
import { api } from '../api/client.js';

/**
 * Состояние неавторизованного пользователя. Показывается вместо приложения,
 * чтобы не мигать пустыми экранами и не делать запросов, которые всё равно
 * вернут 401.
 */
export function LoginPage({ googleConfigured }: { googleConfigured: boolean }) {
  return (
    <div className="login">
      <div className="login-card">
        <svg width="34" height="34" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <path
            d="M2 21C5 21 6 5 10 5s5 12 8 12 3-8 6-8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity=".35"
          />
          <circle cx="10" cy="5" r="2.4" fill="var(--d-act)" />
          <circle cx="18" cy="17" r="2.4" fill="var(--d-eng)" />
          <circle cx="24" cy="9" r="2.4" fill="var(--d-vocal)" />
        </svg>
        <h1 style={{ fontSize: 24, marginTop: 14 }}>Траектория</h1>
        <p className="hint" style={{ marginTop: 8, fontSize: 13.5 }}>
          Личный планировщик, который считает пройденное, а не оставшееся.
        </p>

        {googleConfigured ? (
          <>
            <Button
              variant="primary"
              style={{ marginTop: 22, width: '100%', justifyContent: 'center' }}
              onClick={() => {
                window.location.href = api.auth.loginUrl(window.location.href);
              }}
            >
              Войти через Google
            </Button>
            <p className="quiet" style={{ marginTop: 14, lineHeight: 1.6 }}>
              Мы запросим только имя и почту. Доступ к календарю — отдельно и позже, когда сама
              решишь его подключить.
            </p>
          </>
        ) : (
          <div style={{ marginTop: 20 }}>
            <p className="hint">
              Вход через Google не настроен: на сервере нет <code>GOOGLE_CLIENT_ID</code> и{' '}
              <code>GOOGLE_CLIENT_SECRET</code>. Для локальной разработки можно включить{' '}
              <code>DEV_AUTH=true</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

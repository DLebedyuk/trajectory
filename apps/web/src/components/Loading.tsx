import { Button } from '@planner/ui';

export function Loading({ what = 'Загружаю' }: { what?: string }) {
  return (
    <p className="hint" style={{ padding: '24px 2px' }}>
      {what}…
    </p>
  );
}

/**
 * Ошибка загрузки. Если страница умеет перезапросить данные, показываем кнопку:
 * тупик без выхода — худшее, что можно показать вместо списка.
 */
export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Что-то пошло не так';
  return (
    <div className="card" style={{ borderColor: 'var(--d-act)' }}>
      <b style={{ fontSize: 14 }}>Не удалось загрузить данные</b>
      <p className="hint" style={{ marginTop: 6 }}>
        {message}. Проверьте, что API запущен на порту 3000.
      </p>
      {onRetry ? (
        <Button size="sm" style={{ marginTop: 10 }} onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}

export function Loading({ what = 'Загружаю' }: { what?: string }) {
  return (
    <p className="hint" style={{ padding: '24px 2px' }}>
      {what}…
    </p>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Что-то пошло не так';
  return (
    <div className="card" style={{ borderColor: 'var(--d-act)' }}>
      <b style={{ fontSize: 14 }}>Не удалось загрузить данные</b>
      <p className="hint" style={{ marginTop: 6 }}>
        {message}. Проверь, что API запущен на порту 3000.
      </p>
    </div>
  );
}

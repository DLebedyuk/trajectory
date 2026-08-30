import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, useToast } from '@planner/ui';
import { api, ApiError } from '../api/client.js';
import { qk } from '../api/queries.js';

/** Тот же переключатель, что в настройках: общий стиль .sw. */
function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className="sw"
      data-on={on}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
    >
      <i />
    </button>
  );
}

/**
 * Подключение Google Calendar — отдельное согласие, не связанное со входом.
 * Вход даёт только имя и почту; доступ к календарю человек разрешает здесь.
 */
export function CalendarCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const connection = useQuery({
    queryKey: qk.calendarConnection,
    queryFn: api.calendar.connection,
  });
  const list = useQuery({
    queryKey: qk.calendars,
    queryFn: api.calendar.list,
    enabled: connection.data?.connected === true,
  });

  const sync = useMutation({
    mutationFn: api.calendar.sync,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.calendars });
      void qc.invalidateQueries({ queryKey: qk.calendarConnection });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.show(`Синхронизировано: ${r.events} ${r.events === 1 ? 'событие' : 'событий'}`);
    },
    onError: (e) => toast.show(e instanceof ApiError ? e.message : 'Не удалось синхронизировать'),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => api.calendar.setEnabled(v.id, v.enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.calendars });
      sync.mutate();
    },
    onError: () => toast.show('Не удалось переключить календарь'),
  });

  const disconnect = useMutation({
    mutationFn: api.calendar.disconnect,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.calendarConnection });
      void qc.invalidateQueries({ queryKey: qk.calendars });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.show('Google Calendar отключён');
    },
    onError: () => toast.show('Не удалось отключить календарь'),
  });

  const c = connection.data;

  return (
    <div className="card">
      <h3 style={{ fontSize: 17, marginBottom: 10 }}>Google Calendar</h3>

      {connection.isPending ? <p className="hint">Проверяю подключение…</p> : null}
      {connection.isError ? (
        <div>
          <p className="hint" style={{ marginBottom: 10 }}>
            Не удалось узнать состояние подключения.
          </p>
          <Button size="sm" onClick={() => void connection.refetch()}>
            Повторить
          </Button>
        </div>
      ) : null}

      {c ? (
        <>
          <div className="setrow">
            <div className="setrow-main">
              <b>Доступ</b>
              <small>
                {c.revoked
                  ? 'Доступ отозван на стороне Google. Подключите заново.'
                  : c.connected
                    ? c.lastSyncAt
                      ? `Последняя синхронизация: ${new Date(c.lastSyncAt).toLocaleString('ru')}`
                      : 'Подключено, синхронизации ещё не было.'
                    : 'Вход в аккаунт не даёт доступа к календарю — это отдельное разрешение.'}
              </small>
            </div>
            <span className="tag" style={{ color: c.connected ? 'var(--good)' : undefined }}>
              {c.revoked ? 'отозван' : c.connected ? 'подключён' : 'не подключён'}
            </span>
          </div>

          {!c.encryptionReady ? (
            <p className="hint" style={{ marginTop: 10 }}>
              Сначала задайте <code>TOKEN_ENCRYPTION_KEY</code> в <code>.env</code>: без него
              refresh-токен Google негде хранить в зашифрованном виде.
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <Button
              size="sm"
              variant={c.connected && !c.revoked ? undefined : 'primary'}
              disabled={!c.encryptionReady}
              onClick={() => {
                window.location.href = api.calendar.connectUrl();
              }}
            >
              {c.connected && !c.revoked ? 'Подключить заново' : 'Подключить Google Calendar'}
            </Button>
            {c.connected && !c.revoked ? (
              <>
                <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
                  {sync.isPending ? 'Синхронизирую…' : 'Синхронизировать'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => disconnect.mutate()}>
                  Отключить
                </Button>
              </>
            ) : null}
          </div>

          {c.connected && !c.revoked ? (
            <div style={{ marginTop: 16 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>
                Какие календари показывать
              </div>
              {list.isPending ? <p className="hint">Загружаю список…</p> : null}
              {list.data?.length === 0 ? (
                <p className="hint">Календарей не нашлось. Попробуйте синхронизировать.</p>
              ) : null}
              {(list.data ?? []).map((cal) => (
                <div className="setrow" key={cal.id}>
                  <div className="setrow-main">
                    <b>{cal.name}</b>
                  </div>
                  <Toggle
                    on={cal.enabled}
                    label={`Показывать календарь ${cal.name}`}
                    onToggle={() => toggle.mutate({ id: cal.id, enabled: !cal.enabled })}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

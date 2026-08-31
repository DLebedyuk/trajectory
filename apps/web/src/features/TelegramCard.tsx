import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, useToast } from '@planner/ui';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

/**
 * Подключение Telegram одноразовым кодом: аккаунт связывается именно с тем,
 * кто нажал кнопку, а не с первым написавшим боту.
 */
export function TelegramCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const status = useQuery({ queryKey: qk.telegram, queryFn: api.telegram.status });

  const issue = useMutation({
    mutationFn: api.telegram.issueCode,
    onError: () => toast.show('Не удалось получить код'),
  });

  const disconnect = useMutation({
    mutationFn: api.telegram.disconnect,
    onSuccess: () => {
      issue.reset();
      void qc.invalidateQueries({ queryKey: qk.telegram });
      toast.show('Telegram отключён');
    },
    onError: () => toast.show('Не удалось отключить Telegram'),
  });

  const s = status.data;
  const code = issue.data;

  return (
    <div className="settings-card settings-wide">
      <h4>Telegram</h4>

      {status.isPending ? <p className="hint">Проверяю подключение…</p> : null}
      {status.isError ? (
        <div>
          <p className="hint" style={{ marginBottom: 10 }}>
            Не удалось узнать состояние подключения.
          </p>
          <Button size="sm" onClick={() => void status.refetch()}>
            Повторить
          </Button>
        </div>
      ) : null}

      {s ? (
        <>
          <div className="row">
            <div className="lbl">
              <b>Бот</b>
              <small>
                {s.connected
                  ? 'Аккаунт связан. Пиши боту «напомни завтра…» — напоминание создастся само.'
                  : 'Аккаунт не связан. Получи код и отправь его боту.'}
              </small>
            </div>
            <span className="tag" style={{ color: s.connected ? 'var(--good)' : undefined }}>
              {s.connected ? (s.username ? `@${s.username}` : 'подключён') : 'не подключён'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <Button size="sm" onClick={() => issue.mutate()} disabled={issue.isPending}>
              {s.connected ? 'Подключить заново' : 'Подключить Telegram'}
            </Button>
            {s.connected ? (
              <Button size="sm" variant="ghost" onClick={() => disconnect.mutate()}>
                Отключить
              </Button>
            ) : null}
          </div>

          {code ? (
            <div className="linkcode">
              <div className="lbl">Код действует 15 минут</div>
              <div className="linkcode-value mono">{code.code}</div>
              <p className="hint" style={{ marginTop: 8 }}>
                Отправь боту <code>/start {code.code}</code>. Код одноразовый.
              </p>
              {code.deepLink ? (
                <a
                  className="quiet-link"
                  href={code.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-block', marginTop: 8 }}
                >
                  Открыть бота с этим кодом
                </a>
              ) : (
                <p className="quiet" style={{ marginTop: 8 }}>
                  Готовая ссылка появится, когда в <code>.env</code> будет задано{' '}
                  <code>TELEGRAM_BOT_USERNAME</code>.
                </p>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

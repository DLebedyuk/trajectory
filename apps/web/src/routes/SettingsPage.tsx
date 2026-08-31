import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, useToast } from '@planner/ui';
import { api } from '../api/client.js';
import { TelegramCard } from '../features/TelegramCard.js';
import { CalendarCard } from '../features/CalendarCard.js';
import { qk, useSettings } from '../api/queries.js';
import { applyTheme, useUiStore } from '../store/ui.js';
import { ErrorBox, Loading } from '../components/Loading.js';

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const settings = useSettings();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof api.settings.update>[0]) => api.settings.update(patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.settings });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.show('Сохранено');
    },
  });

  if (settings.isLoading) return <Loading what="Загружаю настройки" />;
  if (settings.isError) return <ErrorBox error={settings.error} />;
  const s = settings.data;
  if (!s) return null;

  const Switch = ({
    on,
    onToggle,
    label,
  }: {
    on: boolean;
    onToggle: () => void;
    label: string;
  }) => (
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

  return (
    <>
      <PageHeader
        title="Настройки"
        subtitle="Жёсткие уведомления — только для реальных сроков. Всё остальное можно закрыть без последствий."
      />

      <div className="settings-grid">
        <div className="settings-card">
          <h4>Внешний вид</h4>
          <div className="row">
            <div className="lbl">
              <b>Тема</b>
              <small>«Авто» следует настройке устройства.</small>
            </div>
            <div className="seg" style={{ width: 220, flex: 'none' }}>
              {(['light', 'dark', 'system'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  data-on={theme === v}
                  onClick={() => {
                    setTheme(v);
                    applyTheme(v);
                  }}
                >
                  {v === 'light' ? 'Светлая' : v === 'dark' ? 'Тёмная' : 'Авто'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-card">
          <h4>Время и язык</h4>
          <div className="row">
            <div className="lbl">
              <b>Часовой пояс</b>
              <small>Сервер отправляет напоминания по нему, а не по времени браузера.</small>
            </div>
            <input
              type="text"
              defaultValue={s.timezone}
              style={{ width: 200, flex: 'none' }}
              onBlur={(e) =>
                e.target.value !== s.timezone && update.mutate({ timezone: e.target.value })
              }
            />
          </div>
          <div className="row">
            <div className="lbl">
              <b>Время дневной сводки</b>
              <small>Все напоминания без точного времени приходят одним сообщением.</small>
            </div>
            <input
              type="time"
              defaultValue={s.digestTime}
              style={{ width: 130, flex: 'none' }}
              onChange={(e) => update.mutate({ digestTime: e.target.value })}
            />
          </div>
        </div>

        <div className="settings-card settings-wide">
          <h4>Напоминания</h4>
          <div className="row">
            <div className="lbl">
              <b>Если не отметила</b>
              <small>
                По умолчанию приложение переспрашивает один раз вечером и больше не возвращается
                само.
              </small>
            </div>
          </div>
          <div className="chips" style={{ marginTop: -6 }}>
            {(
              [
                ['none', 'не переспрашивать'],
                ['evening', 'переспросить вечером'],
                ['nextDigest', 'в следующую сводку'],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                className={`chip${s.missedReminderBehavior === v ? ' is-active' : ''}`}
                aria-pressed={s.missedReminderBehavior === v}
                onClick={() => update.mutate({ missedReminderBehavior: v })}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <div className="lbl">
              <b>Жёсткие уведомления</b>
              <small>События с точным временем, задачи с реальными дедлайнами.</small>
            </div>
            <Switch
              on={s.hardNotifications}
              label="Жёсткие уведомления"
              onToggle={() => update.mutate({ hardNotifications: !s.hardNotifications })}
            />
          </div>
          <div className="row">
            <div className="lbl">
              <b>Мягкие уведомления</b>
              <small>Направления и фокус. Ответ «не сейчас» ничего не переносит в долг.</small>
            </div>
            <Switch
              on={s.softNotifications}
              label="Мягкие уведомления"
              onToggle={() => update.mutate({ softNotifications: !s.softNotifications })}
            />
          </div>
        </div>

        <TelegramCard />

        <CalendarCard />
      </div>
    </>
  );
}

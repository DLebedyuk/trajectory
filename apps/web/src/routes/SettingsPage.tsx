import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, useToast } from '@planner/ui';
import { api, ApiError } from '../api/client.js';
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
    onError: (e) => {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось сохранить настройки');
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
      <PageHeader title="Настройки" subtitle="Тема, время напоминаний, привязка Telegram и календаря." />

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
              <b>Время по умолчанию</b>
              <small>
                Напоминания без точного времени приходят в одно из трёх — утро, день или вечер.
              </small>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {(
                [
                  ['morningTime', 'Утро'],
                  ['dayTime', 'День'],
                  ['eveningTime', 'Вечер'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}
                >
                  {label}
                  <input
                    type="time"
                    defaultValue={s[key]}
                    style={{ width: 110 }}
                    onChange={(e) => update.mutate({ [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="settings-card settings-wide">
          <h4>Напоминания</h4>
          <div className="row">
            <div className="lbl">
              <b>Переспросить, если не отметили</b>
              <small>
                Включено — пропущенное дублируется в каждой следующей сводке, пока не отмечено
                готовым. Выключено — напомнит об этом только один раз.
              </small>
            </div>
            <Switch
              on={s.missedReminderRepeat}
              label="Переспросить, если не отметили"
              onToggle={() => update.mutate({ missedReminderRepeat: !s.missedReminderRepeat })}
            />
          </div>
        </div>

        <TelegramCard />

        <CalendarCard />
      </div>
    </>
  );
}

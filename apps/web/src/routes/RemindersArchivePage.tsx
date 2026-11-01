import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, PageHeader, useToast } from '@planner/ui';
import { formatLongDate, todayInTimezone } from '@planner/shared';
import type { Reminder } from '@planner/contracts';
import { api } from '../api/client.js';
import { qk, useRemindersArchive, useSettings } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

/**
 * Архив напоминаний за неделю. Отдельный маршрут, а не модалка: сюда
 * заходят проверить, что закрылось, а не сделать одно действие и уйти.
 * Сгруппирован по дню закрытия — так видно, что было сделано в какой день.
 */
export function RemindersArchivePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const archive = useRemindersArchive();
  const settings = useSettings();
  const timezone = settings.data?.timezone ?? 'UTC';

  const reopen = useMutation({
    mutationFn: (id: string) => api.reminders.reopen(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.reminders });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.show('Вернулось в список');
    },
    onError: () => toast.show('Не удалось вернуть'),
  });

  if (archive.isPending) return <Loading what="Загружаю архив" />;
  if (archive.isError)
    return <ErrorBox error={archive.error} onRetry={() => void archive.refetch()} />;

  const list = archive.data ?? [];
  // день закрытия — в часовом поясе человека, а не UTC: поздний вечер не должен
  // уезжать в завтрашний день
  const groups = new Map<string, Reminder[]>();
  for (const r of list) {
    const day = r.closedAt ? todayInTimezone(timezone, new Date(r.closedAt)) : r.scheduledDate;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)?.push(r);
  }

  return (
    <>
      <PageHeader
        onBack={() => navigate('/reminders')}
        backLabel="Напоминания"
        title="Архив напоминаний"
        subtitle="Выполненные напоминания уходят в архив и лежат там семь дней. Дальше приложение ничего не хранит на виду."
      />

      {list.length === 0 ? (
        <EmptyState
          title="За неделю ничего не закрывалось"
          description="Здесь появятся выполненные и удалённые напоминания."
        />
      ) : (
        <div>
          {[...groups.entries()].map(([day, items]) => (
            <section className="rem-section" key={day}>
              <div className="section-title">
                {formatLongDate(day)}
                <span className="ct">{items.length}</span>
              </div>
              {items.map((r) => (
                <div className="archive-row" key={r.id}>
                  <span className={`ttl${r.status === 'done' ? ' done' : ''}`}>{r.text}</span>
                  <span className="proj">{r.status === 'done' ? 'выполнено' : 'удалено'}</span>
                  <span className="date mono">{formatLongDate(r.scheduledDate)}</span>
                  {r.status === 'done' ? (
                    <Button size="sm" variant="ghost" onClick={() => reopen.mutate(r.id)}>
                      Вернуть
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

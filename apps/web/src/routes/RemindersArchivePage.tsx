import { useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader } from '@planner/ui';
import { formatLongDate } from '@planner/shared';
import { useRemindersArchive } from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

/**
 * Архив напоминаний за неделю. Отдельный маршрут, а не модалка: сюда
 * заходят проверить, что закрылось, а не сделать одно действие и уйти.
 */
export function RemindersArchivePage() {
  const navigate = useNavigate();
  const archive = useRemindersArchive();

  if (archive.isPending) return <Loading what="Загружаю архив" />;
  if (archive.isError)
    return <ErrorBox error={archive.error} onRetry={() => void archive.refetch()} />;

  const list = archive.data ?? [];

  return (
    <>
      <PageHeader
        onBack={() => navigate('/reminders')}
        backLabel="Напоминания"
        title="Архив напоминаний"
        subtitle="Последние семь дней. Дальше приложение ничего не хранит на виду."
      />

      {list.length === 0 ? (
        <EmptyState
          title="За неделю ничего не закрывалось"
          description="Здесь появятся выполненные и удалённые напоминания."
        />
      ) : (
        <div>
          {list.map((r) => (
            <div className="archive-row" key={r.id}>
              <span className={`ttl${r.status === 'done' ? ' done' : ''}`}>{r.text}</span>
              <span className="proj">{r.status === 'done' ? 'выполнено' : 'удалено'}</span>
              <span className="date mono">{formatLongDate(r.scheduledDate)}</span>
              <span />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

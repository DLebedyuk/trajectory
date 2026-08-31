import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, PageHeader, useToast } from '@planner/ui';
import { humanDate, plural, todayInTimezone } from '@planner/shared';
import { api } from '../api/client.js';
import {
  qk,
  useDashboard,
  useDirection,
  useDoneTasks,
  useProject,
  useTasks,
} from '../api/queries.js';
import { ErrorBox, Loading } from '../components/Loading.js';

const counted = (n: number) =>
  `${n} ${plural(n, 'завершённая задача', 'завершённые задачи', 'завершённых задач')}`;

/**
 * Архив завершённых задач направления: список по всем его проектам.
 * Отдельная страница, а не модалка: сюда приходят перечитывать сделанное,
 * а модалка ещё и ломалась при повторном открытии.
 */
export function DirectionArchivePage() {
  const { directionId = '' } = useParams();
  const navigate = useNavigate();
  const dashboard = useDashboard();
  const direction = useDirection(directionId);
  const done = useDoneTasks(directionId, true);

  const today = dashboard.data?.today ?? todayInTimezone('UTC');
  const tasks = done.data ?? [];

  if (done.isPending) return <Loading what="Загружаю завершённые задачи" />;
  if (done.isError) return <ErrorBox error={done.error} onRetry={() => void done.refetch()} />;

  return (
    <>
      <PageHeader
        onBack={() => navigate(`/directions/${directionId}`)}
        backLabel={direction.data?.name ?? 'Направление'}
        title="Архив направления"
        subtitle={
          tasks.length > 0
            ? `${counted(tasks.length)} по всем проектам направления.`
            : 'Завершённые задачи проектов этого направления собираются здесь.'
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="Пока ничего не завершено"
          description="Это не повод торопиться. Задачи попадут сюда сами, когда будут закрыты."
        />
      ) : (
        <div className="card">
          <div className="arch-list">
            {tasks.map((t) => (
              <Link className="arch-row" key={t.id} to={`/tasks/${t.id}`}>
                <span className="arch-title">{t.title}</span>
                <span className="arch-meta">
                  <b>{t.projectTitle}</b>
                  {t.completedAt ? ` · ${humanDate(t.completedAt.slice(0, 10), today)}` : ''}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Архив одного проекта: завершённые задачи с возможностью вернуть в работу. */
export function ProjectArchivePage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const dashboard = useDashboard();
  const project = useProject(projectId);
  const done = useTasks(projectId, { status: 'done' }, true);

  const today = dashboard.data?.today ?? todayInTimezone('UTC');
  const tasks = done.data ?? [];

  const reopen = useMutation({
    mutationFn: (taskId: string) => api.tasks.reopen(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      void qc.invalidateQueries({ queryKey: qk.project(projectId) });
      toast.show('Задача снова в работе');
    },
    // завершённый проект возврат задачи не разрешает — сервер объяснит почему
    onError: (e) => toast.show(e instanceof Error ? e.message : 'Не удалось вернуть задачу'),
  });

  if (done.isPending) return <Loading what="Загружаю завершённые задачи" />;
  if (done.isError) return <ErrorBox error={done.error} onRetry={() => void done.refetch()} />;

  return (
    <>
      <PageHeader
        onBack={() => navigate(`/projects/${projectId}`)}
        backLabel={project.data?.title ?? 'Проект'}
        title="Архив проекта"
        subtitle={
          tasks.length > 0 ? counted(tasks.length) : 'Закрытые задачи проекта собираются здесь.'
        }
      />

      {tasks.length === 0 ? (
        <EmptyState
          title="Пока ничего не завершено"
          description="Закрытые задачи проекта будут собираться здесь."
        />
      ) : (
        <div className="card">
          <div className="arch-list">
            {tasks.map((t) => (
              <div className="arch-row arch-row-static" key={t.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="arch-title done-strike">{t.title}</span>
                  <span className="arch-meta">
                    {t.completedAt
                      ? `завершена ${humanDate(t.completedAt.slice(0, 10), today)}`
                      : ''}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={() => reopen.mutate(t.id)}>
                  Вернуть
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

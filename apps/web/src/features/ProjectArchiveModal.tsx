import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, useToast } from '@planner/ui';
import { humanDate, plural } from '@planner/shared';
import { api } from '../api/client.js';
import { qk, useTasks } from '../api/queries.js';

/**
 * Архив проекта: завершённые задачи одного проекта.
 * Запрос живёт в модалке и повторяется при каждом открытии, поэтому список
 * не устаревает после того, как задачу вернули в работу.
 */
export function ProjectArchiveModal({
  projectId,
  projectTitle,
  today,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectTitle: string;
  today: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const done = useTasks(projectId, { status: 'done' }, open);
  const tasks = done.data ?? [];

  const reopen = useMutation({
    mutationFn: (taskId: string) => api.tasks.reopen(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      void qc.invalidateQueries({ queryKey: qk.project(projectId) });
      toast.show('Задача снова в работе');
    },
    onError: () => toast.show('Не удалось вернуть задачу'),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Архив проекта «${projectTitle}»`}
      description={
        done.isSuccess && tasks.length > 0
          ? `${tasks.length} ${plural(tasks.length, 'завершённая задача', 'завершённые задачи', 'завершённых задач')}`
          : undefined
      }
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Закрыть
        </Button>
      }
    >
      <div className="arch-list">
        {done.isPending ? <p className="hint">Загружаю завершённые задачи…</p> : null}

        {done.isError ? (
          <div>
            <p className="hint" style={{ marginBottom: 10 }}>
              Не удалось загрузить архив.
            </p>
            <Button size="sm" onClick={() => void done.refetch()}>
              Повторить
            </Button>
          </div>
        ) : null}

        {done.isSuccess && tasks.length === 0 ? (
          <p className="hint">В этом проекте пока ничего не завершено.</p>
        ) : null}

        {tasks.map((t) => (
          <div className="arch-row arch-row-static" key={t.id}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="arch-title done-strike">{t.title}</span>
              <span className="arch-meta">
                {t.completedAt ? `завершена ${humanDate(t.completedAt.slice(0, 10), today)}` : ''}
              </span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => reopen.mutate(t.id)}>
              Вернуть
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Modal } from '@planner/ui';
import { api } from '../api/client.js';
import { qk } from '../api/queries.js';

/**
 * Выбор активной задачи. Задачи всегда показываются сгруппированными по
 * проекту — без проекта задача не существует.
 */
export function PickTaskModal({
  open,
  onOpenChange,
  excludeTaskId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  excludeTaskId?: string | null;
  onPick: (taskId: string) => void;
}) {
  const [directionId, setDirectionId] = useState<string>('');
  const directions = useQuery({
    queryKey: qk.directions,
    queryFn: api.directions.list,
    enabled: open,
  });
  const projects = useQuery({
    queryKey: ['pick-projects', directionId],
    queryFn: () => api.projects.listByDirection(directionId),
    enabled: open && Boolean(directionId),
  });
  const tasks = useQuery({
    queryKey: ['pick-tasks', directionId],
    queryFn: async () => {
      const list = projects.data ?? [];
      const result = await Promise.all(
        list
          .filter((p) => p.status !== 'archived')
          .map(async (p) => ({ project: p, tasks: await api.tasks.listByProject(p.id) })),
      );
      return result;
    },
    enabled: open && Boolean(directionId) && Boolean(projects.data),
  });

  const groups = useMemo(
    () =>
      (tasks.data ?? [])
        .map((g) => ({
          ...g,
          tasks: g.tasks.filter((t) => t.id !== excludeTaskId),
        }))
        .filter((g) => g.tasks.length > 0),
    [tasks.data, excludeTaskId],
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Что сделать активным"
      description="Активной может быть только одна задача. Предыдущая останется обычной открытой задачей."
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Закрыть
        </Button>
      }
    >
      <div className="field">
        <span className="lbl">Направление</span>
        <div className="chips">
          {(directions.data ?? []).map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip"
              data-on={directionId === d.id}
              onClick={() => setDirectionId(d.id)}
            >
              <i className="dot" style={{ background: `var(${d.color})` }} />
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        {!directionId ? (
          <p className="hint">Выберите направление.</p>
        ) : groups.length === 0 ? (
          <p className="hint">Открытых задач нет.</p>
        ) : (
          groups.map((g) => (
            <div key={g.project.id} style={{ marginBottom: 12 }}>
              <div className="lbl" style={{ marginBottom: 6 }}>
                {g.project.title}
              </div>
              {g.tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="pick-row"
                  onClick={() => {
                    onPick(t.id);
                    onOpenChange(false);
                  }}
                >
                  <span className="ttl">{t.title}</span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

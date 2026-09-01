import { Button, Modal, useToast } from '@planner/ui';
import { formatLongDate, plural } from '@planner/shared';
import { useProjects, useToggleProjectPin } from '../api/queries.js';

/**
 * Выбор закреплённого проекта направления. Закреплённый проект в направлении
 * один: выбор нового снимает старый — это делает сервер в одной транзакции,
 * здесь просто список.
 *
 * Показываются только живые проекты: закреплять завершённый бессмысленно,
 * а проект на паузе — значит вернуть его в работу, для этого есть его страница.
 */
export function PickPinnedProjectModal({
  open,
  onOpenChange,
  directionId,
  directionName,
  pinnedProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directionId: string;
  directionName: string;
  pinnedProjectId: string | null;
}) {
  const toast = useToast();
  const projects = useProjects(directionId);
  const toggle = useToggleProjectPin();

  const list = (projects.data ?? []).filter((p) => p.status === 'active');

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Закреплённый проект"
      description={`Один проект направления «${directionName}», который сейчас перед глазами. Сменится фокус — сменится и он.`}
      footer={
        <>
          {pinnedProjectId ? (
            <Button
              variant="ghost"
              onClick={() =>
                toggle.mutate(
                  { projectId: pinnedProjectId, pinned: true },
                  {
                    onSuccess: () => {
                      toast.show('Закрепление снято');
                      onOpenChange(false);
                    },
                  },
                )
              }
            >
              Снять закрепление
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </>
      }
    >
      {projects.isPending ? <p className="hint">Загружаю проекты…</p> : null}
      {!projects.isPending && list.length === 0 ? (
        <p className="hint">
          В этом направлении нет активных проектов. Закреплять пока нечего — и это нормально.
        </p>
      ) : null}
      {list.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`pick-row${p.id === pinnedProjectId ? ' is-active' : ''}`}
          aria-pressed={p.id === pinnedProjectId}
          onClick={() =>
            toggle.mutate(
              { projectId: p.id, pinned: p.id === pinnedProjectId },
              {
                onSuccess: () => {
                  toast.show(
                    p.id === pinnedProjectId ? 'Закрепление снято' : `Закреплён: ${p.title}`,
                  );
                  onOpenChange(false);
                },
              },
            )
          }
        >
          <span className="ttl">{p.title}</span>
          <span className="meta">
            {p.openTaskCount
              ? `${p.openTaskCount} ${plural(p.openTaskCount, 'задача', 'задачи', 'задач')}`
              : 'без открытых задач'}
            {p.deadline ? ` · срок ${formatLongDate(p.deadline)}` : ''}
          </span>
        </button>
      ))}
    </Modal>
  );
}

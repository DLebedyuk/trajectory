import { Link } from 'react-router-dom';
import { Button, Modal } from '@planner/ui';
import { humanDate, plural } from '@planner/shared';
import { useDoneTasks } from '../api/queries.js';

/**
 * Архив направления: завершённые задачи всех его проектов одним списком.
 * Проект показан у каждой задачи — иначе список нечитаем.
 */
export function DirectionArchiveModal({
  directionId,
  directionName,
  today,
  open,
  onOpenChange,
}: {
  directionId: string;
  directionName: string;
  today: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  // запрос уходит только при открытой модалке и повторяется при каждом открытии
  const done = useDoneTasks(directionId, open);
  const tasks = done.data ?? [];

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Архив направления «${directionName}»`}
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
          <p className="hint">
            Здесь появятся завершённые задачи проектов этого направления. Пока ни одной — это не
            повод торопиться.
          </p>
        ) : null}

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
    </Modal>
  );
}

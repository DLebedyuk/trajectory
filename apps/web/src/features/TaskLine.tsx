import { IconPin, IconPinFilled } from '@planner/ui';
import { DURATION_LABEL, formatLongDate } from '@planner/shared';
import type { Task } from '@planner/contracts';

/**
 * Строка задачи в проекте. Никаких меток «обязательная» или «бэклог» —
 * все незавершённые задачи равноправны, выделяется только активная.
 *
 * Активность и закрепление — разные вещи и показываются по-разному:
 * активная задача подсвечена целиком, закреплённая помечена булавкой.
 */
export function TaskLine({
  task,
  isActive,
  directionColor,
  onOpen,
  onComplete,
  onTogglePin,
}: {
  task: Task;
  isActive: boolean;
  directionColor: string;
  onOpen: () => void;
  onComplete: () => void;
  onTogglePin: () => void;
}) {
  const done = task.checklist.filter((c) => c.completed).length;
  const isDone = task.status === 'done';

  const meta = [
    task.deadline
      ? `до ${formatLongDate(task.deadline)}${task.exactTime ? `, ${task.exactTime}` : ''}`
      : null,
    task.estimatedDuration ? DURATION_LABEL[task.estimatedDuration] : null,
    task.checklist.length > 0 ? `${done} из ${task.checklist.length}` : null,
  ].filter(Boolean);

  return (
    <div
      className={`task-row${isActive ? ' is-active' : ''}`}
      style={{ ['--c' as string]: `var(${directionColor})` }}
    >
      <button
        type="button"
        className={`check${isDone ? ' done' : ''}`}
        aria-label={isDone ? `Вернуть в работу: ${task.title}` : `Выполнить: ${task.title}`}
        onClick={onComplete}
      />
      <button type="button" className={`tname${isDone ? ' done' : ''}`} onClick={onOpen}>
        {task.title}
      </button>
      {meta.length > 0 ? <span className="tmeta">{meta.join(' · ')}</span> : null}
      <button
        type="button"
        className={`pin${task.pinned ? ' is-pinned' : ''}`}
        aria-label={task.pinned ? `Открепить: ${task.title}` : `Закрепить: ${task.title}`}
        title={task.pinned ? 'Открепить' : 'Закрепить'}
        onClick={onTogglePin}
      >
        {task.pinned ? <IconPinFilled /> : <IconPin />}
      </button>
    </div>
  );
}

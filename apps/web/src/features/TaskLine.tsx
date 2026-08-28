import { Checkbox, IconClock, IconPin, IconPinFilled } from '@planner/ui';
import { DURATION_LABEL, formatLongDate } from '@planner/shared';
import type { Task } from '@planner/contracts';

/**
 * Строка задачи в проекте. Никаких меток «обязательная» или «бэклог» —
 * все незавершённые задачи равноправны, выделяется только активная.
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
  return (
    <div
      className="tline"
      data-active={isActive}
      style={{ ['--tc' as string]: `var(${directionColor})` }}
    >
      <Checkbox
        checked={task.status === 'done'}
        onChange={onComplete}
        label={`Выполнить: ${task.title}`}
      />
      <button type="button" className="tline-main" onClick={onOpen}>
        <div className="tline-title">
          {task.title}
          {isActive ? (
            <span className="quiet" style={{ marginLeft: 5 }}>
              сейчас
            </span>
          ) : null}
        </div>
        <div className="tline-meta">
          {task.deadline ? (
            <i>
              <IconClock />
              до {formatLongDate(task.deadline)}
              {task.exactTime ? `, ${task.exactTime}` : ''}
            </i>
          ) : null}
          {task.estimatedDuration ? <i>{DURATION_LABEL[task.estimatedDuration]}</i> : null}
          {task.checklist.length > 0 ? (
            <i>
              {done} из {task.checklist.length}
            </i>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        className="pinbtn"
        data-on={task.pinned}
        aria-label={task.pinned ? 'Открепить' : 'Закрепить'}
        title={task.pinned ? 'Открепить' : 'Закрепить'}
        onClick={onTogglePin}
      >
        {task.pinned ? <IconPinFilled /> : <IconPin />}
      </button>
    </div>
  );
}

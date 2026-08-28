import { Checkbox } from './Checkbox.js';
import { IconX } from './icons.js';

export interface ProjectTaskCardProps {
  projectTitle: string;
  taskTitle: string;
  directionName: string;
  directionColor: string;
  meta?: string | null;
  onOpen: () => void;
  onComplete: () => void;
  onUnpin?: () => void;
}

/**
 * Закреплённая задача — всегда в формате «проект → задача → направление».
 * Отдельного закрепления проекта не существует.
 */
export function ProjectTaskCard({
  projectTitle,
  taskTitle,
  directionName,
  directionColor,
  meta,
  onOpen,
  onComplete,
  onUnpin,
}: ProjectTaskCardProps) {
  return (
    <div className="pincard" style={{ ['--pc' as string]: `var(${directionColor})` }}>
      <Checkbox checked={false} onChange={onComplete} label={`Выполнить: ${taskTitle}`} />
      <button type="button" className="pc-body" onClick={onOpen}>
        <span className="pc-proj">{projectTitle}</span>
        <span className="pc-task" style={{ display: 'block' }}>
          {taskTitle}
        </span>
        <span className="pc-meta">
          <i className="dot" style={{ background: `var(${directionColor})` }} />
          {directionName}
          {meta ? <span>· {meta}</span> : null}
        </span>
      </button>
      {onUnpin ? (
        <button type="button" className="unpin" onClick={onUnpin} aria-label="Открепить">
          <IconX />
        </button>
      ) : null}
    </div>
  );
}

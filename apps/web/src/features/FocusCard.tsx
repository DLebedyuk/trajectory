import { useNavigate } from 'react-router-dom';
import { Button, OverflowMenu } from '@planner/ui';
import { DURATION_LABEL, formatLongDate } from '@planner/shared';
import type { Focus, Project } from '@planner/contracts';

export interface FocusCardProps {
  focus: Focus;
  /** Закреплённый проект направления в фокусе. Один или ни одного. */
  pinnedProject: Project | null;
  onOpenPinned: () => void;
  onComplete: () => void;
  onPickTask: () => void;
  onClearActive: () => void;
  onChangeDirection: () => void;
  onClearFocus: () => void;
}

/**
 * Блок фокуса. Показывает связку направление → закреплённый проект →
 * активная задача. Закреплённый проект принадлежит направлению, а не
 * приложению: меняется фокус — меняется и он, выбирать заново не нужно.
 *
 * Частые действия — выполнить и открыть — остаются кнопками. Редкие уезжают
 * в «···», но не исчезают: «Убрать активную» и «Очистить фокус» — разные
 * операции, и подменять одну другой нельзя.
 */
export function FocusCard({
  focus,
  pinnedProject,
  onOpenPinned,
  onComplete,
  onPickTask,
  onClearActive,
  onChangeDirection,
  onClearFocus,
}: FocusCardProps) {
  const navigate = useNavigate();

  if (!focus.direction) {
    return (
      <section className="card focus-none" aria-label="Фокус">
        <div className="focus-none-title">Сейчас без фокуса</div>
        <p className="hint">Обязательные дела всё равно придут сверху, а направления подождут.</p>
        <Button size="sm" onClick={onChangeDirection}>
          Выбрать направление
        </Button>
      </section>
    );
  }

  const direction = focus.direction;
  const task = focus.activeTask;
  const meta = task
    ? [
        task.deadline ? `до ${formatLongDate(task.deadline)}` : null,
        task.estimatedDuration ? DURATION_LABEL[task.estimatedDuration] : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <section className="focus-block" aria-label="Фокус">
      <div className="label">В фокусе</div>

      <div className="chain">
        <span
          className="dir-glyph sm"
          style={{ ['--c' as string]: `var(${direction.color})` }}
          aria-hidden="true"
        >
          {direction.name.charAt(0)}
        </span>
        <span>{direction.name}</span>
        {pinnedProject ? (
          <>
            <span className="sep">→</span>
            <button
              type="button"
              className="proj"
              onClick={() => navigate(`/projects/${pinnedProject.id}`)}
            >
              {pinnedProject.title}
            </button>
          </>
        ) : null}
        {/*
          Задача может лежать в другом проекте направления, чем закреплённый —
          тогда показываем оба звена, иначе связка врала бы.
        */}
        {task && task.projectId !== pinnedProject?.id ? (
          <>
            <span className="sep">→</span>
            <button
              type="button"
              className="proj"
              onClick={() => navigate(`/projects/${task.projectId}`)}
            >
              {task.projectTitle}
            </button>
          </>
        ) : null}
      </div>

      {task ? (
        <>
          {/* открытие задачи — клик по самой строке, отдельная кнопка не нужна */}
          <button
            type="button"
            className="active-task"
            onClick={() => navigate(`/tasks/${task.id}`)}
          >
            {task.title}
            <span className="focus-state active">активная</span>
          </button>
          {meta ? <div className="focus-meta">{meta}</div> : null}

          <div className="actions">
            <OverflowMenu
              items={[
                { label: 'Выбрать другую задачу', onSelect: onPickTask },
                { label: 'Убрать активную задачу', onSelect: onClearActive },
                {
                  label: pinnedProject ? 'Сменить закреплённый проект' : 'Закрепить проект',
                  onSelect: onOpenPinned,
                },
                { label: 'Сменить направление', onSelect: onChangeDirection },
                { label: 'Очистить фокус', onSelect: onClearFocus },
              ]}
            />
            <button type="button" className="btn primary complete-btn" onClick={onComplete}>
              Выполнить
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="active-task">Задача не выбрана</div>
          <div className="actions">
            <button type="button" className="btn primary" onClick={onPickTask}>
              Выбрать задачу
            </button>
            <OverflowMenu
              items={[
                {
                  label: pinnedProject ? 'Сменить закреплённый проект' : 'Закрепить проект',
                  onSelect: onOpenPinned,
                },
                { label: 'Сменить направление', onSelect: onChangeDirection },
                { label: 'Очистить фокус', onSelect: onClearFocus },
              ]}
            />
          </div>
        </>
      )}
    </section>
  );
}

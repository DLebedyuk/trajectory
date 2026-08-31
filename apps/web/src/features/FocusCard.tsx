import { useNavigate } from 'react-router-dom';
import { Button, OverflowMenu } from '@planner/ui';
import { DURATION_LABEL, formatLongDate } from '@planner/shared';
import type { Focus } from '@planner/contracts';

export interface FocusCardProps {
  focus: Focus;
  onComplete: () => void;
  onPickTask: () => void;
  onClearActive: () => void;
  onChangeDirection: () => void;
  onClearFocus: () => void;
}

/**
 * Блок фокуса. Всегда показывает связку направление → проект → задача:
 * отдельной сущности «главный проект» или «следующий шаг» здесь нет.
 *
 * Частые действия — выполнить и открыть — остаются кнопками. Редкие уезжают
 * в «···», но не исчезают: «Убрать активную» и «Очистить фокус» — разные
 * операции, и подменять одну другой нельзя.
 */
export function FocusCard({
  focus,
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
        {task ? (
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
          <div className="active-task">
            {task.title}
            <span className="focus-state active">активная</span>
          </div>
          {meta ? <div className="focus-meta">{meta}</div> : null}

          <div className="actions">
            <button type="button" className="btn primary" onClick={onComplete}>
              Выполнить
            </button>
            <button type="button" className="btn" onClick={() => navigate(`/tasks/${task.id}`)}>
              Открыть задачу
            </button>
            <button type="button" className="btn" onClick={onPickTask}>
              Выбрать другую задачу
            </button>
            <OverflowMenu
              items={[
                { label: 'Убрать активную задачу', onSelect: onClearActive },
                { label: 'Сменить направление', onSelect: onChangeDirection },
                { label: 'Очистить фокус', onSelect: onClearFocus },
              ]}
            />
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

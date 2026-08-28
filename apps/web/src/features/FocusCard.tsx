import { useNavigate } from 'react-router-dom';
import { Button, Checkbox } from '@planner/ui';
import { DURATION_LABEL, formatLongDate } from '@planner/shared';
import type { Focus } from '@planner/contracts';
import { Glyph } from '../components/Glyph.js';

export interface FocusCardProps {
  focus: Focus;
  onComplete: () => void;
  onPickTask: () => void;
  onClearActive: () => void;
  onChangeDirection: () => void;
  onClearFocus: () => void;
}

/**
 * Активная задача всегда показывается связкой направление → проект → задача.
 * Отдельной карточки «главный проект» больше нет.
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
      <div className="focus-empty">
        <div style={{ fontFamily: 'Literata, serif', fontSize: 18, marginBottom: 6 }}>
          Сейчас без фокуса
        </div>
        <p className="hint" style={{ maxWidth: '48ch', margin: '0 auto 16px' }}>
          Обязательные дела всё равно придут сверху, а направления подождут.
        </p>
        <Button size="sm" onClick={onChangeDirection}>
          Выбрать направление
        </Button>
      </div>
    );
  }

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
    <section
      className="focusbar"
      style={{ ['--fc' as string]: `var(${focus.direction.color})` }}
      aria-label="Фокус"
    >
      <div className="fb-dir">
        <Glyph name={focus.direction.name} color={focus.direction.color} />
        <span className="lbl">В фокусе</span>
        <b style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
          {focus.direction.name}
        </b>
      </div>

      {task ? (
        <>
          <div className="fb-proj">
            <button type="button" onClick={() => navigate(`/projects/${task.projectId}`)}>
              {task.projectTitle}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginTop: 10 }}>
            <Checkbox
              checked={false}
              onChange={onComplete}
              label={`Выполнить активную задачу: ${task.title}`}
              size={23}
            />
            <div style={{ flex: 1 }}>
              <div className="lbl">Сейчас занимаюсь</div>
              <div className="fb-task">{task.title}</div>
              {meta ? (
                <div className="tline-meta" style={{ marginTop: 7 }}>
                  <i>{meta}</i>
                </div>
              ) : null}
            </div>
          </div>
          <div className="fb-acts">
            <Button size="sm" onClick={() => navigate(`/tasks/${task.id}`)}>
              Открыть задачу
            </Button>
            <Button size="sm" variant="ghost" onClick={onPickTask}>
              Выбрать другую задачу
            </Button>
            <Button size="sm" variant="ghost" onClick={onClearActive}>
              Убрать активную
            </Button>
            <Button size="sm" variant="ghost" onClick={onChangeDirection}>
              Сменить направление
            </Button>
            <Button size="sm" variant="ghost" onClick={onClearFocus}>
              Очистить фокус
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 12, fontSize: 14 }}>
            Сейчас ничего не выбрано.
          </p>
          <div className="fb-acts">
            <Button size="sm" onClick={onPickTask}>
              Выбрать задачу
            </Button>
            <Button size="sm" variant="ghost" onClick={onChangeDirection}>
              Сменить направление
            </Button>
            <Button size="sm" variant="ghost" onClick={onClearFocus}>
              Очистить фокус
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

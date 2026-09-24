import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatLongDate } from '@planner/shared';
import type { TaskWithContext } from '@planner/contracts';

/**
 * Задачи, чей срок прошёл. Живут отдельной карточкой под фокусом, а не в
 * ленте «Сегодня»: там напоминания и расписание дня, а это хвост задач из
 * проектов — смешивать их нельзя. Список по-прежнему свёрнут: он должен быть
 * доступен, но не должен давить каждый день.
 */
export function OverdueTasksCard({
  tasks,
  onComplete,
}: {
  tasks: TaskWithContext[];
  onComplete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (tasks.length === 0) return null;

  return (
    <section className="card today-block" aria-label="Просроченные задачи">
      <h4>Задачи с прошедшим сроком</h4>
      <button
        type="button"
        className="overdue-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Просрочено: {tasks.length} {open ? '· свернуть' : '· посмотреть'}
      </button>
      {open
        ? tasks.map((t) => (
            <div className="t-row" key={t.id}>
              <span className="time mono">{t.deadline ? formatLongDate(t.deadline) : '—'}</span>
              <button
                type="button"
                className="check"
                aria-label={`Выполнить: ${t.title}`}
                onClick={() => onComplete(t.id)}
              />
              <Link className="ttl" to={`/tasks/${t.id}`}>
                {t.title}
              </Link>
              <span className="meta">{t.projectTitle}</span>
            </div>
          ))
        : null}
    </section>
  );
}

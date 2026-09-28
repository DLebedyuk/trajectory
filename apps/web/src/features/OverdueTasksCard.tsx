import { Link } from 'react-router-dom';
import { formatLongDate } from '@planner/shared';
import type { TaskWithContext } from '@planner/contracts';

/**
 * Задачи, чей срок прошёл. Живут отдельной карточкой под фокусом, а не в
 * ленте «Сегодня»: там напоминания и расписание дня, а это хвост задач из
 * проектов — смешивать их нельзя. Раз карточка своя и стоит ниже фокуса,
 * сворачивать список незачем: он оформлен так же, как дедлайны дня.
 */
export function OverdueTasksCard({
  tasks,
  onComplete,
}: {
  tasks: TaskWithContext[];
  onComplete: (id: string) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <section className="card today-block" aria-label="Просроченные задачи">
      <h4>Задачи с прошедшим сроком</h4>
      {tasks.map((t) => (
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
          <span className="meta">
            <i className="dir-dot" style={{ ['--c' as string]: `var(${t.directionColor})` }} />
            {t.projectTitle} · {t.directionName}
          </span>
        </div>
      ))}
    </section>
  );
}

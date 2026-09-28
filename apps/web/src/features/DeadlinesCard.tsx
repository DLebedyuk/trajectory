import { Link } from 'react-router-dom';
import { formatLongDate } from '@planner/shared';
import type { TaskWithContext } from '@planner/contracts';

/**
 * Задачи со сроком — одним блоком под календарём: сначала просроченные, потом
 * сегодняшние. Это задачи из проектов, а не напоминания, поэтому от ленты
 * напоминаний они отделены. Ничего не сворачивается: блок и так стоит ниже
 * календаря и виден целиком. Нет ни того, ни другого — блока нет.
 */
export function DeadlinesCard({
  due,
  overdue,
  onComplete,
}: {
  due: TaskWithContext[];
  overdue: TaskWithContext[];
  onComplete: (id: string) => void;
}) {
  if (due.length === 0 && overdue.length === 0) return null;

  const row = (t: TaskWithContext, when: string) => (
    <div className="t-row" key={t.id}>
      <span className="time mono">{when}</span>
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
  );

  return (
    <section className="card today-block" aria-label="Дедлайны">
      <h4>Дедлайны</h4>
      {overdue.length > 0 ? (
        <>
          <p className="today-group-label is-overdue">Срок прошёл</p>
          {overdue.map((t) => row(t, t.deadline ? formatLongDate(t.deadline) : '—'))}
        </>
      ) : null}
      {due.length > 0 ? (
        <>
          <p className="today-group-label">Сегодня</p>
          {due.map((t) => row(t, t.exactTime ?? 'до конца дня'))}
        </>
      ) : null}
    </section>
  );
}

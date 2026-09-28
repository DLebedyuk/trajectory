import { Link } from 'react-router-dom';
import { IconBell } from '@planner/ui';
import type { Reminder } from '@planner/contracts';

const EMPTY_IDS: Set<string> = new Set();

/**
 * Напоминания на сегодня — отдельной карточкой в правой колонке, чтобы не
 * смешиваться с календарём и задачами. Сверху — с точным временем (по
 * порядку), ниже — без времени: список на день, а не расписание.
 */
export function RemindersCard({
  reminders,
  onComplete,
  completingIds = EMPTY_IDS,
}: {
  reminders: Reminder[];
  onComplete: (id: string) => void;
  /** Id завершающихся напоминаний — их кнопки блокируются на время запроса. */
  completingIds?: Set<string>;
}) {
  const timed = reminders
    .filter((r) => r.scheduledTime)
    .sort((a, b) => ((a.scheduledTime ?? '') < (b.scheduledTime ?? '') ? -1 : 1));
  const soft = reminders.filter((r) => !r.scheduledTime);

  const check = (r: Reminder) => (
    <button
      type="button"
      className="check"
      aria-label={`Выполнить напоминание: ${r.text}`}
      disabled={completingIds.has(r.id)}
      onClick={() => onComplete(r.id)}
    />
  );

  return (
    <section className="card today-block reminders-card" aria-label="Напоминания">
      <h4>
        Напоминания
        <span className="today-links">
          <Link to="/reminders">Все</Link>
          <Link to="/reminders/archive">Архив</Link>
        </span>
      </h4>

      {timed.length === 0 && soft.length === 0 ? (
        <p className="hint">На сегодня напоминаний нет.</p>
      ) : null}

      {timed.map((r) => (
        <div className="t-row" key={r.id}>
          <span className="time mono">{r.scheduledTime}</span>
          {check(r)}
          <span className="ttl">{r.text}</span>
          {r.repeatRule ? (
            <span className="meta" title="Повторяется">
              <IconBell />
            </span>
          ) : null}
        </div>
      ))}

      {soft.length > 0 ? (
        <>
          {timed.length > 0 ? <p className="today-group-label">Без времени</p> : null}
          {soft.map((r) => (
            <div className="t-row" key={r.id}>
              {check(r)}
              <span className="ttl">{r.text}</span>
            </div>
          ))}
        </>
      ) : null}
    </section>
  );
}

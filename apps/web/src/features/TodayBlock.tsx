import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconBell, IconCalendar } from '@planner/ui';
import { formatLongDate, plural } from '@planner/shared';
import type { Reminder, TaskWithContext } from '@planner/contracts';
import type { CalendarEventView } from '../api/client.js';

export interface TodayBlockProps {
  events: CalendarEventView[];
  tasks: TaskWithContext[];
  /** Задачи, чей срок прошёл. Показываются свёрнутыми и по желанию. */
  overdue: TaskWithContext[];
  reminders: Reminder[];
  onCompleteTask: (id: string) => void;
  onCompleteReminder: (id: string) => void;
}

/** Кружок «выполнить». Событие календаря выполнить нельзя — у него нет кружка. */
function Check({ label, onDone }: { label: string; onDone: () => void }) {
  return <button type="button" className="check" aria-label={label} onClick={onDone} />;
}

/**
 * «Сегодня» — лента дня по времени: события календаря, задачи со сроком и
 * напоминания с точным временем. Напоминания без времени во времени не
 * стоят, поэтому живут отдельной плашкой справа (SoftRemindersCard).
 * Просроченное свёрнуто: оно должно быть доступно, но не должно давить
 * сверху каждый день.
 */
export function TodayBlock({
  events,
  tasks,
  overdue,
  reminders,
  onCompleteTask,
  onCompleteReminder,
}: TodayBlockProps) {
  const timed = reminders
    .filter((r) => r.scheduledTime)
    .sort((a, b) => ((a.scheduledTime ?? '') < (b.scheduledTime ?? '') ? -1 : 1));
  const [overdueOpen, setOverdueOpen] = useState(false);
  const total = events.length + tasks.length + timed.length;

  return (
    <section className="card today-block" aria-label="Сегодня">
      <h4>
        Сегодня
        <span className="today-links">
          <Link to="/reminders">Все напоминания</Link>
          <Link to="/reminders/archive">Архив за 7 дней</Link>
        </span>
      </h4>

      <p className="hint today-sub">
        {total > 0
          ? `${total} ${plural(total, 'пункт', 'пункта', 'пунктов')} — события, сроки и напоминания`
          : 'Свободный день. Можно взять что-нибудь из фокуса или ничего не брать.'}
      </p>

      {events.map((e) => (
        <div className="t-row" key={e.id}>
          <span className="time mono">{e.time}</span>
          {/* событие календаря невозможно «выполнить»: оно не наше */}
          <span className="check event" aria-hidden="true">
            <IconCalendar />
          </span>
          <span className="ttl event">{e.title}</span>
          <span className="meta">
            {e.calendarName}
            {e.duration ? ` · ${e.duration}` : ''} · календарь
          </span>
        </div>
      ))}

      {timed.map((r) => (
        <div className="t-row" key={r.id}>
          <span className="time mono">{r.scheduledTime}</span>
          <Check
            label={`Выполнить напоминание: ${r.text}`}
            onDone={() => onCompleteReminder(r.id)}
          />
          <span className="ttl">{r.text}</span>
          <span className="meta">
            <IconBell /> напоминание{r.repeatRule ? ' · повторяется' : ''}
          </span>
        </div>
      ))}

      {tasks.length > 0 ? <p className="today-group-label">Дедлайны</p> : null}
      {tasks.map((t) => (
        <div className="t-row" key={t.id}>
          <span className="time mono">{t.exactTime ?? 'до конца дня'}</span>
          <Check label={`Выполнить: ${t.title}`} onDone={() => onCompleteTask(t.id)} />
          <Link className="ttl" to={`/tasks/${t.id}`}>
            {t.title}
          </Link>
          <span className="meta">
            <i className="dir-dot" style={{ ['--c' as string]: `var(${t.directionColor})` }} />
            {t.projectTitle} · {t.directionName}
          </span>
        </div>
      ))}

      {overdue.length > 0 ? (
        <div>
          <button
            type="button"
            className="overdue-toggle"
            aria-expanded={overdueOpen}
            onClick={() => setOverdueOpen((v) => !v)}
          >
            Просрочено: {overdue.length} {overdueOpen ? '· свернуть' : '· посмотреть'}
          </button>
          {overdueOpen
            ? overdue.map((t) => (
                <div className="t-row" key={t.id}>
                  <span className="time mono">{t.deadline ? formatLongDate(t.deadline) : '—'}</span>
                  <Check label={`Выполнить: ${t.title}`} onDone={() => onCompleteTask(t.id)} />
                  <Link className="ttl" to={`/tasks/${t.id}`}>
                    {t.title}
                  </Link>
                  <span className="meta">{t.projectTitle}</span>
                </div>
              ))
            : null}
        </div>
      ) : null}
    </section>
  );
}

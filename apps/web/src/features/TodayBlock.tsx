import { Link } from 'react-router-dom';
import { Checkbox, IconBell, IconCalendar } from '@planner/ui';
import { plural } from '@planner/shared';
import type { Reminder, TaskWithContext } from '@planner/contracts';
import type { CalendarEventView } from '../api/client.js';

export interface TodayBlockProps {
  events: CalendarEventView[];
  tasks: TaskWithContext[];
  reminders: Reminder[];
  onCompleteTask: (id: string) => void;
  onCompleteReminder: (id: string) => void;
  onOpenArchive: () => void;
}

export function TodayBlock({
  events,
  tasks,
  reminders,
  onCompleteTask,
  onCompleteReminder,
  onOpenArchive,
}: TodayBlockProps) {
  const timed = reminders
    .filter((r) => r.scheduledTime)
    .sort((a, b) => ((a.scheduledTime ?? '') < (b.scheduledTime ?? '') ? -1 : 1));
  const soft = reminders.filter((r) => !r.scheduledTime);
  const total = events.length + tasks.length + reminders.length;

  return (
    <section className="today" aria-label="Сегодня">
      <div className="today-h">
        <div>
          <div className="lbl">Сегодня</div>
          <div className="hint" style={{ marginTop: 3 }}>
            {total > 0
              ? `${total} ${plural(total, 'пункт', 'пункта', 'пунктов')} — события, сроки и напоминания`
              : 'Ничего обязательного на сегодня'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <Link className="quiet-link" to="/reminders">
            Все напоминания
          </Link>
          <button type="button" className="quiet-link" onClick={onOpenArchive}>
            Архив за 7 дней
          </button>
        </div>
      </div>

      {total === 0 ? (
        <div style={{ padding: 18, borderTop: '1px solid var(--line)' }}>
          <p className="hint">
            Свободный день. Можно взять что-нибудь из фокуса или ничего не брать.
          </p>
        </div>
      ) : null}

      {events.map((e) => (
        <div className="trow" key={e.id}>
          <span className="ttime">{e.time}</span>
          <span className="tico">
            <IconCalendar />
          </span>
          <span className="tmain">
            <b>{e.title}</b>
            <span className="tmeta">
              {e.calendarName}
              {e.duration ? ` · ${e.duration}` : ''} · календарь
            </span>
          </span>
        </div>
      ))}

      {timed.map((r) => (
        <div className="trow" key={r.id}>
          <span className="ttime">{r.scheduledTime}</span>
          <Checkbox
            checked={false}
            onChange={() => onCompleteReminder(r.id)}
            label={`Выполнить напоминание: ${r.text}`}
          />
          <span className="tmain">
            <b>{r.text}</b>
            <span className="tmeta">
              <IconBell /> напоминание{r.repeatRule ? ' · повторяется' : ''}
            </span>
          </span>
        </div>
      ))}

      {tasks.map((t) => (
        <div className="trow" key={t.id}>
          <span className="ttime" data-soft={!t.exactTime}>
            {t.exactTime ?? 'до конца дня'}
          </span>
          <Checkbox
            checked={false}
            onChange={() => onCompleteTask(t.id)}
            label={`Выполнить: ${t.title}`}
          />
          <Link className="tmain" to={`/tasks/${t.id}`}>
            <b>{t.title}</b>
            <span className="tmeta">
              {t.projectTitle} · {t.directionName}
            </span>
          </Link>
        </div>
      ))}

      {soft.length > 0 ? (
        <div className="tgroup">
          <span className="lbl">
            <IconBell /> Не забыть сегодня
          </span>
          {soft.map((r) => (
            <div className="tg-item" key={r.id}>
              <Checkbox
                checked={false}
                onChange={() => onCompleteReminder(r.id)}
                label={`Выполнить: ${r.text}`}
              />
              <span style={{ flex: 1, fontSize: 13.5 }}>{r.text}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

import { IconCalendar } from '@planner/ui';
import { plural } from '@planner/shared';
import type { CalendarEventView } from '../api/client.js';

/**
 * «Сегодня» — только календарь: события подключённых календарей по времени.
 * Задачи со сроком живут своей карточкой ниже (DeadlinesCard), напоминания —
 * справа (RemindersCard): это три разных вида дел, и в одной ленте они
 * смешивались до неразличимости.
 */
export function TodayBlock({ events }: { events: CalendarEventView[] }) {
  return (
    <section className="card today-block" aria-label="Сегодня">
      <h4>Сегодня</h4>

      <p className="hint today-sub">
        {events.length > 0
          ? `${events.length} ${plural(events.length, 'событие', 'события', 'событий')} в календаре`
          : 'В календаре на сегодня пусто.'}
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
    </section>
  );
}

import { Link } from 'react-router-dom';
import type { Reminder } from '@planner/contracts';

/**
 * «Не забыть сегодня» — те же напоминания, что и в разделе «Напоминания»,
 * просто у них не проставлено время. В ленте «Сегодня» им места нет: она
 * выстроена по часам, а этим пунктам час неизвестен. Поэтому они стоят
 * отдельной плашкой справа — как список на день, а не как расписание.
 */
export function SoftRemindersCard({
  reminders,
  onComplete,
  completingId = null,
}: {
  reminders: Reminder[];
  onComplete: (id: string) => void;
  /** Напоминание, которое сейчас завершается — его кнопка блокируется на время запроса. */
  completingId?: string | null;
}) {
  const soft = reminders.filter((r) => !r.scheduledTime);

  return (
    <div className="card notime-card">
      <h4>
        Не забыть сегодня
        <Link className="more" to="/reminders">
          Все
        </Link>
      </h4>
      {soft.length === 0 ? (
        <p className="hint">Напоминаний без времени на сегодня нет.</p>
      ) : (
        soft.map((r) => (
          <div className="notime-row" key={r.id}>
            <button
              type="button"
              className="check"
              aria-label={`Выполнить напоминание: ${r.text}`}
              disabled={r.id === completingId}
              onClick={() => onComplete(r.id)}
            />
            <span className="ttl">{r.text}</span>
          </div>
        ))
      )}
    </div>
  );
}

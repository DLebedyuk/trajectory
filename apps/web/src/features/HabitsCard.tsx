import type { HabitWithContext } from '@planner/contracts';

/**
 * «Когда есть время» — личный чеклист привычек со всех направлений.
 * Ничего обязательного: ни сроков, ни галочек «сделано на сегодня». Это
 * подсказка, чем можно заняться, если выдалось двадцать свободных минут.
 * Клик по пункту — записать касание: направление и название уже подставлены.
 */
export function HabitsCard({
  habits,
  onPick,
}: {
  habits: HabitWithContext[];
  onPick: (habit: HabitWithContext) => void;
}) {
  return (
    <section className="card habits-card" aria-label="Когда есть время">
      <h4>Когда есть время</h4>
      {habits.length === 0 ? (
        <p className="hint">
          Здесь соберутся привычки — то, чем приятно заняться без расписания. Добавляются на
          странице направления.
        </p>
      ) : (
        <>
          <p className="hint">Нажмите, чтобы записать касание.</p>
          {habits.map((h) => (
            <button
              type="button"
              className="habit-row"
              key={h.id}
              title={`Записать касание: ${h.title}`}
              onClick={() => onPick(h)}
            >
              <i className="dir-dot" style={{ ['--c' as string]: `var(${h.directionColor})` }} />
              <span className="ttl">{h.title}</span>
              <span className="meta">{h.directionName}</span>
            </button>
          ))}
        </>
      )}
    </section>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heatmap, PageHeader } from '@planner/ui';
import { humanDate, plural, todayInTimezone, weekdayShort } from '@planner/shared';
import { useDashboard, useDirections, useHeatmap, useTouches } from '../api/queries.js';
import { DayTouchesModal } from '../features/DayTouchesModal.js';
import { ErrorBox, Loading } from '../components/Loading.js';

/** История касаний. Открывается по ссылке с главной, в навигации не висит. */
export function ActivityPage() {
  const navigate = useNavigate();
  const [directionId, setDirectionId] = useState<string>('');
  const [day, setDay] = useState<string | null>(null);
  const dashboard = useDashboard();
  const directions = useDirections();
  const heat = useHeatmap(26, directionId || undefined);
  const touches = useTouches({ directionId: directionId || undefined, limit: 200 });

  const today = dashboard.data?.today ?? todayInTimezone('UTC');

  if (heat.isLoading) return <Loading what="Загружаю историю" />;
  if (heat.isError) return <ErrorBox error={heat.error} />;

  const byDay = new Map<string, typeof touches.data>();
  for (const t of touches.data ?? []) {
    const list = byDay.get(t.date) ?? [];
    list.push(t);
    byDay.set(t.date, list);
  }
  const total = heat.data?.total ?? 0;

  return (
    <>
      <PageHeader
        onBack={() => navigate('/')}
        title="История касаний"
        subtitle="Считается только факт касания — не потраченное время."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 18 }}>
        <span className="lbl">Направление</span>
        <div className="chips">
          <button
            type="button"
            className="chip"
            data-on={!directionId}
            onClick={() => setDirectionId('')}
          >
            все
          </button>
          {(directions.data ?? []).map((d) => (
            <button
              key={d.id}
              type="button"
              className="chip"
              data-on={directionId === d.id}
              onClick={() => setDirectionId(d.id)}
            >
              <i className="dot" style={{ background: `var(${d.color})` }} />
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="lbl">Полгода</div>
          <div className="mono hint">
            {total} {plural(total, 'касание', 'касания', 'касаний')}
          </div>
        </div>
        <Heatmap days={heat.data?.days ?? []} today={today} cell={16} gap={4} onDayClick={setDay} />
      </div>

      <div className="card" style={{ marginTop: 16, padding: '4px 18px 12px' }}>
        {[...byDay.entries()].slice(0, 60).map(([date, list]) => (
          <div
            key={date}
            style={{
              display: 'grid',
              gridTemplateColumns: '96px minmax(0, 1fr)',
              gap: 16,
              padding: '13px 0',
              borderTop: '1px solid var(--line)',
            }}
          >
            <div className="mono hint" style={{ paddingTop: 2 }}>
              <b style={{ display: 'block', color: 'var(--text)', fontSize: 13 }}>
                {humanDate(date, today)}
              </b>
              {weekdayShort(date)}
            </div>
            <div>
              {(list ?? []).map((t) => (
                <div
                  key={t.id}
                  style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '4px 0' }}
                >
                  <i
                    style={{
                      width: 3,
                      alignSelf: 'stretch',
                      borderRadius: 2,
                      flex: 'none',
                      minHeight: 16,
                      background: `var(${t.directionColor})`,
                    }}
                  />
                  <span style={{ flex: 1 }}>{t.title}</span>
                  {t.projectTitle ? <span className="hint">{t.projectTitle}</span> : null}
                </div>
              ))}
            </div>
          </div>
        ))}
        {byDay.size === 0 ? (
          <p className="hint" style={{ padding: '18px 0' }}>
            Пока пусто.
          </p>
        ) : null}
      </div>

      <DayTouchesModal
        date={day}
        directionId={directionId || undefined}
        onClose={() => setDay(null)}
      />
    </>
  );
}

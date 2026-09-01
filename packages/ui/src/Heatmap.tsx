import { useMemo } from 'react';
import { addDaysToDateOnly, monthShort, startOfWeek } from '@planner/shared';

export interface HeatmapDayData {
  date: string;
  total: number;
  directions: { directionId: string; color: string; count: number }[];
}

export interface HeatmapProps {
  days: HeatmapDayData[];
  today: string;
  weeks?: number;
  cell?: number;
  gap?: number;
  showMonths?: boolean;
  showWeekdays?: boolean;
  onDayClick?: (date: string) => void;
}

const cssVarToRgba = (variable: string, alpha: number): string => {
  const value =
    typeof window !== 'undefined'
      ? getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
      : '';
  const hex = value.replace('#', '');
  if (hex.length !== 6) return `rgba(136,136,136,${alpha})`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

/**
 * Карта касаний из прототипа: день с несколькими направлениями делится
 * на секторы по их цветам.
 */
export function Heatmap({
  days,
  today,
  weeks = 26,
  cell = 13,
  gap = 3,
  showMonths = true,
  showWeekdays = true,
  onDayClick,
}: HeatmapProps) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const end = startOfWeek(today);
  const start = addDaysToDateOnly(end, -(weeks - 1) * 7);

  const columns = Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDaysToDateOnly(start, w * 7 + d)),
  );

  const monthLabels = columns.map((col) => {
    const first = col[0] as string;
    const day = Number(first.slice(8, 10));
    return day <= 7 ? monthShort(Number(first.slice(5, 7)) - 1) : '';
  });

  const background = (data: HeatmapDayData | undefined): string | undefined => {
    if (!data || data.total === 0) return undefined;
    const unique = data.directions;
    if (unique.length === 1) {
      const alpha = data.total >= 3 ? 0.95 : data.total === 2 ? 0.7 : 0.48;
      return cssVarToRgba(unique[0]?.color ?? '', alpha);
    }
    const step = 100 / unique.length;
    const stops = unique
      .map((u, i) => `${cssVarToRgba(u.color, 0.9)} ${i * step}% ${(i + 1) * step}%`)
      .join(',');
    return `conic-gradient(${stops})`;
  };

  return (
    <div className="heat-wrap">
      <div className="heat">
        {showWeekdays ? (
          <div className="heat-side" style={{ gap, paddingTop: showMonths ? 18 : 0 }}>
            {['пн', '', 'ср', '', 'пт', '', ''].map((label, i) => (
              <span key={i} style={{ height: cell, lineHeight: `${cell}px` }}>
                {label}
              </span>
            ))}
          </div>
        ) : null}
        <div>
          {showMonths ? (
            <div className="heat-months" style={{ gap }}>
              {monthLabels.map((label, i) => (
                <span key={i} style={{ width: cell }}>
                  {label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="heat" style={{ gap }}>
            {columns.map((col, ci) => (
              <div key={ci} className="heat-col" style={{ gap }}>
                {col.map((date) => {
                  const data = byDate.get(date);
                  const future = date > today;
                  const filled = Boolean(data && data.total > 0);
                  const title = filled
                    ? `${date}: ${data?.total} касаний`
                    : future
                      ? ''
                      : `${date}: пусто`;
                  // Без обработчика клика ячейка остаётся обычным div: карта
                  // часто лежит внутри кликабельной плашки, а кнопка в кнопке недопустима.
                  if (!onDayClick) {
                    return (
                      <div
                        key={date}
                        className="heat-cell"
                        data-future={future}
                        data-filled={filled}
                        data-date={date}
                        title={title}
                        style={{ width: cell, height: cell, background: background(data) }}
                      />
                    );
                  }
                  return (
                    <button
                      key={date}
                      type="button"
                      className="heat-cell"
                      data-future={future}
                      data-filled={filled}
                      data-date={date}
                      aria-label={title || date}
                      title={title}
                      disabled={!filled}
                      style={{ width: cell, height: cell, background: background(data) }}
                      onClick={() => filled && onDayClick(date)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

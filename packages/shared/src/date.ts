/** Работа с календарными датами в формате YYYY-MM-DD без привязки к таймзоне рантайма. */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Дата в YYYY-MM-DD из компонентов UTC. */
export function toDateOnly(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Разбор YYYY-MM-DD в Date, зафиксированную на полночь UTC. */
export function fromDateOnly(value: string): Date {
  if (!DATE_RE.test(value)) throw new Error(`Некорректная дата: ${value}`);
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDaysToDateOnly(value: string, days: number): string {
  const d = fromDateOnly(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

export function addMonthsToDateOnly(value: string, months: number): string {
  const d = fromDateOnly(value);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return toDateOnly(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromDateOnly(a).getTime() - fromDateOnly(b).getTime()) / 86_400_000);
}

/** Понедельник недели, в которую попадает дата. */
export function startOfWeek(value: string): string {
  const d = fromDateOnly(value);
  const shift = (d.getUTCDay() + 6) % 7;
  return addDaysToDateOnly(value, -shift);
}

/** Текущая календарная дата в указанной таймзоне (IANA). */
export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(now);
}

/** Текущее время HH:MM в указанной таймзоне. */
export function timeInTimezone(timezone: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return fmt.format(now);
}

/** Смещение таймзоны в минутах для конкретного момента. */
export function timezoneOffsetMinutes(timezone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - at.getTime()) / 60_000;
}

/**
 * Момент UTC для локальных даты и времени в заданной таймзоне.
 * Используется сервером, чтобы не полагаться на время браузера.
 */
export function zonedDateTimeToUtc(date: string, time: string, timezone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  // два прохода: смещение может отличаться из-за перехода на летнее время
  let guess = new Date(naive);
  for (let i = 0; i < 2; i += 1) {
    const offset = timezoneOffsetMinutes(timezone, guess);
    guess = new Date(naive - offset * 60_000);
  }
  return guess;
}

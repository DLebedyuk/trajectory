import { addDaysToDateOnly, addMonthsToDateOnly } from './date.js';

export type RepeatRule = 'daily' | 'weekly' | 'monthly';

/** Следующая дата повторяющегося напоминания после указанной. */
export function nextOccurrence(date: string, rule: RepeatRule): string {
  switch (rule) {
    case 'daily':
      return addDaysToDateOnly(date, 1);
    case 'weekly':
      return addDaysToDateOnly(date, 7);
    case 'monthly':
      return addMonthsToDateOnly(date, 1);
  }
}

/**
 * Догоняет пропущенные повторы: если напоминание не трогали неделю,
 * оно не должно копить хвост из семи одинаковых записей — берётся ближайшая
 * будущая дата, всё пропущенное молча пропадает.
 */
export function catchUpOccurrence(date: string, rule: RepeatRule, today: string): string {
  let next = nextOccurrence(date, rule);
  let guard = 0;
  while (next < today && guard < 500) {
    next = nextOccurrence(next, rule);
    guard += 1;
  }
  return next;
}

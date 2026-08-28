import { describe, expect, it } from 'vitest';
import { catchUpOccurrence, nextOccurrence } from '../recurrence.js';

describe('recurrence', () => {
  it('считает следующий повтор', () => {
    expect(nextOccurrence('2026-08-26', 'daily')).toBe('2026-08-27');
    expect(nextOccurrence('2026-08-26', 'weekly')).toBe('2026-09-02');
    expect(nextOccurrence('2026-08-31', 'monthly')).toBe('2026-09-30');
  });

  it('не копит пропущенные повторы', () => {
    // напоминание не трогали две недели — берём ближайшее будущее, а не хвост из четырнадцати
    expect(catchUpOccurrence('2026-08-10', 'daily', '2026-08-26')).toBe('2026-08-26');
    expect(catchUpOccurrence('2026-08-03', 'weekly', '2026-08-26')).toBe('2026-08-31');
  });
});

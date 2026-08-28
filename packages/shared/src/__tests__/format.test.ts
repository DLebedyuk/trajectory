import { describe, expect, it } from 'vitest';
import { formatLongDate, humanDate, plural, weekdayShort } from '../format.js';

describe('format', () => {
  it('склоняет числительные', () => {
    expect(plural(1, 'касание', 'касания', 'касаний')).toBe('касание');
    expect(plural(3, 'касание', 'касания', 'касаний')).toBe('касания');
    expect(plural(5, 'касание', 'касания', 'касаний')).toBe('касаний');
    expect(plural(11, 'касание', 'касания', 'касаний')).toBe('касаний');
    expect(plural(21, 'касание', 'касания', 'касаний')).toBe('касание');
  });

  it('форматирует даты', () => {
    expect(formatLongDate('2026-09-03')).toBe('3 сентября');
    expect(weekdayShort('2026-08-26')).toBe('ср');
  });

  it('показывает относительные даты', () => {
    expect(humanDate('2026-08-26', '2026-08-26')).toBe('сегодня');
    expect(humanDate('2026-08-25', '2026-08-26')).toBe('вчера');
    expect(humanDate('2026-08-27', '2026-08-26')).toBe('завтра');
    expect(humanDate('2026-08-01', '2026-08-26')).toBe('1 авг');
  });
});

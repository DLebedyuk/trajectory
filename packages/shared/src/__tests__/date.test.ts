import { describe, expect, it } from 'vitest';
import {
  addDaysToDateOnly,
  addMonthsToDateOnly,
  diffDays,
  startOfWeek,
  todayInTimezone,
  zonedDateTimeToUtc,
} from '../date.js';

describe('date helpers', () => {
  it('складывает дни через границу месяца', () => {
    expect(addDaysToDateOnly('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysToDateOnly('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('складывает месяцы и не выпадает за конец месяца', () => {
    expect(addMonthsToDateOnly('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToDateOnly('2026-11-30', 1)).toBe('2026-12-30');
  });

  it('считает начало недели с понедельника', () => {
    expect(startOfWeek('2026-08-26')).toBe('2026-08-24');
    expect(startOfWeek('2026-08-24')).toBe('2026-08-24');
    expect(startOfWeek('2026-08-23')).toBe('2026-08-17');
  });

  it('считает разницу в днях', () => {
    expect(diffDays('2026-08-26', '2026-08-24')).toBe(2);
  });

  it('переводит локальные дату и время в UTC с учётом таймзоны', () => {
    const utc = zonedDateTimeToUtc('2026-08-27', '08:30', 'Europe/Moscow');
    expect(utc.toISOString()).toBe('2026-08-27T05:30:00.000Z');
  });

  it('учитывает переход на летнее время', () => {
    const winter = zonedDateTimeToUtc('2026-01-15', '12:00', 'Europe/Berlin');
    const summer = zonedDateTimeToUtc('2026-07-15', '12:00', 'Europe/Berlin');
    expect(winter.toISOString()).toBe('2026-01-15T11:00:00.000Z');
    expect(summer.toISOString()).toBe('2026-07-15T10:00:00.000Z');
  });

  it('отдаёт сегодняшнюю дату в нужной таймзоне', () => {
    const at = new Date('2026-08-26T22:30:00.000Z');
    expect(todayInTimezone('Europe/Moscow', at)).toBe('2026-08-27');
    expect(todayInTimezone('UTC', at)).toBe('2026-08-26');
  });
});

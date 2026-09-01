import { describe, expect, it } from 'vitest';
import { parseRelativePhrase } from '../relative-date.js';

const TODAY = '2026-08-26'; // среда

describe('parseRelativePhrase', () => {
  it('распознаёт «завтра» и отдаёт абсолютную дату', () => {
    const r = parseRelativePhrase('Напомни завтра поставить стирку', TODAY);
    expect(r.isReminder).toBe(true);
    expect(r.date).toBe('2026-08-27');
    expect(r.time).toBeNull();
    expect(r.text).toBe('Поставить стирку');
  });

  it('распознаёт время', () => {
    const r = parseRelativePhrase('Напомни завтра в 12 поставить стирку', TODAY);
    expect(r.date).toBe('2026-08-27');
    expect(r.time).toBe('12:00');
    expect(r.text).toBe('Поставить стирку');
  });

  it('распознаёт время с минутами', () => {
    const r = parseRelativePhrase('напомни сегодня в 9:05 позвонить', TODAY);
    expect(r.time).toBe('09:05');
    expect(r.date).toBe(TODAY);
  });

  it('распознаёт конкретную дату и сохраняет регистр слов', () => {
    const r = parseRelativePhrase('Напомни 3 сентября проверить возврат от Apple', TODAY);
    expect(r.date).toBe('2026-09-03');
    expect(r.text).toBe('Проверить возврат от Apple');
  });

  it('переносит дату на следующий год, если месяц уже прошёл', () => {
    const r = parseRelativePhrase('напомни 3 февраля продлить страховку', TODAY);
    expect(r.date).toBe('2027-02-03');
  });

  it('считает «через две недели»', () => {
    const r = parseRelativePhrase('Через две недели напомни спросить Джона про занятия', TODAY);
    expect(r.date).toBe('2026-09-09');
    expect(r.text).toBe('Спросить Джона про занятия');
  });

  it('помечает день недели как требующий подтверждения', () => {
    const r = parseRelativePhrase('Напомни в субботу забрать посылку', TODAY);
    expect(r.date).toBe('2026-08-29');
    expect(r.ambiguousWeekday).toBe('субботу');
  });

  it('не выдумывает дату, когда её нет', () => {
    const r = parseRelativePhrase('Напомни про доставку', TODAY);
    expect(r.isReminder).toBe(true);
    expect(r.date).toBeNull();
    expect(r.text).toBe('Про доставку');
  });

  it('обычное сообщение не считает напоминанием', () => {
    const r = parseRelativePhrase('купить полимерную глину', TODAY);
    expect(r.isReminder).toBe(false);
    expect(r.date).toBeNull();
  });

  it('«в 5 сентября» — это дата, а не пять утра', () => {
    // фраза давала и правильную дату, и время 05:00: напоминание превращалось
    // в отдельное уведомление посреди ночи
    const r = parseRelativePhrase('напомни в 5 сентября купить билеты', TODAY);
    expect(r.date).toBe('2026-09-05');
    expect(r.time).toBeNull();
    // предлог отрезается вместе с датой, а не остаётся в тексте
    expect(r.text).toBe('Купить билеты');
  });

  it('«в 10» рядом с днём всё ещё время', () => {
    const r = parseRelativePhrase('напомни завтра в 10 позвонить маме', TODAY);
    expect(r.time).toBe('10:00');
    expect(r.text).toBe('Позвонить маме');
  });

  it('не принимает 25 часов за время', () => {
    const r = parseRelativePhrase('напомни в 25 сделать что-то', TODAY);
    expect(r.time).toBeNull();
  });
});

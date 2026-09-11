import { addDaysToDateOnly, addMonthsToDateOnly, fromDateOnly, pad, toDateOnly } from './date.js';

export type TimeSlot = 'morning' | 'day' | 'evening';

export interface ParsedPhrase {
  /** Похоже ли сообщение на просьбу напомнить. */
  isReminder: boolean;
  /** Абсолютная дата YYYY-MM-DD или null, если её невозможно определить. */
  date: string | null;
  /** HH:MM или null. */
  time: string | null;
  /**
   * Слово «утром/днём/вечером» — заменяет точное время, когда его не назвали.
   * Взаимоисключимо с `time`: явное «в 18:00» всегда имеет приоритет.
   */
  timeSlot: TimeSlot | null;
  /** Текст напоминания без служебных слов. */
  text: string;
  /**
   * Название дня недели в винительном падеже, если дата выведена из «в субботу».
   * Такую дату бот обязан подтвердить у пользователя.
   */
  ambiguousWeekday: string | null;
}

const REMINDER_RE = /(^|\s)(напомни|напомнить|напомните)(\s|$)/i;

const WEEKDAYS: Record<string, number> = {
  понедельник: 1,
  вторник: 2,
  среду: 3,
  среда: 3,
  четверг: 4,
  пятницу: 5,
  пятница: 5,
  субботу: 6,
  суббота: 6,
  воскресенье: 0,
};
const WEEKDAY_ACC = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среду',
  'четверг',
  'пятницу',
  'субботу',
];
const MONTHS: Record<string, number> = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};
const NUMBER_WORDS: Record<string, number> = { две: 2, два: 2, три: 3, четыре: 4 };
const MONTH_NAMES = Object.keys(MONTHS).join('|');

interface Cut {
  index: number;
  length: number;
}

/**
 * Детерминированный разбор русской фразы. Никакого ИИ: то, чего нет в тексте,
 * функция не выдумывает — при отсутствии даты возвращает null, и бот спрашивает.
 */
export function parseRelativePhrase(raw: string, today: string): ParsedPhrase {
  const original = raw.trim();
  const low = original.toLowerCase();
  const cuts: Cut[] = [];
  const cut = (m: RegExpMatchArray | null): void => {
    if (m && m.index !== undefined) cuts.push({ index: m.index, length: m[0].length });
  };

  const isReminder = REMINDER_RE.test(low);
  cut(low.match(REMINDER_RE));

  let date: string | null = null;
  let time: string | null = null;
  let timeSlot: TimeSlot | null = null;
  let ambiguousWeekday: string | null = null;

  /*
    «в 5» — это время, но «в 5 сентября» — дата. Без этой проверки фраза
    «напомни в 5 сентября купить билеты» давала и правильную дату, и время
    05:00: напоминание превращалось в отдельное уведомление в пять утра.
  */
  const timeMatch = low.match(
    new RegExp(`(^|\\s)в\\s+(\\d{1,2})(?::(\\d{2}))?(?!\\s+(?:${MONTH_NAMES}))(\\s|$)`),
  );
  if (timeMatch) {
    const hh = Number(timeMatch[2]);
    if (hh <= 23) {
      time = `${pad(hh)}:${timeMatch[3] ?? '00'}`;
      cut(timeMatch);
    }
  }

  /*
    «утром/днём/вечером» — то же самое, что точное время, только без цифр:
    заменяет собой один из трёх настраиваемых слотов пользователя. Ловим
    только наречную форму («днём»), а не «день» само по себе — это слово
    слишком часто значит что-то ещё («день рождения», «через день»).
  */
  if (!time) {
    const slotMatch = low.match(/(^|\s)(утром|днём|днем|вечером)(\s|$)/);
    if (slotMatch) {
      const word = slotMatch[2] as string;
      timeSlot = word === 'утром' ? 'morning' : word === 'вечером' ? 'evening' : 'day';
      cut(slotMatch);
    }
  }

  let m: RegExpMatchArray | null;
  if ((m = low.match(/сегодня/))) {
    date = today;
    cut(m);
  } else if ((m = low.match(/послезавтра/))) {
    date = addDaysToDateOnly(today, 2);
    cut(m);
  } else if ((m = low.match(/завтра/))) {
    date = addDaysToDateOnly(today, 1);
    cut(m);
  } else if (
    (m = low.match(
      /через\s+(\d+|две|два|три|четыре|неделю|месяц)\s*(дня|дней|день|недели|неделю|недель|месяца?|месяцев)?/,
    ))
  ) {
    const head = m[1] ?? '';
    const unit = m[2] ?? head;
    const n = NUMBER_WORDS[head] ?? Number.parseInt(head, 10) ?? 1;
    const count = Number.isFinite(n) && n > 0 ? n : 1;
    if (/месяц/.test(unit)) date = addMonthsToDateOnly(today, count);
    else if (/недел/.test(unit)) date = addDaysToDateOnly(today, count * 7);
    else date = addDaysToDateOnly(today, count);
    cut(m);
  } else if (
    // «в» перед датой отрезаем вместе с ней: иначе от «в 5 сентября»
    // в тексте напоминания оставался болтающийся предлог
    (m = low.match(new RegExp(`(^|\\s)(?:в\\s+)?(\\d{1,2})\\s+(${MONTH_NAMES})`)))
  ) {
    const day = Number(m[2]);
    const month = MONTHS[m[3] as string] as number;
    const base = fromDateOnly(today);
    let candidate = new Date(Date.UTC(base.getUTCFullYear(), month, day));
    if (candidate < base) candidate = new Date(Date.UTC(base.getUTCFullYear() + 1, month, day));
    date = toDateOnly(candidate);
    cut(m);
  } else if (
    (m = low.match(
      /(^|\s)в\s+(понедельник|вторник|среду|среда|четверг|пятницу|пятница|субботу|суббота|воскресенье)/,
    ))
  ) {
    const target = WEEKDAYS[m[2] as string] as number;
    for (let i = 1; i <= 7; i += 1) {
      const candidate = addDaysToDateOnly(today, i);
      if (fromDateOnly(candidate).getUTCDay() === target) {
        date = candidate;
        break;
      }
    }
    ambiguousWeekday = WEEKDAY_ACC[target] ?? null;
    cut(m);
  }

  cuts.sort((a, b) => b.index - a.index);
  let text = original;
  for (const c of cuts) text = `${text.slice(0, c.index)} ${text.slice(c.index + c.length)}`;
  text = text
    .replace(/\s+/g, ' ')
    .replace(/^[\s,–—-]+/, '')
    .replace(/[\s,.]+$/, '')
    .trim();
  if (text.length > 0) text = text.charAt(0).toUpperCase() + text.slice(1);

  /*
    Если сообщение — это ровно «напомни завтра днём» и больше ничего, после
    вырезания служебных слов текста не останется. Раньше в этом случае в
    text подставлялся весь original целиком, включая «напомни»: получалось
    напоминание, буквально озаглавленное «напомни завтра днём».
  */
  return { isReminder, date, time, timeSlot, text, ambiguousWeekday };
}

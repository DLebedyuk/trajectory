import { fromDateOnly } from './date.js';

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

/** «3 сентября» */
export function formatLongDate(date: string): string {
  const d = fromDateOnly(date);
  return `${d.getUTCDate()} ${MONTHS_GENITIVE[d.getUTCMonth()]}`;
}

/** «3 сен» */
export function formatShortDate(date: string): string {
  const d = fromDateOnly(date);
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function weekdayShort(date: string): string {
  return WEEKDAYS_SHORT[fromDateOnly(date).getUTCDay()] as string;
}

export function monthShort(monthIndex: number): string {
  return MONTHS_SHORT[monthIndex] as string;
}

/** Русское склонение числительных: plural(5, 'касание','касания','касаний'). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

/** «сегодня» / «вчера» / «3 сен» относительно опорной даты. */
export function humanDate(date: string, today: string): string {
  const diff = Math.round(
    (fromDateOnly(today).getTime() - fromDateOnly(date).getTime()) / 86_400_000,
  );
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff === -1) return 'завтра';
  if (diff === 2) return 'позавчера';
  return formatShortDate(date);
}

export const DURATION_LABEL: Record<'short' | 'medium' | 'long', string> = {
  short: '15 минут',
  medium: 'около часа',
  long: 'несколько часов',
};

/** Приведение строк БД к форме контрактов: временные метки — ISO-строки. */
export const iso = (v: Date | string | null | undefined): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();

export const isoRequired = (v: Date | string): string => iso(v) as string;

/** date-колонки postgres-js приходят строкой YYYY-MM-DD — оставляем как есть. */
export const dateOnly = (v: string | Date | null | undefined): string | null => {
  if (v == null) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
};

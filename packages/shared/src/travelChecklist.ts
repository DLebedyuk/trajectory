/**
 * Детерминированная генерация чек-листа поездки (см. ТЗ раздела «Поездки»).
 * Без rule engine и без LLM: набор тегов из параметров поездки + вещи,
 * у которых alwaysInclude=true или есть пересечение тегов.
 *
 * `heat`/`cold` намеренно нигде не выводятся — погоды в MVP нет. Тег остаётся
 * в модели для ручной разметки вещей и будущего расширения (сезон/погода).
 */

export interface TripContext {
  durationDays: number;
  purposes: string[];
  transport: string[];
  seaOrPool: boolean;
  needsLaptop: boolean;
  activeOutdoor: boolean;
  canLaundry: boolean;
  specialEvent: boolean;
}

const SHORT_TRIP_MAX_DAYS = 4;
const LONG_TRIP_MIN_DAYS = 8;

/** Набор тегов, которым должна соответствовать хотя бы одна тег-вещи. */
export function buildTripTagSet(ctx: TripContext): Set<string> {
  const tags = new Set<string>(['always']);

  if (ctx.durationDays <= SHORT_TRIP_MAX_DAYS) tags.add('shortTrip');
  else if (ctx.durationDays >= LONG_TRIP_MIN_DAYS) tags.add('longTrip');

  for (const t of ctx.transport) tags.add(t);
  for (const p of ctx.purposes) tags.add(p);
  if (ctx.seaOrPool) tags.add('sea');
  // needsLaptop/activeOutdoor/canLaundry/specialEvent пока не влияют на теги —
  // прямого соответствия в фиксированном наборе тегов у них нет.

  return tags;
}

interface TaggedItem {
  id: string;
  tags: string[];
  alwaysInclude: boolean;
  archived: boolean;
}

/** Вещи из базы, подходящие под контекст поездки — без учёта уже добавленных. */
export function pickChecklistCandidates<T extends TaggedItem>(
  items: readonly T[],
  tags: ReadonlySet<string>,
): T[] {
  return items.filter(
    (item) => !item.archived && (item.alwaysInclude || item.tags.some((t) => tags.has(t))),
  );
}

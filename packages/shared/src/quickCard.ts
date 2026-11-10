/**
 * Быстрый ввод карточки доски: «поправить титры #кот» + Enter.
 *
 * Тег — это проект, как в Обсидиане, только проекты здесь называются
 * по-человечески, с пробелами. Поэтому сравнение идёт по «скелету» названия:
 * без регистра, без пробелов и знаков, ё = е. `#кот`, `#Кот_в_сапогах` и
 * `#котвсапогах` — один и тот же проект «Кот в сапогах».
 */

export interface TagTarget {
  id: string;
  title: string;
}

export type QuickCardParse =
  /** Проект найден или тега нет (projectId: null — берётся проект по умолчанию). */
  | { kind: 'ok'; title: string; projectId: string | null }
  /** Тег ни к чему не подходит. Молча заводить проект нельзя: опечатка размножила бы проекты. */
  | { kind: 'unknown'; title: string; tag: string }
  /** Тег подходит к нескольким проектам — надо дописать. */
  | { kind: 'ambiguous'; title: string; tag: string; candidates: TagTarget[] };

/*
  Тег — # и буквы/цифры/_/-. Чисто числовой (#5) — не тег, как и в
  Обсидиане: «Серия #5» остаётся названием. Перед # — начало строки или
  пробел, чтобы не цеплять «C#» и якоря в ссылках.
*/
const TAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;
const isNumeric = (s: string) => /^[\p{N}_-]+$/u.test(s);

export function tagSkeleton(s: string): string {
  return s
    .toLocaleLowerCase('ru')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Как проект выглядит тегом при подстановке: «Кот в сапогах» → «Кот_в_сапогах». */
export function tagFor(title: string): string {
  return title
    .trim()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join('_');
}

/**
 * Проекты под тег, лучшие первыми: точное совпадение, затем начало названия,
 * затем начало любого слова («#сапог» → «Кот в сапогах»). Берётся первый
 * непустой уровень: точное совпадение не должно тонуть среди префиксов.
 */
export function matchTag<T extends TagTarget>(tag: string, targets: T[]): T[] {
  const t = tagSkeleton(tag);
  if (!t) return [];
  const exact = targets.filter((p) => tagSkeleton(p.title) === t);
  if (exact.length) return exact;
  const prefix = targets.filter((p) => tagSkeleton(p.title).startsWith(t));
  if (prefix.length) return prefix;
  return targets.filter((p) =>
    p.title.split(/[^\p{L}\p{N}]+/u).some((w) => w && tagSkeleton(w).startsWith(t)),
  );
}

/** Подсказки при наборе: всё, что подходит, в порядке уровней, без повторов. */
export function suggestTag<T extends TagTarget>(query: string, targets: T[], limit = 6): T[] {
  const q = tagSkeleton(query);
  if (!q) return targets.slice(0, limit);
  const seen = new Set<string>();
  const out: T[] = [];
  const push = (list: T[]) => {
    for (const p of list) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        out.push(p);
      }
    }
  };
  push(targets.filter((p) => tagSkeleton(p.title).startsWith(q)));
  push(matchTag(query, targets));
  push(targets.filter((p) => tagSkeleton(p.title).includes(q)));
  return out.slice(0, limit);
}

/**
 * Разбор строки. Тегов может быть несколько — проект даёт последний: так
 * исправление «#кот … #пёс» дописыванием в конец работает без стирания.
 * Все теги из названия вырезаются.
 */
export function parseQuickCard(text: string, targets: TagTarget[]): QuickCardParse {
  const tags: string[] = [];
  const stripped = text.replace(TAG, (whole, lead: string, tag: string) => {
    if (isNumeric(tag)) return whole;
    tags.push(tag);
    return lead;
  });
  const title = stripped.replace(/\s+/g, ' ').trim();
  const tag = tags.at(-1);
  if (tag === undefined) return { kind: 'ok', title, projectId: null };
  const found = matchTag(tag, targets);
  if (found.length === 1) return { kind: 'ok', title, projectId: found[0]!.id };
  if (found.length === 0) return { kind: 'unknown', title, tag };
  return { kind: 'ambiguous', title, tag, candidates: found };
}

/**
 * Тег, который сейчас набирается: курсор стоит сразу за `#…`. Нужен для
 * подсказок. start — позиция решётки, end — конец слова.
 */
export function activeTag(
  text: string,
  caret: number,
): { start: number; end: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)#([\p{L}\p{N}_-]*)$/u.exec(before);
  if (!m) return null;
  const start = caret - m[2]!.length - 1;
  const rest = /^[\p{L}\p{N}_-]*/u.exec(text.slice(caret))![0];
  return { start, end: caret + rest.length, query: m[2]! + rest };
}

/** Подстановка выбранного проекта на место набираемого тега. */
export function applyTag(
  text: string,
  at: { start: number; end: number },
  title: string,
): { text: string; caret: number } {
  const insert = `#${tagFor(title)}`;
  const after = text.slice(at.end);
  const glue = after.startsWith(' ') ? '' : ' ';
  const next = text.slice(0, at.start) + insert + glue + after;
  return { text: next, caret: at.start + insert.length + 1 };
}

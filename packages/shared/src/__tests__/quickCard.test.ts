import { describe, expect, it } from 'vitest';
import { activeTag, applyTag, matchTag, parseQuickCard, suggestTag, tagFor } from '../quickCard.js';

const projects = [
  { id: 'cat', title: 'Кот в сапогах' },
  { id: 'cat2', title: 'Котёнок Гав' },
  { id: 'ads', title: 'Реклама' },
  { id: 'book', title: 'Аудиокнига «Ёжик»' },
];

describe('parseQuickCard', () => {
  it('без тега — название как есть, проект по умолчанию', () => {
    expect(parseQuickCard('  поправить   титры ', projects)).toEqual({
      kind: 'ok',
      title: 'поправить титры',
      projectId: null,
    });
  });

  it('тег вырезается из названия и даёт проект', () => {
    expect(parseQuickCard('поправить титры #реклама', projects)).toEqual({
      kind: 'ok',
      title: 'поправить титры',
      projectId: 'ads',
    });
    expect(parseQuickCard('#Реклама серия 3', projects)).toMatchObject({
      title: 'серия 3',
      projectId: 'ads',
    });
  });

  it('название с пробелами пишется слитно или через _', () => {
    expect(parseQuickCard('x #Кот_в_сапогах', projects)).toMatchObject({ projectId: 'cat' });
    expect(parseQuickCard('x #котвсапогах', projects)).toMatchObject({ projectId: 'cat' });
  });

  it('точное совпадение важнее префикса', () => {
    const list = [
      { id: 'a', title: 'Кот' },
      { id: 'b', title: 'Котёнок' },
    ];
    expect(parseQuickCard('x #кот', list)).toMatchObject({ kind: 'ok', projectId: 'a' });
  });

  it('несколько подходящих — неоднозначно', () => {
    const r = parseQuickCard('x #кот', projects);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.id)).toEqual(['cat', 'cat2']);
  });

  it('по началу слова и с ё = е', () => {
    expect(parseQuickCard('x #сапог', projects)).toMatchObject({ projectId: 'cat' });
    expect(parseQuickCard('x #ежик', projects)).toMatchObject({ projectId: 'book' });
  });

  it('неизвестный тег не превращается в проект', () => {
    expect(parseQuickCard('x #пёс', projects)).toEqual({ kind: 'unknown', title: 'x', tag: 'пёс' });
  });

  it('#5 и C# — не теги', () => {
    expect(parseQuickCard('Серия #5 #реклама', projects)).toEqual({
      kind: 'ok',
      title: 'Серия #5',
      projectId: 'ads',
    });
    expect(parseQuickCard('учить C#', projects)).toMatchObject({
      title: 'учить C#',
      projectId: null,
    });
  });

  it('из нескольких тегов проект даёт последний', () => {
    expect(parseQuickCard('x #реклама #сапог', projects)).toMatchObject({
      title: 'x',
      projectId: 'cat',
    });
  });
});

describe('подсказки', () => {
  it('activeTag видит набираемый тег под курсором', () => {
    expect(activeTag('серия #ко', 9)).toEqual({ start: 6, end: 9, query: 'ко' });
    expect(activeTag('серия #', 7)).toEqual({ start: 6, end: 7, query: '' });
    expect(activeTag('серия #ко дальше', 8)).toEqual({ start: 6, end: 9, query: 'ко' });
    expect(activeTag('серия ко', 8)).toBeNull();
    expect(activeTag('C#', 2)).toBeNull();
  });

  it('suggestTag: сначала по началу названия, потом по слову', () => {
    expect(suggestTag('ко', projects).map((p) => p.id)).toEqual(['cat', 'cat2']);
    expect(suggestTag('сап', projects).map((p) => p.id)).toEqual(['cat']);
    expect(suggestTag('', projects)).toHaveLength(4);
  });

  it('applyTag подставляет проект и ставит курсор за ним', () => {
    const r = applyTag('серия #ко', { start: 6, end: 9 }, 'Кот в сапогах');
    expect(r.text).toBe('серия #Кот_в_сапогах ');
    expect(r.caret).toBe(r.text.length);
    expect(matchTag('Кот_в_сапогах', projects).map((p) => p.id)).toEqual(['cat']);
  });

  it('tagFor убирает знаки', () => {
    expect(tagFor('Аудиокнига «Ёжик»')).toBe('Аудиокнига_Ёжик');
  });
});

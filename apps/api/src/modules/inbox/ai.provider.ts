import { Injectable } from '@nestjs/common';
import type { InboxProposal } from '@planner/contracts';
import { parseRelativePhrase } from '@planner/shared';

export interface AiParseContext {
  today: string;
  projects: { id: string; title: string; directionName: string }[];
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiProvider {
  readonly name: string;
  propose(
    items: { id: string; originalText: string }[],
    ctx: AiParseContext,
  ): Promise<InboxProposal[]>;
}

const PROJECT_HINTS: [RegExp, string[]][] = [
  [/демо|озвуч|ролик|микрофон|narration/i, ['демо', 'озвучк']],
  [/монолог|офели|сцен|этюд/i, ['монолог', 'офели']],
  [/фото|headshot|резюме|агент|ретуш/i, ['материал', 'сайт']],
  [/джон|домашн|английск|cae|эссе/i, ['джон', 'английск']],
  [/физик|мфти|механик|лекци/i, ['физик', 'мфти']],
  [/пес|вокал|распев|укулел/i, ['программ', 'песн']],
];

/**
 * MOCK-провайдер разбора входящих. Никакого внешнего ИИ: детерминированные
 * правила. Дату он не выдумывает — если её нет в тексте, поле остаётся пустым
 * и пользователь заполняет его сам.
 */
@Injectable()
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';

  async propose(
    items: { id: string; originalText: string }[],
    ctx: AiParseContext,
  ): Promise<InboxProposal[]> {
    return items.map((item) => this.proposeOne(item, ctx));
  }

  private clean(text: string): string {
    const cleaned = text
      .replace(/^(завтра |сегодня |послезавтра |может,? |кто-то советовал |говорят,? )+/gi, '')
      .replace(/надо не забыть|не забыть|напомни(ть)?|\bнадо\b|\bнужно\b/gi, '')
      .replace(/,?\s*говорят стоит\.?$/i, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,]+|[\s,]+$/g, '');
    return cleaned.length > 0 ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : text;
  }

  private quoted(text: string): string | null {
    const m = text.match(/[«"]([^»"]{2,})[»"]/);
    return m?.[1] ?? null;
  }

  private proposeOne(
    item: { id: string; originalText: string },
    ctx: AiParseContext,
  ): InboxProposal {
    const raw = item.originalText;
    const low = raw.toLowerCase();
    const base: InboxProposal = {
      inboxItemId: item.id,
      type: 'keep',
      text: this.clean(raw),
      note: null,
    };

    if (/не забыть|напомни|забрать|оплатить|позвонить|записаться|химчистк/.test(low)) {
      const parsed = parseRelativePhrase(`напомни ${raw}`, ctx.today);
      return {
        ...base,
        type: 'reminder',
        text: this.clean(parsed.text),
        remindAt: parsed.date,
        deliveryMode: parsed.time ? 'alert' : 'digest',
        note: parsed.date
          ? `Дата взята из текста.`
          : 'Даты в тексте нет — придумывать не буду, выбери сама.',
      };
    }
    if (/посмотреть|фильм|сериал|кино|дзеффирелли/.test(low)) {
      return {
        ...base,
        type: 'film',
        text: this.quoted(raw) ?? base.text,
        note: 'Похоже на фильм — отправлю на полку, без срока.',
      };
    }
    if (/книг|прочитать|почитать/.test(low)) {
      return {
        ...base,
        type: 'book',
        text: this.quoted(raw) ?? base.text.replace(/^книг[уаи]\s*/i, ''),
        note: 'Похоже на книгу.',
      };
    }
    if (/сходить|выставк|поесть|погулять|съездить|концерт|маникюр|лошад/.test(low)) {
      return { ...base, type: 'menu', note: 'Приятное и необязательное — это меню, а не задача.' };
    }
    for (const [re, keywords] of PROJECT_HINTS) {
      if (!re.test(low)) continue;
      const project = ctx.projects.find((p) =>
        keywords.some((k) => p.title.toLowerCase().includes(k)),
      );
      if (project) {
        return {
          ...base,
          type: 'task',
          projectId: project.id,
          note: `Подходит к проекту «${project.title}». Дата в тексте не указана — задача останется без дедлайна.`,
        };
      }
    }
    return { ...base, note: 'Не понимаю, к чему это отнести. Оставлю во входящих.' };
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { InboxProposal } from '@planner/contracts';
import { menuCost, menuEnergy, menuEstimatedTime, menuPlace } from '@planner/contracts';
import { env } from '../../config/env.js';
import { MockAiProvider, type AiParseContext, type AiProvider } from './ai.provider.js';

/**
 * Ответ модели проверяется схемой. Всё, что не прошло проверку, отбрасывается:
 * лучше пустое поле, чем выдуманное значение.
 */
const aiItemSchema = z.object({
  inboxItemId: z.string(),
  type: z.enum(['task', 'project', 'reminder', 'menu', 'book', 'film', 'note', 'keep']),
  text: z.string().min(1).max(500),
  projectId: z.string().nullable(),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  remindAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  estimatedDuration: z.enum(['short', 'medium', 'long']).nullable(),
  comment: z.string().max(2000).nullable(),
  note: z.string().max(500).nullable(),
  // параметры «Идеи меню» — модель может предложить, человек всегда переспорит
  menuCategory: z.string().min(1).max(60).nullable().optional(),
  energy: menuEnergy.nullable().optional(),
  estimatedTime: menuEstimatedTime.nullable().optional(),
  cost: menuCost.nullable().optional(),
  place: menuPlace.nullable().optional(),
});
/**
 * Оболочка ответа проверяется отдельно от элементов: если модель ошиблась в одной
 * записи, остальные не должны пропасть вместе с ней.
 */
const aiEnvelopeSchema = z.object({ items: z.array(z.unknown()) });

const SYSTEM_PROMPT = `Ты помогаешь разбирать входящие заметки в личном планировщике.
Задача: для каждой записи предложить, чем она могла бы стать. Ты ничего не создаёшь —
человек увидит предложение и подтвердит, изменит или откажется.

ЧТО ОЗНАЧАЮТ ТИПЫ:
- "task" — конкретное действие внутри уже существующего проекта. Требует projectId
  из списка. Если подходящего проекта в списке нет — это НЕ task.
- "project" — большое дело из нескольких шагов, которого в списке проектов ещё нет.
- "reminder" — то, что нужно не забыть к определённому дню: оплатить, забрать,
  позвонить, записаться.
- "menu" — приятное и необязательное, без срока: сходить на выставку, попробовать
  ресторан, погулять, съездить куда-то.
- "book" — что почитать. "film" — что посмотреть.
- "note" — мысль или наблюдение по существующему проекту, её надо дописать
  в заметки этого проекта. Требует projectId.
- "keep" — непонятно, к чему отнести. Запись останется во входящих.

ЖЁСТКИЕ ПРАВИЛА:
1. НЕ ВЫДУМЫВАЙ ДАТЫ. deadline и remindAt заполняй, только если дата явно названа
   в тексте («в пятницу», «3 сентября», «завтра»). Во всех остальных случаях — null.
2. projectId бери ТОЛЬКО из списка projects, который тебе дан. Если подходящего нет
   или ты не уверена — ставь null и НЕ используй типы "task" и "note": возьми "keep".
   Не придумывай идентификаторы.
3. text — короткая формулировка на русском, без слов «надо», «не забыть», «напомни».
   Сохраняй смысл и имена собственные из оригинала.
4. Не придумывай подробностей, которых нет в тексте.
5. Ровно один элемент на каждую входящую запись, с её же id. Ничего не пропускай,
   ничего не добавляй.

ФОРМАТ ОТВЕТА — JSON-объект строго такого вида:
{"items": [
  {
    "inboxItemId": "id записи ровно как в запросе",
    "type": "task" | "project" | "reminder" | "menu" | "book" | "film" | "note" | "keep",
    "text": "формулировка, до 500 символов",
    "projectId": "id из списка projects" | null,
    "deadline": "YYYY-MM-DD" | null,
    "remindAt": "YYYY-MM-DD" | null,
    "estimatedDuration": "short" | "medium" | "long" | null,
    "comment": "уточнение из текста, до 2000 символов" | null,
    "note": "почему ты предложила именно это, до 500 символов" | null
  }
]}

Все девять полей обязательны в каждом элементе. Если значения нет — пиши null,
а не пропускай поле. Никакого текста вне JSON.

ТОЛЬКО для type "menu" можно дополнительно добавить пять полей — человек всё
равно увидит их в форме и сможет поменять:
  "menuCategory": короткая категория на русском ("прогулки", "театр", "еда"),
  "energy": "low" | "medium" | "high",
  "estimatedTime": "quick" (15 минут) | "hour" (около часа) | "hours" (несколько часов),
  "cost": "free" | "cheap" | "budget",
  "place": "home" | "out".
Если не уверена в каком-то из них — null.

ПРИМЕР. Запрос:
{"today":"2026-09-01","projects":[{"id":"p1","title":"Демо-озвучка","direction":"Голос"}],
 "items":[{"id":"i1","text":"надо не забыть оплатить микрофон до пятницы"},
          {"id":"i2","text":"кто-то советовал сходить в Пушкинский"}]}
Ответ:
{"items":[
  {"inboxItemId":"i1","type":"reminder","text":"Оплатить микрофон","projectId":null,
   "deadline":null,"remindAt":"2026-09-04","estimatedDuration":"short",
   "comment":null,"note":"«до пятницы» — ближайшая пятница от 1 сентября"},
  {"inboxItemId":"i2","type":"menu","text":"Пушкинский музей","projectId":null,
   "deadline":null,"remindAt":null,"estimatedDuration":"long",
   "comment":null,"note":"Приятное и без срока"}
]}`;

/** Ответ провайдера не получен или не разобран — работаем без ИИ, текст не теряем. */
export class AiUnavailableError extends Error {}

/**
 * Реальный провайдер разбора: любой OpenAI-совместимый endpoint (в том числе
 * Azure OpenAI — отличается только AI_BASE_URL). Прямой HTTP вместо SDK, чтобы
 * бизнес-логика не зависела от конкретной библиотеки.
 *
 * Ключ живёт только на сервере и не попадает ни во фронтенд, ни в логи.
 */
@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly logger = new Logger('AiProvider');

  constructor(@Inject(MockAiProvider) private readonly fallback: MockAiProvider) {}

  async propose(
    items: { id: string; originalText: string }[],
    ctx: AiParseContext,
  ): Promise<InboxProposal[]> {
    if (items.length === 0) return [];
    try {
      return await this.ask(items, ctx);
    } catch (e) {
      // деградируем на детерминированные правила: исходный текст не теряется,
      // человек всё равно увидит предпросмотр и решит сам
      this.logger.warn(
        `Разбор через ИИ не удался (${e instanceof Error ? e.message : String(e)}), ` +
          'использую правила без ИИ',
      );
      const fallback = await this.fallback.propose(items, ctx);
      return fallback.map((p) => ({
        ...p,
        note: 'ИИ недоступен — предложено по правилам, проверьте внимательнее',
      }));
    }
  }

  private async ask(
    items: { id: string; originalText: string }[],
    ctx: AiParseContext,
  ): Promise<InboxProposal[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${env.AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: JSON.stringify({
                today: ctx.today,
                projects: ctx.projects.map((p) => ({
                  id: p.id,
                  title: p.title,
                  direction: p.directionName,
                })),
                items: items.map((i) => ({ id: i.id, text: i.originalText })),
              }),
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });
    } catch (e) {
      throw new AiUnavailableError(controller.signal.aborted ? 'таймаут' : `сеть: ${String(e)}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new AiUnavailableError(`HTTP ${res.status}`);

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new AiUnavailableError('пустой ответ');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new AiUnavailableError('ответ не является JSON');
    }

    const envelope = aiEnvelopeSchema.safeParse(parsed);
    if (!envelope.success) throw new AiUnavailableError('в ответе нет items');

    // элементы проверяем поодиночке: кривой один не отменяет разбор остальных
    const good: z.infer<typeof aiItemSchema>[] = [];
    let bad = 0;
    for (const raw of envelope.data.items) {
      const item = aiItemSchema.safeParse(raw);
      if (item.success) good.push(item.data);
      else bad += 1;
    }
    if (bad > 0) {
      this.logger.warn(`ИИ вернул ${bad} запис(ь/и) не по схеме — они уйдут человеку как есть`);
    }
    if (good.length === 0) throw new AiUnavailableError('ни одна запись не прошла проверку схемой');

    return this.toProposals(good, items, ctx);
  }

  /** Сверка с реальностью: чужие id проектов и записи не из запроса отбрасываются. */
  private toProposals(
    aiItems: z.infer<typeof aiItemSchema>[],
    items: { id: string; originalText: string }[],
    ctx: AiParseContext,
  ): InboxProposal[] {
    const known = new Set(items.map((i) => i.id));
    const projectIds = new Set(ctx.projects.map((p) => p.id));
    const byId = new Map(
      aiItems.filter((a) => known.has(a.inboxItemId)).map((a) => [a.inboxItemId, a]),
    );

    return items.map((item) => {
      const a = byId.get(item.id);
      if (!a) {
        // модель промолчала про эту запись — оставляем во входящих, не гадаем
        return {
          inboxItemId: item.id,
          type: 'keep' as const,
          text: item.originalText.slice(0, 500),
          note: 'ИИ не предложил ничего для этой записи',
        };
      }
      const projectId = a.projectId && projectIds.has(a.projectId) ? a.projectId : null;
      return {
        inboxItemId: item.id,
        type: a.type,
        text: a.text,
        projectId,
        deadline: a.deadline,
        remindAt: a.remindAt,
        comment: a.comment,
        // параметры меню имеют смысл только для меню: в задаче они лишний шум
        menuCategory: a.type === 'menu' ? (a.menuCategory ?? null) : null,
        energy: a.type === 'menu' ? (a.energy ?? null) : null,
        estimatedTime: a.type === 'menu' ? (a.estimatedTime ?? null) : null,
        cost: a.type === 'menu' ? (a.cost ?? null) : null,
        place: a.type === 'menu' ? (a.place ?? null) : null,
        note:
          a.projectId && !projectId ? 'Проект не распознан — выберите сами' : (a.note ?? undefined),
      };
    });
  }
}

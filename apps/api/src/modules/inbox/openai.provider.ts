import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { InboxProposal } from '@planner/contracts';
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
});
const aiResponseSchema = z.object({ items: z.array(aiItemSchema) });

const SYSTEM_PROMPT = `Ты помогаешь разбирать входящие заметки в личном планировщике.
Задача: для каждой записи предложить, чем она могла бы стать. Ты ничего не создаёшь —
человек увидит предложение и подтвердит или откажется.

Жёсткие правила:
1. НЕ ВЫДУМЫВАЙ ДАТЫ. deadline и remindAt заполняй, только если дата явно названа
   в тексте («в пятницу», «3 сентября», «завтра»). Во всех остальных случаях — null.
2. projectId бери ТОЛЬКО из списка проектов, который тебе дан. Если подходящего
   нет или ты не уверена — null. Не придумывай идентификаторы.
3. Если запись — просто мысль без действия, тип "note" или "keep".
4. text — короткая формулировка на русском, без слов «надо», «не забыть», «напомни».
   Сохраняй смысл и имена собственные из оригинала.
5. Не придумывай подробностей, которых нет в тексте.
6. Отвечай строго в заданной JSON-схеме, по одному элементу на каждую входящую запись.`;

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

    const check = aiResponseSchema.safeParse(parsed);
    if (!check.success) throw new AiUnavailableError('ответ не прошёл проверку схемой');

    return this.toProposals(check.data.items, items, ctx);
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
        note:
          a.projectId && !projectId ? 'Проект не распознан — выберите сами' : (a.note ?? undefined),
      };
    });
  }
}

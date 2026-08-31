import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  ApplyInboxResult,
  CreateInboxItemInput,
  InboxItem,
  InboxProposal,
} from '@planner/contracts';
import { MENU_DEFAULTS } from '@planner/contracts';
import { todayInTimezone } from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import {
  directions,
  inboxItems,
  mediaItems,
  menuItems,
  projects,
  reminders,
  tasks,
  users,
} from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { iso, isoRequired } from '../../common/mappers.js';
import { AI_PROVIDER, type AiProvider } from './ai.provider.js';

type Row = typeof inboxItems.$inferSelect;

const toItem = (r: Row): InboxItem => ({
  id: r.id,
  userId: r.userId,
  originalText: r.originalText,
  source: r.source as InboxItem['source'],
  status: r.status as InboxItem['status'],
  proposedType: r.proposedType as InboxItem['proposedType'],
  createdAt: isoRequired(r.createdAt),
  processedAt: iso(r.processedAt),
});

@Injectable()
export class InboxService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  async list(userId: string): Promise<InboxItem[]> {
    const rows = await this.db
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.userId, userId), eq(inboxItems.status, 'new')))
      .orderBy(desc(inboxItems.createdAt));
    return rows.map(toItem);
  }

  async create(userId: string, input: CreateInboxItemInput): Promise<InboxItem> {
    const [row] = await this.db
      .insert(inboxItems)
      .values({ userId, originalText: input.originalText, source: input.source })
      .returning();
    return toItem(row as Row);
  }

  async update(userId: string, id: string, text: string): Promise<InboxItem> {
    const [row] = await this.db
      .update(inboxItems)
      .set({ originalText: text })
      .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id)))
      .returning();
    if (!row) throw ApiException.notFound('Запись входящих');
    return toItem(row);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    await this.db
      .update(inboxItems)
      .set({ status: 'deleted', processedAt: new Date() })
      .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, id)));
    return { ok: true };
  }

  /** Пакетный разбор: только предпросмотр, ничего не сохраняется. */
  async propose(userId: string): Promise<InboxProposal[]> {
    const items = await this.list(userId);
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    const projectRows = await this.db
      .select({ id: projects.id, title: projects.title, directionName: directions.name })
      .from(projects)
      .innerJoin(directions, eq(directions.id, projects.directionId))
      .where(and(eq(projects.userId, userId), eq(projects.status, 'active')));
    return this.ai.propose(
      items.map((i) => ({ id: i.id, originalText: i.originalText })),
      { today: todayInTimezone(user?.timezone ?? 'UTC'), projects: projectRows },
    );
  }

  /** Применение подтверждённых предложений. Ничего не применяется без явного выбора. */
  async apply(userId: string, proposals: InboxProposal[]): Promise<ApplyInboxResult> {
    const skipped: ApplyInboxResult['skipped'] = [];
    let applied = 0;

    for (const p of proposals) {
      const [item] = await this.db
        .select()
        .from(inboxItems)
        .where(and(eq(inboxItems.userId, userId), eq(inboxItems.id, p.inboxItemId)));
      if (!item) {
        skipped.push({ inboxItemId: p.inboxItemId, reason: 'Запись не найдена' });
        continue;
      }

      try {
        switch (p.type) {
          case 'keep':
            skipped.push({ inboxItemId: p.inboxItemId, reason: 'Оставлено во входящих' });
            continue;
          case 'reminder': {
            if (!p.remindAt) {
              skipped.push({ inboxItemId: p.inboxItemId, reason: 'Не выбрана дата напоминания' });
              continue;
            }
            const [user] = await this.db.select().from(users).where(eq(users.id, userId));
            await this.db.insert(reminders).values({
              userId,
              text: p.text,
              scheduledDate: p.remindAt,
              scheduledTime: null,
              timezone: user?.timezone ?? 'UTC',
              deliveryMode: p.deliveryMode ?? 'digest',
              source: item.source === 'telegram' ? 'telegram' : 'web',
              comment: p.comment ?? null,
            });
            break;
          }
          case 'task': {
            if (!p.projectId) {
              skipped.push({ inboxItemId: p.inboxItemId, reason: 'Не выбран проект' });
              continue;
            }
            const [project] = await this.db
              .select({ id: projects.id, status: projects.status })
              .from(projects)
              .where(and(eq(projects.userId, userId), eq(projects.id, p.projectId)));
            if (!project) {
              skipped.push({ inboxItemId: p.inboxItemId, reason: 'Проект не найден' });
              continue;
            }
            if (project.status === 'archived') {
              skipped.push({ inboxItemId: p.inboxItemId, reason: 'Проект завершён' });
              continue;
            }
            const [{ value } = { value: 0 }] = await this.db
              .select({ value: sql<number>`coalesce(max(${tasks.sortOrder}), -1) + 1` })
              .from(tasks)
              .where(and(eq(tasks.userId, userId), eq(tasks.projectId, p.projectId)));
            await this.db.insert(tasks).values({
              userId,
              projectId: p.projectId,
              title: p.text,
              deadline: p.deadline ?? null,
              comment: p.comment ?? null,
              sortOrder: Number(value),
            });
            break;
          }
          case 'project': {
            const [dir] = await this.db
              .select({ id: directions.id })
              .from(directions)
              .where(eq(directions.userId, userId))
              .limit(1);
            if (!dir) {
              skipped.push({ inboxItemId: p.inboxItemId, reason: 'Нет ни одного направления' });
              continue;
            }
            await this.db.insert(projects).values({
              userId,
              directionId: dir.id,
              title: p.text,
              desiredOutcome: p.comment ?? null,
              status: 'paused',
            });
            break;
          }
          case 'menu':
            // раньше здесь были только title и comment, а energy/cost/place/
            // category молча брались из defaults базы — человек их не выбирал
            // и не видел. Теперь применяем ровно то, что он подтвердил.
            await this.db.insert(menuItems).values({
              userId,
              title: p.text,
              comment: p.comment ?? null,
              category: p.menuCategory ?? MENU_DEFAULTS.category,
              energy: p.energy ?? MENU_DEFAULTS.energy,
              estimatedTime: p.estimatedTime ?? MENU_DEFAULTS.estimatedTime,
              cost: p.cost ?? MENU_DEFAULTS.cost,
              place: p.place ?? MENU_DEFAULTS.place,
            });
            break;
          case 'book':
          case 'film':
            await this.db.insert(mediaItems).values({
              userId,
              kind: p.type,
              title: p.text,
              coverEmoji: p.type === 'book' ? '📗' : '🎬',
              comment: p.comment ?? null,
            });
            break;
          case 'note': {
            if (!p.projectId) {
              skipped.push({ inboxItemId: p.inboxItemId, reason: 'Не выбран проект' });
              continue;
            }
            const [project] = await this.db
              .select()
              .from(projects)
              .where(and(eq(projects.userId, userId), eq(projects.id, p.projectId)));
            if (!project) {
              skipped.push({ inboxItemId: p.inboxItemId, reason: 'Проект не найден' });
              continue;
            }
            await this.db
              .update(projects)
              .set({ notes: [...(project.notes ?? []), p.text], updatedAt: new Date() })
              .where(eq(projects.id, p.projectId));
            break;
          }
        }
        await this.db
          .update(inboxItems)
          .set({ status: 'processed', proposedType: p.type, processedAt: new Date() })
          .where(eq(inboxItems.id, p.inboxItemId));
        applied += 1;
      } catch (e) {
        skipped.push({
          inboxItemId: p.inboxItemId,
          reason: e instanceof Error ? e.message : 'Не удалось применить',
        });
      }
    }

    return { applied, skipped };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type {
  ApplyInboxResult,
  CreateInboxItemInput,
  InboxItem,
  InboxProposal,
} from '@planner/contracts';
import { MENU_DEFAULTS } from '@planner/contracts';
import { todayInTimezone } from '@planner/shared';
import { DB, type Database } from '../../db/db.module.js';
import { directions, inboxItems, projects, users } from '../../db/schema.js';
import { ApiException } from '../../common/api-error.js';
import { iso, isoRequired } from '../../common/mappers.js';
import { AI_PROVIDER, type AiProvider } from './ai.provider.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { MenuService } from '../menu/menu.service.js';
import { MediaService } from '../media/media.service.js';

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

/** Причина, по которой запись осталась во входящих. */
class SkipReason extends Error {}

@Injectable()
export class InboxService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(MenuService) private readonly menu: MenuService,
    @Inject(MediaService) private readonly media: MediaService,
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

  /**
   * Применение подтверждённых предложений. Ничего не применяется без явного
   * выбора.
   *
   * Каждый тип уходит в свой сервис, а не в db.insert напрямую. Раньше здесь
   * лежала вторая копия правил создания, и она успела разойтись с первой:
   * напоминание из входящих не смотрело на настройку «если пропущено» и всегда
   * ложилось в дневную сводку, задача считала себе sortOrder вручную, а проект
   * заводился в первом попавшемся направлении.
   */
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
        await this.applyOne(userId, p, item.source === 'telegram' ? 'telegram' : 'web');
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

  private async applyOne(
    userId: string,
    p: InboxProposal,
    source: 'web' | 'telegram',
  ): Promise<void> {
    switch (p.type) {
      case 'keep':
        throw new SkipReason('Оставлено во входящих');

      case 'reminder': {
        if (!p.remindAt) throw new SkipReason('Не выбрана дата напоминания');
        // deliveryMode и missedBehavior считает сервис: со временем —
        // отдельное уведомление, без времени — дневная сводка, а поведение
        // при пропуске берётся из настроек человека
        await this.reminders.create(userId, {
          text: p.text,
          scheduledDate: p.remindAt,
          scheduledTime: p.remindTime ?? null,
          source,
          comment: p.comment ?? null,
        });
        return;
      }

      case 'task': {
        if (!p.projectId) throw new SkipReason('Не выбран проект');
        const project = await this.projects
          .get(userId, p.projectId)
          .catch(() => Promise.reject(new SkipReason('Проект не найден')));
        if (project.status === 'archived') throw new SkipReason('Проект завершён');
        await this.tasks.create(userId, {
          projectId: p.projectId,
          title: p.text,
          deadline: p.deadline ?? null,
          // дата напоминания задачи — та же, что у предложения: иначе
          // «напомнить» из формулировки просто терялось
          remindAt: p.remindAt ?? null,
          comment: p.comment ?? null,
          pinned: false,
        });
        return;
      }

      case 'project': {
        if (!p.directionId) throw new SkipReason('Не выбрано направление');
        const [dir] = await this.db
          .select({ id: directions.id })
          .from(directions)
          .where(and(eq(directions.userId, userId), eq(directions.id, p.directionId)));
        if (!dir) throw new SkipReason('Направление не найдено');
        // проект из входящих заводится живым: «на паузе» означало бы, что
        // человек его уже отложил, а он только что решил его начать
        await this.projects.create(userId, {
          directionId: p.directionId,
          title: p.text,
          desiredOutcome: p.comment ?? null,
          status: 'active',
          notes: [],
        });
        return;
      }

      case 'menu':
        await this.menu.create(userId, {
          title: p.text,
          comment: p.comment ?? null,
          category: p.menuCategory ?? MENU_DEFAULTS.category,
          energy: p.energy ?? MENU_DEFAULTS.energy,
          estimatedTime: p.estimatedTime ?? MENU_DEFAULTS.estimatedTime,
          cost: p.cost ?? MENU_DEFAULTS.cost,
          place: p.place ?? MENU_DEFAULTS.place,
          company: p.company ?? MENU_DEFAULTS.company,
          tried: false,
        });
        return;

      case 'book':
      case 'film':
        await this.media.create(userId, {
          kind: p.type,
          title: p.text,
          coverEmoji: p.type === 'book' ? '📗' : '🎬',
          comment: p.comment ?? null,
          status: 'want',
          pinned: false,
          rating: 0,
        });
        return;
    }
  }
}

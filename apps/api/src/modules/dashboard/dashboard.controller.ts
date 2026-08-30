import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, eq } from 'drizzle-orm';
import { todayInTimezone } from '@planner/shared';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { DB, type Database } from '../../db/db.module.js';
import { calendarEvents, calendars, users } from '../../db/schema.js';
import { FocusService } from '../focus/focus.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { MediaService } from '../media/media.service.js';
import { TouchesService } from '../touches/touches.service.js';

/**
 * Один запрос для главной страницы: «Сегодня», фокус, закреплённое,
 * карта касаний и закреплённые книги. Экономит десяток round-trip.
 */
@ApiTags('dashboard')
@UseGuards(AuthGuard)
@Controller('api/dashboard')
export class DashboardController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FocusService) private readonly focus: FocusService,
    @Inject(TasksService) private readonly tasks: TasksService,
    @Inject(RemindersService) private readonly reminders: RemindersService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(TouchesService) private readonly touches: TouchesService,
  ) {}

  @Get()
  async get(@CurrentUser() userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    const timezone = user?.timezone ?? 'UTC';
    const today = todayInTimezone(timezone);

    const [focus, dueTasks, overdueTasks, todayReminders, pinnedMedia, heatmap] = await Promise.all(
      [
        this.focus.get(userId),
        this.tasks.listDue(userId, today),
        this.tasks.listOverdue(userId, today),
        this.reminders.listToday(userId),
        this.media.listPinned(userId),
        this.touches.heatmap(userId, 26),
      ],
    );

    const pinnedTasks = (await this.tasks.listPinned(userId)).filter(
      (t) => t.id !== focus.activeTaskId,
    );

    // События подключённых календарей. Пока это моковые данные из seed —
    // реальная синхронизация с Google и Яндексом требует OAuth и бэкенда.
    const events = await this.db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        time: calendarEvents.time,
        duration: calendarEvents.duration,
        calendarName: calendars.name,
      })
      .from(calendarEvents)
      .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
      .where(
        and(
          eq(calendarEvents.userId, userId),
          eq(calendarEvents.date, today),
          eq(calendars.enabled, true),
        ),
      )
      .orderBy(calendarEvents.time);

    return {
      today,
      timezone,
      focus,
      events,
      dueTasks,
      overdueTasks,
      todayReminders,
      pinnedTasks,
      pinnedMedia,
      heatmap,
    };
  }
}

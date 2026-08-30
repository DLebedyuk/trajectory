import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DbModule } from './db/db.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DirectionsModule } from './modules/directions/directions.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { FocusModule } from './modules/focus/focus.module.js';
import { TouchesModule } from './modules/touches/touches.module.js';
import { RemindersModule } from './modules/reminders/reminders.module.js';
import { InboxModule } from './modules/inbox/inbox.module.js';
import { MenuModule } from './modules/menu/menu.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { TelegramModule } from './modules/telegram/telegram.module.js';
import { CalendarModule } from './modules/calendar/calendar.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DbModule,
    AuthModule,
    DirectionsModule,
    ProjectsModule,
    TasksModule,
    FocusModule,
    TouchesModule,
    RemindersModule,
    InboxModule,
    MenuModule,
    MediaModule,
    SettingsModule,
    DashboardModule,
    HealthModule,
    TelegramModule,
    CalendarModule,
  ],
})
export class AppModule {}

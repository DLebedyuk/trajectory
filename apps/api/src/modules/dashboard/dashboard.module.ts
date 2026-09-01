import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { FocusModule } from '../focus/focus.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { MediaModule } from '../media/media.module.js';
import { TouchesModule } from '../touches/touches.module.js';
import { ProjectsModule } from '../projects/projects.module.js';

@Module({
  imports: [FocusModule, TasksModule, RemindersModule, MediaModule, TouchesModule, ProjectsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}

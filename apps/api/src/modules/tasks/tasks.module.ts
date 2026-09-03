import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { FocusModule } from '../focus/focus.module.js';
import { TouchesModule } from '../touches/touches.module.js';

@Module({
  imports: [FocusModule, TouchesModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}

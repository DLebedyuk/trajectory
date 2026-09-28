import { Module } from '@nestjs/common';
import { HabitsController } from './habits.controller.js';
import { HabitsService } from './habits.service.js';

@Module({
  controllers: [HabitsController],
  providers: [HabitsService],
})
export class HabitsModule {}

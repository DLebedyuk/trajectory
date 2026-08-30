import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createReminderSchema,
  reminderToTaskSchema,
  snoozeReminderSchema,
  updateReminderSchema,
} from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { RemindersService } from './reminders.service.js';

@ApiTags('reminders')
@UseGuards(AuthGuard)
@Controller('api/reminders')
export class RemindersController {
  constructor(@Inject(RemindersService) private readonly service: RemindersService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.service.listActive(userId);
  }

  @Get('today')
  today(@CurrentUser() userId: string) {
    return this.service.listToday(userId);
  }

  @Get('archive')
  archive(@CurrentUser() userId: string) {
    return this.service.archive(userId);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.get(userId, id);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createReminderSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateReminderSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as never);
  }

  @Post(':id/complete')
  complete(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.complete(userId, id);
  }

  @Post(':id/snooze')
  snooze(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(snoozeReminderSchema)) body: unknown,
  ) {
    return this.service.snooze(userId, id, body as never);
  }

  @Post(':id/to-task')
  toTask(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(reminderToTaskSchema)) body: unknown,
  ) {
    return this.service.convertToTask(userId, id, body as never);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}

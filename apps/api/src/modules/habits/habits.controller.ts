import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createHabitSchema,
  updateHabitSchema,
  type CreateHabitInput,
  type UpdateHabitInput,
} from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { HabitsService } from './habits.service.js';

@ApiTags('habits')
@UseGuards(AuthGuard)
@Controller('api/habits')
export class HabitsController {
  constructor(@Inject(HabitsService) private readonly service: HabitsService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query('directionId') directionId?: string) {
    return this.service.list(userId, directionId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createHabitSchema)) body: unknown) {
    return this.service.create(userId, body as CreateHabitInput);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateHabitSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as UpdateHabitInput);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}

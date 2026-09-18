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
  createTripChecklistItemSchema,
  createTripSchema,
  updateTripChecklistItemSchema,
  updateTripSchema,
} from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { TripsService } from './trips.service.js';

@ApiTags('travel')
@UseGuards(AuthGuard)
@Controller('api/travel/trips')
export class TripsController {
  constructor(@Inject(TripsService) private readonly service: TripsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.service.listWithStats(userId);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.get(userId, id);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createTripSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateTripSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as never);
  }

  @Post(':id/complete')
  complete(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.complete(userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }

  @Get(':id/checklist')
  listChecklist(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.listChecklist(userId, id);
  }

  @Post(':id/checklist')
  addChecklistItem(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(createTripChecklistItemSchema)) body: unknown,
  ) {
    return this.service.addChecklistItem(userId, id, body as never);
  }

  @Patch(':id/checklist/:itemId')
  updateChecklistItem(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(zodBody(updateTripChecklistItemSchema)) body: unknown,
  ) {
    return this.service.updateChecklistItem(userId, id, itemId, body as never);
  }

  @Delete(':id/checklist/:itemId')
  removeChecklistItem(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removeChecklistItem(userId, id, itemId);
  }

  /** Первая генерация и «Обновить рекомендации» — один и тот же эндпоинт. */
  @Post(':id/refresh-checklist')
  refreshChecklist(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.refreshChecklist(userId, id);
  }
}

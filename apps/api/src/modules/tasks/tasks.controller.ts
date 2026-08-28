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
  createChecklistItemSchema,
  createTaskSchema,
  reorderSchema,
  taskFilterSchema,
  updateChecklistItemSchema,
  updateTaskSchema,
} from '@planner/contracts';
import { CurrentUser, DevAuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { TasksService } from './tasks.service.js';
import { FocusService } from '../focus/focus.service.js';
import { ApiException } from '../../common/api-error.js';

@ApiTags('tasks')
@UseGuards(DevAuthGuard)
@Controller('api/tasks')
export class TasksController {
  constructor(
    @Inject(TasksService) private readonly service: TasksService,
    @Inject(FocusService) private readonly focus: FocusService,
  ) {}

  @Get()
  list(
    @CurrentUser() userId: string,
    @Query('projectId') projectId?: string,
    @Query() query?: Record<string, string>,
  ) {
    if (!projectId) throw ApiException.validation('Нужен параметр projectId');
    const filter = taskFilterSchema.parse(query ?? {});
    return this.service.listByProject(userId, projectId, filter);
  }

  @Get('pinned')
  pinned(@CurrentUser() userId: string, @Query('directionId') directionId?: string) {
    return this.service.listPinned(userId, directionId);
  }

  @Get('due')
  due(@CurrentUser() userId: string, @Query('date') date: string) {
    return this.service.listDue(userId, date);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.get(userId, id);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createTaskSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  @Patch('reorder')
  reorder(@CurrentUser() userId: string, @Body(zodBody(reorderSchema)) body: unknown) {
    return this.service.reorder(userId, (body as { ids: string[] }).ids);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateTaskSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as never);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }

  @Post(':id/complete')
  complete(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.complete(userId, id);
  }

  @Post(':id/reopen')
  reopen(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.reopen(userId, id);
  }

  @Post(':id/pin')
  pin(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.setPinned(userId, id, true);
  }

  @Post(':id/unpin')
  unpin(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.setPinned(userId, id, false);
  }

  /** Сделать задачу активной. Направление её проекта автоматически уходит в фокус. */
  @Post(':id/activate')
  activate(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.focus.setActiveTask(userId, id);
  }

  @Post(':id/checklist')
  addChecklist(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(createChecklistItemSchema)) body: unknown,
  ) {
    return this.service.addChecklistItem(userId, id, (body as { text: string }).text);
  }

  @Patch(':id/checklist/:itemId')
  updateChecklist(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(zodBody(updateChecklistItemSchema)) body: unknown,
  ) {
    return this.service.updateChecklistItem(userId, id, itemId, body as never);
  }

  @Delete(':id/checklist/:itemId')
  removeChecklist(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.service.removeChecklistItem(userId, id, itemId);
  }
}

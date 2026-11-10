import { Body, Controller, Delete, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CreateBoardColumnInput, UpdateBoardColumnInput } from '@planner/contracts';
import {
  createBoardColumnSchema,
  reorderSchema,
  updateBoardColumnSchema,
} from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { TasksService } from './tasks.service.js';

/**
 * Столбцы канбан-доски направления. Список приходит вместе с доской
 * (GET /api/tasks/board), здесь — только правка.
 */
@ApiTags('board')
@UseGuards(AuthGuard)
@Controller('api/board-columns')
export class BoardColumnsController {
  constructor(@Inject(TasksService) private readonly service: TasksService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createBoardColumnSchema)) body: unknown) {
    const { directionId, title } = body as CreateBoardColumnInput;
    return this.service.createColumn(userId, directionId, title);
  }

  @Patch('reorder')
  reorder(@CurrentUser() userId: string, @Body(zodBody(reorderSchema)) body: unknown) {
    return this.service.reorderColumns(userId, (body as { ids: string[] }).ids);
  }

  @Patch(':id')
  rename(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateBoardColumnSchema)) body: unknown,
  ) {
    return this.service.renameColumn(userId, id, (body as UpdateBoardColumnInput).title);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.removeColumn(userId, id);
  }
}

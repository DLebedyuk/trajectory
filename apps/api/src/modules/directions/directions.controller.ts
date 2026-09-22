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
import { createDirectionSchema, reorderSchema, updateDirectionSchema } from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { DirectionsService } from './directions.service.js';

@ApiTags('directions')
@UseGuards(AuthGuard)
@Controller('api/directions')
export class DirectionsController {
  constructor(@Inject(DirectionsService) private readonly service: DirectionsService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query('includeArchived') includeArchived?: string) {
    return this.service.list(userId, includeArchived === 'true');
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.get(userId, id);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createDirectionSchema)) body: unknown) {
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
    @Body(zodBody(updateDirectionSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as never);
  }

  @Post(':id/archive')
  archive(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.archive(userId, id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.restore(userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}

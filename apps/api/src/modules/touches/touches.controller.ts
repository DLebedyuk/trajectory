import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createTouchSchema, touchQuerySchema } from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { TouchesService } from './touches.service.js';

@ApiTags('touches')
@UseGuards(AuthGuard)
@Controller('api/touches')
export class TouchesController {
  constructor(@Inject(TouchesService) private readonly service: TouchesService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query() query: Record<string, string>) {
    return this.service.list(userId, touchQuerySchema.parse(query));
  }

  @Get('heatmap')
  heatmap(
    @CurrentUser() userId: string,
    @Query('weeks') weeks?: string,
    @Query('directionId') directionId?: string,
  ) {
    return this.service.heatmap(userId, Number(weeks ?? 26), directionId);
  }

  @Get('day/:date')
  byDate(
    @CurrentUser() userId: string,
    @Param('date') date: string,
    @Query('directionId') directionId?: string,
  ) {
    return this.service.byDate(userId, date, directionId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createTouchSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  @Delete(':id')
  remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.remove(userId, id);
  }
}

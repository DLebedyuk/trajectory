import { Body, Controller, Delete, Get, Inject, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { setActiveTaskSchema, setFocusDirectionSchema } from '@planner/contracts';
import { CurrentUser, AuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { FocusService } from './focus.service.js';

@ApiTags('focus')
@UseGuards(AuthGuard)
@Controller('api/focus')
export class FocusController {
  constructor(@Inject(FocusService) private readonly service: FocusService) {}

  @Get()
  get(@CurrentUser() userId: string) {
    return this.service.get(userId);
  }

  @Put('direction')
  setDirection(
    @CurrentUser() userId: string,
    @Body(zodBody(setFocusDirectionSchema)) body: unknown,
  ) {
    const input = body as {
      directionId: string | null;
      onConflict: 'ask' | 'keepTask' | 'clearTask';
    };
    return this.service.setDirection(userId, input.directionId, input.onConflict);
  }

  @Delete('direction')
  clearDirection(@CurrentUser() userId: string) {
    return this.service.setDirection(userId, null, 'clearTask');
  }

  @Put('active-task')
  setActive(@CurrentUser() userId: string, @Body(zodBody(setActiveTaskSchema)) body: unknown) {
    return this.service.setActiveTask(userId, (body as { taskId: string | null }).taskId);
  }

  @Delete('active-task')
  clearActive(@CurrentUser() userId: string) {
    return this.service.setActiveTask(userId, null);
  }
}

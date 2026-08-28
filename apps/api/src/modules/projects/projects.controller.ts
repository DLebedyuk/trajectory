import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createProjectSchema, updateProjectSchema } from '@planner/contracts';
import { CurrentUser, DevAuthGuard } from '../../common/current-user.js';
import { zodBody } from '../../common/zod.pipe.js';
import { ProjectsService } from './projects.service.js';
import { ApiException } from '../../common/api-error.js';

@ApiTags('projects')
@UseGuards(DevAuthGuard)
@Controller('api/projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly service: ProjectsService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query('directionId') directionId?: string) {
    if (!directionId) throw ApiException.validation('Нужен параметр directionId');
    return this.service.listByDirection(userId, directionId);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.get(userId, id);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(zodBody(createProjectSchema)) body: unknown) {
    return this.service.create(userId, body as never);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(zodBody(updateProjectSchema)) body: unknown,
  ) {
    return this.service.update(userId, id, body as never);
  }

  @Post(':id/pause')
  pause(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.pause(userId, id);
  }

  @Post(':id/resume')
  resume(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.resume(userId, id);
  }

  @Post(':id/complete')
  complete(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.service.complete(userId, id);
  }
}

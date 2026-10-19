import { Module } from '@nestjs/common';
import { OverviewController, ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  controllers: [ProjectsController, OverviewController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

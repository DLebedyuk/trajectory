import { Module } from '@nestjs/common';
import { TouchesController } from './touches.controller.js';
import { TouchesService } from './touches.service.js';

@Module({
  controllers: [TouchesController],
  providers: [TouchesService],
  exports: [TouchesService],
})
export class TouchesModule {}

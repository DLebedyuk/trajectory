import { Module } from '@nestjs/common';
import { FocusController } from './focus.controller.js';
import { FocusService } from './focus.service.js';

@Module({
  controllers: [FocusController],
  providers: [FocusService],
  exports: [FocusService],
})
export class FocusModule {}

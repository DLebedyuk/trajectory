import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller.js';
import { InboxService } from './inbox.service.js';
import { MockAiProvider } from './ai.provider.js';

@Module({
  controllers: [InboxController],
  providers: [InboxService, MockAiProvider],
  exports: [InboxService],
})
export class InboxModule {}

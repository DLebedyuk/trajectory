import { Module } from '@nestjs/common';
import { InboxController } from './inbox.controller.js';
import { InboxService } from './inbox.service.js';
import { AI_PROVIDER, MockAiProvider, type AiProvider } from './ai.provider.js';
import { OpenAiProvider } from './openai.provider.js';
import { env } from '../../config/env.js';

/**
 * Какой разбор входящих использовать. Без ключа остаёмся на mock: локальная
 * разработка и тесты не должны зависеть от внешнего сервиса и не должны
 * случайно тратить деньги.
 */
const aiProviderFactory = {
  provide: AI_PROVIDER,
  useFactory: (mock: MockAiProvider, openai: OpenAiProvider): AiProvider =>
    env.AI_PROVIDER === 'openai' && env.AI_API_KEY ? openai : mock,
  inject: [MockAiProvider, OpenAiProvider],
};

@Module({
  controllers: [InboxController],
  providers: [InboxService, MockAiProvider, OpenAiProvider, aiProviderFactory],
  exports: [InboxService],
})
export class InboxModule {}

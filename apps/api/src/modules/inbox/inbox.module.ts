import { Logger, Module } from '@nestjs/common';
import { InboxController } from './inbox.controller.js';
import { InboxService } from './inbox.service.js';
import { AI_PROVIDER, MockAiProvider, type AiProvider } from './ai.provider.js';
import { OpenAiProvider } from './openai.provider.js';
import { env } from '../../config/env.js';
import { RemindersModule } from '../reminders/reminders.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { MenuModule } from '../menu/menu.module.js';
import { MediaModule } from '../media/media.module.js';

/**
 * Какой разбор входящих использовать. Без ключа остаёмся на mock: локальная
 * разработка и тесты не должны зависеть от внешнего сервиса и не должны
 * случайно тратить деньги.
 */
const aiProviderFactory = {
  provide: AI_PROVIDER,
  useFactory: (mock: MockAiProvider, openai: OpenAiProvider): AiProvider => {
    const logger = new Logger('AiProvider');
    if (env.AI_PROVIDER === 'openai' && env.AI_API_KEY) {
      logger.log(`Разбор входящих через ИИ: ${env.AI_MODEL} (${env.AI_BASE_URL}).`);
      return openai;
    }
    // молчаливый mock — самая частая причина «ИИ ничего не разбирает»,
    // поэтому причина всегда называется вслух при старте
    logger.warn(
      env.AI_API_KEY
        ? 'Ключ ИИ задан, но AI_PROVIDER не равен "openai" — входящие разбираются правилами.'
        : 'AI_API_KEY не задан — входящие разбираются правилами, без ИИ.',
    );
    return mock;
  },
  inject: [MockAiProvider, OpenAiProvider],
};

@Module({
  // разбор входящих создаёт задачи, проекты, напоминания и записи полки
  // через их собственные сервисы — второй копии правил быть не должно
  imports: [RemindersModule, TasksModule, ProjectsModule, MenuModule, MediaModule],
  controllers: [InboxController],
  providers: [InboxService, MockAiProvider, OpenAiProvider, aiProviderFactory],
  exports: [InboxService],
})
export class InboxModule {}

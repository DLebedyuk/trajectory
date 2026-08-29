import './load-env.js';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_MODE: z.enum(['polling', 'webhook', 'off']).default('polling'),
  TELEGRAM_WEBHOOK_URL: z.string().optional().default(''),
  DEV_USER_ID: z.string().uuid().default('00000000-0000-4000-8000-000000000001'),
  DEV_AUTH: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  APP_TIMEZONE: z.string().default('Europe/Moscow'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

export const isDevAuthEnabled = env.DEV_AUTH && env.NODE_ENV !== 'production';

/**
 * В production dev-авторизация запрещена. Если её всё-таки включили,
 * приложение не должно тихо стартовать с открытым доступом.
 */
export function assertAuthConfiguration(logger: { warn: (m: string) => void }): void {
  if (env.NODE_ENV === 'production' && env.DEV_AUTH) {
    throw new Error(
      'DEV_AUTH=true в production запрещён: настройте настоящую авторизацию или выставьте DEV_AUTH=false.',
    );
  }
  if (isDevAuthEnabled) {
    logger.warn(
      `DEV-РЕЖИМ АВТОРИЗАЦИИ: все запросы выполняются от пользователя ${env.DEV_USER_ID}, ` +
        'а заголовок x-user-id принимается без проверки. Только для локальной разработки.',
    );
    return;
  }
  logger.warn(
    'Провайдер авторизации не подключён, а dev-режим выключен: API будет отвечать 401 на все запросы.',
  );
}

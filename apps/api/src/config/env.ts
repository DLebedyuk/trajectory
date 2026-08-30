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
  /** Имя бота без @ — нужно для deep link «открыть бота с кодом». */
  TELEGRAM_BOT_USERNAME: z.string().optional().default(''),
  /**
   * Секрет вебхука. Telegram присылает его в X-Telegram-Bot-Api-Secret-Token,
   * и без проверки ручку /api/telegram/webhook может дёрнуть кто угодно.
   */
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .optional()
    .default('')
    // Telegram принимает только эти символы; кириллицу он молча не примет,
    // а HTTP-заголовок с ней вообще не собирается
    .refine((v) => v === '' || /^[A-Za-z0-9_-]{1,256}$/.test(v), {
      message: 'TELEGRAM_WEBHOOK_SECRET: только латиница, цифры, дефис и подчёркивание',
    }),
  DEV_USER_ID: z.string().uuid().default('00000000-0000-4000-8000-000000000001'),
  DEV_AUTH: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  APP_TIMEZONE: z.string().default('Europe/Moscow'),

  // --- авторизация через Google ---
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_AUTH_REDIRECT_URI: z
    .string()
    .optional()
    .default('http://localhost:3000/api/auth/google/callback'),
  GOOGLE_CALENDAR_REDIRECT_URI: z
    .string()
    .optional()
    .default('http://localhost:3000/api/calendar/google/callback'),
  /** Куда возвращать браузер после входа. */
  APP_BASE_URL: z.string().default('http://localhost:5173'),
  /** Подпись и срок жизни сессии. */
  SESSION_SECRET: z.string().optional().default(''),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** 32 байта в hex или base64 — шифрование refresh-токенов в БД. */
  TOKEN_ENCRYPTION_KEY: z.string().optional().default(''),

  // --- ИИ ---
  AI_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  AI_API_KEY: z.string().optional().default(''),
  AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

export const isDevAuthEnabled = env.DEV_AUTH && env.NODE_ENV !== 'production';

/** Настоящий вход через Google доступен, только если заданы оба секрета. */
export const isGoogleAuthConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/**
 * В production dev-авторизация запрещена. Если её всё-таки включили,
 * приложение не должно тихо стартовать с открытым доступом.
 */
export function assertAuthConfiguration(logger: {
  warn: (m: string) => void;
  log: (m: string) => void;
}): void {
  if (env.NODE_ENV === 'production' && env.DEV_AUTH) {
    throw new Error(
      'DEV_AUTH=true в production запрещён: настройте настоящую авторизацию или выставьте DEV_AUTH=false.',
    );
  }
  if (isGoogleAuthConfigured) {
    logger.log('Вход через Google настроен.');
  }
  if (env.NODE_ENV === 'production' && !isGoogleAuthConfigured) {
    throw new Error(
      'В production нужен вход через Google: задайте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.',
    );
  }
  if (env.NODE_ENV === 'production' && !env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET обязателен в production.');
  }
  if (isDevAuthEnabled) {
    logger.warn(
      `DEV-РЕЖИМ АВТОРИЗАЦИИ: все запросы выполняются от пользователя ${env.DEV_USER_ID}, ` +
        'а заголовок x-user-id принимается без проверки. Только для локальной разработки.',
    );
    return;
  }
  if (!isGoogleAuthConfigured) {
    logger.warn(
      'Провайдер авторизации не подключён, а dev-режим выключен: API будет отвечать 401 на все запросы.',
    );
  }
}

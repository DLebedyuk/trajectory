/*
  Окружение тестового прогона. Подключается как setupFiles и выполняется
  ДО импортов тестового файла — то есть до того, как src/config/env.ts
  прочитает process.env.

  Зачем: apps/api/src/config/load-env.ts ищет .env вверх по дереву и находит
  корневой .env разработчика. У него там свои значения — в том числе рабочий
  AI_API_KEY и AI_PROVIDER=openai. Тестовые файлы выставляли только NODE_ENV,
  DEV_AUTH и TELEGRAM_MODE, а настройки ИИ подхватывались из .env: обычный
  `pnpm test` мог сходить в живой платный endpoint.

  Здесь значения выставляются жёстко, поверх всего, что могло прийти снаружи.
*/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Значения, без которых тестовый прогон нельзя считать изолированным. */
const FORCED: Record<string, string> = {
  NODE_ENV: 'test',
  DEV_AUTH: 'true',
  TELEGRAM_MODE: 'off',
  TELEGRAM_BOT_TOKEN: '',
  TELEGRAM_WEBHOOK_URL: '',
  TELEGRAM_WEBHOOK_SECRET: '',
  AI_PROVIDER: 'mock',
  AI_API_KEY: '',
  // ключа нет, но пусть и адрес указывает в никуда: если провайдер всё-таки
  // окажется живым, запрос уйдёт не к настоящему OpenAI
  AI_BASE_URL: 'http://127.0.0.1:9/must-not-be-called',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
};

for (const [key, value] of Object.entries(FORCED)) process.env[key] = value;

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/planner_test';

/**
 * Сторож сетевых вызовов. Тесты работают только с локальной базой и с
 * приложением, поднятым в этом же процессе, — любой запрос наружу означает,
 * что заглушка где-то не сработала.
 *
 * Записываем и запрещаем, а не молча пропускаем: пропущенный запрос к
 * платному API замечается по счёту, а не по красному тесту.
 */
export interface BlockedCall {
  url: string;
  method: string;
}

const blocked: BlockedCall[] = [];

/*
  setupFiles выполняется для каждого файла набора отдельно, поэтому список
  в памяти виден только внутри своего файла. Чтобы после полного прогона
  можно было проверить весь набор разом, каждая попытка дописывается ещё и
  в файл. Он пересоздаётся первым же файлом набора и лежит рядом со сборкой,
  а не в репозитории.
*/
const AUDIT_FILE = path.join(os.tmpdir(), 'planner-blocked-network.log');

/** Локальные адреса разрешены: это supertest и postgres. */
const isLocal = (url: string): boolean => {
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    // относительный адрес до сети всё равно не доберётся
    return true;
  }
};

const realFetch = globalThis.fetch;

type FetchArgs = Parameters<typeof fetch>;

globalThis.fetch = (async (input: FetchArgs[0], init?: FetchArgs[1]) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as { url: string }).url;
  if (!isLocal(url)) {
    const method = init?.method ?? 'GET';
    blocked.push({ url, method });
    try {
      fs.appendFileSync(AUDIT_FILE, `${method} ${url}\n`);
    } catch {
      // журнал — вспомогательный: если писать некуда, тест всё равно упадёт
    }
    throw new Error(
      `Тесты не ходят в сеть: ${method} ${url}. ` +
        'Если это ИИ, Google или Telegram — значит заглушка не сработала.',
    );
  }
  return realFetch(input, init);
}) as typeof fetch;

/** Что тестовый прогон пытался запросить снаружи. В норме — пусто. */
export const blockedNetworkCalls = (): readonly BlockedCall[] => blocked;

declare global {
  var __blockedNetworkCalls: (() => readonly BlockedCall[]) | undefined;
  var __networkAuditFile: string | undefined;
}

// набор запускается по файлам в отдельных модульных графах, поэтому доступ
// к списку идёт через globalThis, а не через импорт этого модуля
globalThis.__blockedNetworkCalls = blockedNetworkCalls;

/** Путь к журналу попыток выйти в сеть — его читает отчёт после прогона. */
export const networkAuditFile = (): string => AUDIT_FILE;
globalThis.__networkAuditFile = AUDIT_FILE;

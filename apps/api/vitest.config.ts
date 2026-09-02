import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  /**
   * Workspace-пакеты подключаются напрямую из src.
   *
   * package.json у них указывает на dist, которого в чистом checkout нет:
   * тесты проходили только потому, что рядом случайно оставалась сборка
   * с прошлого раза. Здесь это уже не так — набор запускается сразу после
   * pnpm install, без предварительного build.
   */
  resolve: {
    alias: {
      '@planner/contracts': path.resolve(root, '../../packages/contracts/src/index.ts'),
      '@planner/shared': path.resolve(root, '../../packages/shared/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    /*
      Выполняется до импортов тестового файла, то есть до того, как
      src/config/env.ts прочитает process.env. Здесь прогон отвязывается от
      корневого .env разработчика: ИИ — заглушка, Telegram выключен,
      сеть наружу закрыта.
    */
    setupFiles: ['./test/env.setup.ts'],
    // тесты делят одну базу и чистят её в beforeAll — файлы идут строго по очереди
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

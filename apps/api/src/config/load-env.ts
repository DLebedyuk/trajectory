import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * .env ищется вверх по дереву: от текущей папки и от места этого файла
 * до корня диска. Так одного .env в корне монорепо хватает и для `pnpm dev:api`,
 * и для `pnpm db:migrate`, который запускается уже внутри apps/api.
 * Ближний файл важнее дальнего — dotenv не перезаписывает заданные переменные.
 */
export function loadEnvFiles(): void {
  const seen = new Set<string>();
  for (const start of [process.cwd(), __dirname]) {
    let dir = start;
    for (;;) {
      if (!seen.has(dir)) {
        seen.add(dir);
        const file = path.join(dir, '.env');
        if (fs.existsSync(file)) loadDotenv({ path: file });
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
}

loadEnvFiles();

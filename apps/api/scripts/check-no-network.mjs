#!/usr/bin/env node
/**
 * Аудит после полного прогона тестов.
 *
 * test/env.setup.ts перехватывает fetch и дописывает каждую попытку выйти
 * в нелокальную сеть в журнал во временной папке. Здесь журнал проверяется
 * целиком: setupFiles выполняется для каждого файла отдельно, поэтому
 * ассерт внутри одного теста покрывает только свой файл, а этот скрипт —
 * весь набор.
 *
 *   node apps/api/scripts/check-no-network.mjs
 *
 * Запускать сразу после `pnpm test`, а перед прогоном — с `--reset`.
 * Обе половины делает `pnpm --filter @planner/api test:audited`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file = path.join(os.tmpdir(), 'planner-blocked-network.log');

// `--reset` вызывается перед прогоном: журнал не должен накапливаться
// между запусками, иначе вчерашняя попытка провалит сегодняшний аудит
if (process.argv.includes('--reset')) {
  fs.rmSync(file, { force: true });
  process.exit(0);
}

if (!fs.existsSync(file)) {
  console.log('Попыток выйти в сеть за прогон не было: журнал пуст.');
  process.exit(0);
}

const lines = fs
  .readFileSync(file, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

// Один вызов делает сам тест изоляции: он проверяет, что сторож живой.
const DELIBERATE = 'GET https://api.openai.com/v1/chat/completions';
const unexpected = lines.filter((l) => l !== DELIBERATE);

if (unexpected.length > 0) {
  console.error('Тесты пытались выйти в сеть:');
  for (const line of unexpected) console.error(`  ${line}`);
  console.error(
    '\nНи один запрос не ушёл — сторож их заблокировал, — но заглушка где-то не сработала.',
  );
  process.exit(1);
}

const probes = lines.length - unexpected.length;
console.log(
  `Живых запросов наружу не было. Заблокированных попыток: ${lines.length}` +
    (probes ? ` (все ${probes} — намеренная проверка сторожа из isolation.test.ts).` : '.'),
);

#!/usr/bin/env node
/**
 * Дымовая проверка собранного приложения.
 *
 * Тесты и `pnpm dev` идут через tsx, а он не эмитит design:paramtypes.
 * Собранный tsc-ом код ведёт себя иначе: Nest видит метаданные и пытается
 * внедрять зависимости по типам. Из-за этого приложение может падать на
 * старте, оставаясь полностью зелёным в тестах — так и случилось с
 * DevAuthGuard. Проверка поднимает именно dist и стучится в /health.
 *
 * Нужна поднятая база: DATABASE_URL или дефолт ниже.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.SMOKE_PORT ?? '3111';
const timeoutMs = 40_000;

const child = spawn(process.execPath, ['dist/main.js'], {
  cwd: apiDir,
  env: {
    ...process.env,
    PORT: port,
    NODE_ENV: 'development',
    DEV_AUTH: 'true',
    TELEGRAM_MODE: 'off',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (c) => (output += c));
child.stderr.on('data', (c) => (output += c));

function finish(code, message) {
  child.kill('SIGKILL');
  if (code === 0) console.log(message);
  else {
    console.error(message);
    console.error('\n--- вывод приложения ---\n' + output);
  }
  process.exit(code);
}

child.on('exit', (code) => finish(1, `Приложение завершилось на старте (код ${code}).`));

const started = Date.now();
async function poll() {
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        const body = await res.json();
        finish(0, `Собранное приложение поднялось: /health → ${JSON.stringify(body)}`);
        return;
      }
    } catch {
      // ещё не слушает
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  finish(1, `За ${timeoutMs / 1000} с приложение так и не ответило на /health.`);
}

void poll();

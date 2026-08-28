#!/usr/bin/env node
/**
 * Сборка десктопного приложения. Tauri требует Rust, которого может не быть
 * на машине — тогда шаг честно помечается пропущенным, а не притворяется
 * успешным. Общая сборка монорепо от этого не падает.
 */
import { spawnSync } from 'node:child_process';

const hasRust = spawnSync('cargo', ['--version'], { stdio: 'ignore', shell: true }).status === 0;

if (!hasRust) {
  console.warn(
    'Десктоп: сборка ПРОПУЩЕНА — не найден Rust (cargo).\n' +
      'Установите Rust (https://rustup.rs) и повторите: pnpm --filter @planner/desktop tauri:build',
  );
  process.exit(0);
}

const result = spawnSync('pnpm', ['exec', 'tauri', 'build'], { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);

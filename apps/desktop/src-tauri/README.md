# Десктопная сборка (Tauri 2)

React-приложение не дублируется: Tauri в dev-режиме открывает `http://localhost:5173`,
а в production открывает сайт с сервера — `https://yourtrajectory.app` (`frontendDist`).
Своей копии интерфейса в exe нет, поэтому десктоп обновляется вместе с каждой
выкладкой веба; пересобирать exe нужно только при изменениях в самой обёртке
(`src-tauri/`). Что приложение открыто в программе, веб узнаёт во время работы
(`apps/web/src/desktop.ts`), а права на вход через браузер выданы адресу сайта в
`capabilities/default.json` (`remote`). Без интернета окно не откроется — но без
сервера приложение и так бесполезно: все данные там.

## Требования

- Rust (rustup) — в окружении, где собирался проект, он отсутствовал, поэтому реальная сборка не проверялась
- Windows: Microsoft Visual Studio C++ Build Tools и WebView2
- Linux: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`
- macOS: Xcode Command Line Tools

## Команды

```bash
pnpm --filter @planner/desktop dev          # окно + Vite с горячей перезагрузкой
pnpm --filter @planner/desktop tauri:build  # установочный пакет
```

## Иконки

В `icons/` нужно положить `32x32.png`, `128x128.png`, `icon.ico`, `icon.icns`.
Сгенерировать из одного PNG: `pnpm --filter @planner/desktop tauri icon path/to/icon.png`.

## Права

В `capabilities/default.json` включён только `core:default`. Доступ к файловой
системе и оболочке не выдан — добавляйте разрешения только под конкретную задачу.

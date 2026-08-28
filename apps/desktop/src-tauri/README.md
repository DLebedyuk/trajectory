# Десктопная сборка (Tauri 2)

React-приложение не дублируется: Tauri в dev-режиме открывает `http://localhost:5173`,
а в production упаковывает уже собранный `apps/web/dist`.

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

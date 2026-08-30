#!/bin/sh
# Запуск API в контейнере: сначала схема, потом приложение.
# Без этого база в docker-стенде остаётся пустой и все запросы к данным падают.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] Применяю миграции…"
  node dist/db/migrate.js
fi

# Демо-данные принадлежат seed-пользователю. При настоящем входе через Google
# вы попадаете в свой пустой аккаунт и этих данных не увидите — это нормально.
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] Загружаю демо-данные…"
  node dist/db/seed.js
fi

echo "[entrypoint] Стартую API…"
exec node dist/main.js

# Развёртывание «Траектории» на VPS

Один сервер, docker compose, HTTPS от Let's Encrypt. Рассчитано на несколько
человек — саму себя плюс тех, кого позовёте потыкать.

Локальный `docker-compose.yml` остаётся как был: он для машины разработчика,
публикует наружу базу и API и живёт на `http://localhost:8080`. Production —
отдельный файл `docker-compose.prod.yml`, они не мешают друг другу.

---

## Что нужно до начала

- VPS с Ubuntu 22.04 или новее. Хватит **2 ГБ памяти и 2 ядер**: PostgreSQL,
  API и Caddy вместе занимают меньше гигабайта, остальное — запас на сборку
  образов. Диска — 20 ГБ.
- Домен, у которого A-запись указывает на IP этого сервера. Без него Caddy не
  получит сертификат.
- Открытые снаружи 80 и 443. Больше ничего открывать не нужно и не следует.

Docker ставится так:

```bash
curl -fsSL https://get.docker.com | sh
```

Файрвол — минимальный набор:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Порты 5432 и 3000 в этом списке отсутствуют намеренно: в
`docker-compose.prod.yml` у postgres и api вообще нет секции `ports`, наружу
они не смотрят, и добираться до них можно только изнутри сети compose.

---

## Первый запуск

```bash
git clone <адрес репозитория> planner
cd planner

cp .env.production.example .env.production
nano .env.production          # заполнить, см. подсказки в самом файле

./infrastructure/check-prod-config.sh
```

Проверка ничего не печатает из значений — только имена переменных и «задано»
или «пусто». Её вывод можно кому угодно показать.

Секреты удобно сгенерировать так:

```bash
openssl rand -base64 24    # POSTGRES_PASSWORD
openssl rand -base64 48    # SESSION_SECRET
openssl rand -hex 32       # TOKEN_ENCRYPTION_KEY — ровно 32 байта
openssl rand -hex 16       # TELEGRAM_WEBHOOK_SECRET
```

**`TOKEN_ENCRYPTION_KEY` менять нельзя.** Им зашифрованы refresh-токены Google
в базе: со сменой ключа старые токены не расшифруются и календарь придётся
подключать заново. Запишите его туда же, где храните пароли.

Когда проверка проходит:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Первый запуск занимает несколько минут: собираются образы, а Caddy получает
сертификат. Как идут дела:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f web
```

Строчка вида `certificate obtained successfully` означает, что HTTPS готов.
Дальше `https://ВАШ_ДОМЕН` должен открыться.

### Google

В Google Cloud Console → Credentials → OAuth 2.0 Client ID (тип Web) в
«Authorized redirect URIs» добавьте **оба** адреса:

```
https://ВАШ_ДОМЕН/api/auth/google/callback
https://ВАШ_ДОМЕН/api/calendar/google/callback
```

Для календаря отдельно включите **Google Calendar API** в том же проекте.
Если не включить, Google отвечает 403 `accessNotConfigured`, и приложение
покажет доступ отозванным — это ровно тот случай, который уже был.

### Telegram

Поставьте `TELEGRAM_MODE=webhook` и заполните токен с секретом. Адрес вебхука
приложение соберёт само — `https://ВАШ_ДОМЕН/api/telegram/webhook` — и
зарегистрирует его при старте. Отдельно ничего вызывать не нужно.

Секрет обязателен: без него ручку вебхука может дёрнуть кто угодно, и бот
станет открытым входом в вашу базу.

---

## Миграции

Применяются **автоматически при каждом старте контейнера api** —
`RUN_MIGRATIONS=true` по умолчанию, `docker-entrypoint.sh` прогоняет их до
запуска приложения. Отдельная команда нужна редко:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec api node dist/db/migrate.js
```

Что уже применено:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec postgres psql -U planner -d planner -c 'select * from drizzle.__drizzle_migrations'
```

Демо-данные в production не загружаются никогда: `RUN_SEED` там прибит к
`false`, и переменной окружения это не переопределяется.

---

## Резервное копирование

Данные живут в томе `pgdata`. Файлы приложения ценности не представляют —
их всегда можно собрать заново из репозитория. Беречь надо базу и
`.env.production`.

Разовый дамп:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres pg_dump -U planner -d planner --clean --if-exists \
  | gzip > ~/backup/planner-$(date +%F).sql.gz
```

Каждую ночь в 3:30 — строкой в `crontab -e` (свой путь подставьте):

```
30 3 * * * cd /home/USER/planner && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres pg_dump -U planner -d planner --clean --if-exists | gzip > /home/USER/backup/planner-$(date +\%F).sql.gz && find /home/USER/backup -name 'planner-*.sql.gz' -mtime +14 -delete
```

Проценты в cron нужно экранировать — отсюда `\%F`. Последняя часть удаляет
дампы старше двух недель.

**Дамп, который ни разу не разворачивали, — не резервная копия.** Проверьте
хотя бы раз:

```bash
gunzip -c ~/backup/planner-2026-09-02.sql.gz | head -40
```

Восстановление:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production stop api
gunzip -c ~/backup/planner-2026-09-02.sql.gz | docker compose \
  -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U planner -d planner
docker compose -f docker-compose.prod.yml --env-file .env.production start api
```

`.env.production` скопируйте куда-нибудь отдельно один раз — он почти не
меняется, но без `TOKEN_ENCRYPTION_KEY` восстановленная база не отдаст токены
Google.

---

## Обновление

```bash
cd planner
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Compose пересоберёт изменившиеся образы и перезапустит только те контейнеры,
которые поменялись. Миграции применятся сами при старте api.

Перед обновлением, которое несёт миграции, снимите дамп — откатывать миграции
приложение не умеет.

Посмотреть, что происходит:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=100 api
```

Откат на предыдущую версию кода:

```bash
git log --oneline -5
git checkout <хеш>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Помните: код откатится, а схема базы — нет. Если между версиями была миграция,
разворачивайте дамп.

### Остановка

```bash
# остановить, данные сохранить
docker compose -f docker-compose.prod.yml --env-file .env.production down

# остановить и стереть базу — обратного пути нет
docker compose -f docker-compose.prod.yml --env-file .env.production down -v
```

`down -v` сносит тома, включая `pgdata` и сертификаты Caddy. В production эту
команду набирать незачем.

---

## Если что-то не работает

**Сертификат не выдаётся.** Проверьте, что A-запись домена указывает на этот
сервер (`dig +short ВАШ_ДОМЕН`) и что 80 порт открыт: Let's Encrypt проверяет
владение доменом именно через него. У Let's Encrypt есть лимит на повторные
попытки — если упёрлись, подождите час.

**Сайт открывается, вход через Google не проходит.** Адреса возврата в Google
Console должны совпадать с доменом посимвольно, включая `https://` и
отсутствие слэша в конце.

**API не поднимается.** `logs api`. Частые причины: пустой `SESSION_SECRET`,
`DEV_AUTH=true` (в production приложение с ним намеренно не стартует),
недоступная база.

**Бот молчит.** `logs api` при старте пишет, зарегистрирован ли вебхук.
Проверьте `TELEGRAM_WEBHOOK_SECRET`: он допускает только латиницу, цифры,
дефис и подчёркивание — кириллицу Telegram молча не примет.

#!/usr/bin/env bash
# Проверка production-настроек ДО запуска стенда.
#
# Ничего не печатает из значений: только имена переменных и «задано» или
# «пусто». Вывод можно показывать кому угодно и вставлять в отчёт.
#
#   ./infrastructure/check-prod-config.sh [путь-к-env-файлу]
#
# По умолчанию читает .env.production рядом с docker-compose.prod.yml.

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

ENV_FILE="${1:-.env.production}"
COMPOSE_FILE="docker-compose.prod.yml"

red() { printf '\033[31m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }

problems=0
warnings=0
fail() {
  red "  ✗ $1"
  problems=$((problems + 1))
}
warn() {
  yellow "  ! $1"
  warnings=$((warnings + 1))
}
ok() { green "  ✓ $1"; }

if [ ! -f "$ENV_FILE" ]; then
  red "Файла $ENV_FILE нет. Скопируйте .env.production.example и заполните."
  exit 1
fi

# Читаем файл в ассоциативный массив, не экспортируя ничего в окружение:
# так значения не утекут в дочерние процессы и не попадут в вывод.
declare -A VARS=()
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"
  value="${line#*=}"
  key="${key#"${key%%[![:space:]]*}"}"
  key="${key%"${key##*[![:space:]]}"}"
  [ -n "$key" ] && VARS["$key"]="$value"
done <"$ENV_FILE"

get() { printf '%s' "${VARS[$1]-}"; }
is_set() { [ -n "$(get "$1")" ]; }

echo
echo "Файл настроек: $ENV_FILE"
echo

echo "Обязательные значения"
for key in DOMAIN ACME_EMAIL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB \
  SESSION_SECRET TOKEN_ENCRYPTION_KEY GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  if is_set "$key"; then ok "$key задан"; else fail "$key пуст"; fi
done

echo
echo "Домен"
domain="$(get DOMAIN)"
if [ -n "$domain" ]; then
  case "$domain" in
    localhost|127.0.0.1|*.local)
      fail "DOMAIN=$domain — Let's Encrypt такой сертификат не выдаст" ;;
    http://*|https://*)
      fail "DOMAIN должен быть именем без схемы: planner.example.com" ;;
    *.*) ok "домен выглядит публичным" ;;
    *) fail "DOMAIN без точки — на такое имя сертификат не получить" ;;
  esac
fi

echo
echo "Секреты нужной длины"
if is_set TOKEN_ENCRYPTION_KEY; then
  key_len=${#VARS[TOKEN_ENCRYPTION_KEY]}
  # 64 hex-символа или 44 символа base64 — оба варианта дают 32 байта
  if [ "$key_len" -eq 64 ] || [ "$key_len" -eq 44 ]; then
    ok "TOKEN_ENCRYPTION_KEY нужного размера ($key_len символов)"
  else
    fail "TOKEN_ENCRYPTION_KEY длиной $key_len — нужно 64 hex или 44 base64 (32 байта)"
  fi
fi
if is_set SESSION_SECRET; then
  s_len=${#VARS[SESSION_SECRET]}
  if [ "$s_len" -ge 32 ]; then
    ok "SESSION_SECRET длиной $s_len символов"
  else
    fail "SESSION_SECRET слишком короткий ($s_len): нужно хотя бы 32 символа"
  fi
fi
if is_set POSTGRES_PASSWORD; then
  p_len=${#VARS[POSTGRES_PASSWORD]}
  if [ "$p_len" -ge 16 ]; then
    ok "пароль базы длиной $p_len символов"
  else
    fail "пароль базы слишком короткий ($p_len): нужно хотя бы 16 символов"
  fi
  # Пароль подставляется в postgres://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@postgres:5432/БАЗА.
  # Символы / + = : @ ломают разбор этой строки, и API просто не найдёт базу.
  if printf '%s' "$(get POSTGRES_PASSWORD)" | grep -qE '[^A-Za-z0-9_.~-]'; then
    fail "в пароле базы есть символы, ломающие строку подключения — возьмите openssl rand -hex 24"
  else
    ok "пароль базы безопасен для строки подключения"
  fi
fi

echo
echo "Telegram"
tg_mode="$(get TELEGRAM_MODE)"
case "${tg_mode:-off}" in
  off) ok "бот выключен (TELEGRAM_MODE=off)" ;;
  webhook)
    is_set TELEGRAM_BOT_TOKEN || fail "TELEGRAM_MODE=webhook, но TELEGRAM_BOT_TOKEN пуст"
    if is_set TELEGRAM_WEBHOOK_SECRET; then
      if printf '%s' "$(get TELEGRAM_WEBHOOK_SECRET)" | grep -qE '^[A-Za-z0-9_-]{1,256}$'; then
        ok "секрет вебхука задан и допустимого формата"
      else
        fail "TELEGRAM_WEBHOOK_SECRET: только латиница, цифры, дефис и подчёркивание"
      fi
    else
      fail "TELEGRAM_MODE=webhook без TELEGRAM_WEBHOOK_SECRET — ручку сможет дёрнуть кто угодно"
    fi
    # Имя бота нужно не боту, а приложению: из него собирается ссылка
    # t.me/ИМЯ?start=КОД, которой аккаунт привязывается к Telegram.
    if is_set TELEGRAM_BOT_USERNAME; then
      case "$(get TELEGRAM_BOT_USERNAME)" in
        @*) fail "TELEGRAM_BOT_USERNAME указан с собачкой — нужно имя без @" ;;
        *) ok "имя бота задано" ;;
      esac
    else
      warn "TELEGRAM_BOT_USERNAME пуст: бот будет отвечать, но привязать аккаунт ссылкой не выйдет"
    fi
    ok "адрес вебхука соберётся как https://$domain/api/telegram/webhook"
    ;;
  polling)
    warn "TELEGRAM_MODE=polling: на сервере лучше webhook, он не зависит от исходящей сети"
    ;;
  *) fail "TELEGRAM_MODE=$tg_mode — допустимо off, webhook или polling" ;;
esac

echo
echo "Разбор входящих"
case "$(get AI_PROVIDER)" in
  ''|mock) ok "AI_PROVIDER=mock — разбор правилами, без внешних запросов" ;;
  openai)
    if is_set AI_API_KEY; then
      warn "AI_PROVIDER=openai — запросы платные и уходят наружу"
    else
      fail "AI_PROVIDER=openai, но AI_API_KEY пуст — разбор молча откатится к правилам"
    fi
    ;;
  *) fail "AI_PROVIDER должен быть mock или openai" ;;
esac

echo
echo "Что compose открывает наружу"
if ! command -v docker >/dev/null 2>&1; then
  warn "docker не найден — список портов не проверен"
else
  # --env-file, чтобы подстановки разрешились; печатаем ТОЛЬКО номера портов
  published="$(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" config 2>/dev/null |
    grep -E '^\s+published:' | sed -E 's/.*published:\s*"?([0-9]+)"?.*/\1/' | sort -u | tr '\n' ' ')"
  if [ -z "$published" ]; then
    warn "не удалось разобрать порты из $COMPOSE_FILE"
  else
    ok "публикуются порты: $published"
    for port in $published; do
      case "$port" in
        80|443) ;;
        *) fail "порт $port не должен быть открыт наружу" ;;
      esac
    done
    case " $published " in
      *" 5432 "*) fail "база опубликована наружу" ;;
      *) ok "postgres наружу не публикуется" ;;
    esac
    case " $published " in
      *" 3000 "*) fail "API опубликован наружу" ;;
      *) ok "api наружу не публикуется" ;;
    esac
  fi
fi

echo
echo "Режим приложения"
grep -q "NODE_ENV: production" "$COMPOSE_FILE" && ok "NODE_ENV=production" ||
  fail "в $COMPOSE_FILE нет NODE_ENV=production"
grep -q "DEV_AUTH: 'false'" "$COMPOSE_FILE" && ok "DEV_AUTH=false" ||
  fail "в $COMPOSE_FILE не выключен DEV_AUTH"
grep -q "RUN_SEED: 'false'" "$COMPOSE_FILE" && ok "демо-данные не загружаются" ||
  fail "в $COMPOSE_FILE не выключен RUN_SEED"
grep -q 'GOOGLE_AUTH_REDIRECT_URI: https://' "$COMPOSE_FILE" &&
  grep -q 'GOOGLE_CALENDAR_REDIRECT_URI: https://' "$COMPOSE_FILE" &&
  ok "оба адреса возврата Google — на https и на домене" ||
  fail "адреса возврата Google не на https"

echo
if [ "$problems" -gt 0 ]; then
  red "Проблем: $problems. Стенд запускать рано."
  exit 1
fi
if [ "$warnings" -gt 0 ]; then
  yellow "Замечаний: $warnings. Запускать можно, но прочитайте их."
  exit 0
fi
green "Всё в порядке."

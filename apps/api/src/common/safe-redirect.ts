import { env } from '../config/env.js';

/**
 * Куда разрешено вернуть браузер после входа через Google.
 *
 * Параметр redirectTo приходит из адресной строки, попадает в базу вместе с
 * state и позже отдаётся в Location. Без проверки это открытый редирект:
 * ссылка вида /api/auth/google?redirectTo=https://злой.сайт проводит человека
 * через настоящий экран Google и высаживает на чужой странице — уже «после
 * входа», то есть в момент максимального доверия.
 *
 * Разрешаем только два случая: внутренний путь и адрес с тем же origin, что
 * у APP_BASE_URL. Всё остальное молча заменяется на корень приложения:
 * ломать вход из-за кривого параметра незачем.
 */
export function safeRedirect(candidate: string | null | undefined, fallbackPath = '/'): string {
  const base = env.APP_BASE_URL.replace(/\/+$/, '');
  const fallback = `${base}${fallbackPath.startsWith('/') ? fallbackPath : `/${fallbackPath}`}`;
  if (!candidate) return fallback;

  const value = candidate.trim();
  if (value === '') return fallback;

  // «//evil.example» и «/\evil.example» браузер читает как внешний адрес,
  // хотя выглядят они как внутренний путь
  if (/^\/{2,}/.test(value) || /^\/\\/.test(value)) return fallback;

  if (value.startsWith('/')) return `${base}${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fallback;
  }
  // сравниваем origin целиком: схема, хост и порт. Совпадение по одному лишь
  // хосту пропустило бы http-версию и злой.сайт.наш-домен.ru
  return url.origin === new URL(base).origin ? url.toString() : fallback;
}

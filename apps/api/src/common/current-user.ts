import {
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  type CanActivate,
} from '@nestjs/common';
import type { Request } from 'express';
import { env, isDevAuthEnabled } from '../config/env.js';
import { ApiException } from './api-error.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
}

export interface AuthConfig {
  /** Разрешена ли подстановка пользователя без настоящей авторизации. */
  devAuth: boolean;
  devUserId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authConfigFromEnv(): AuthConfig {
  return { devAuth: isDevAuthEnabled, devUserId: env.DEV_USER_ID };
}

/**
 * Кто выполняет запрос.
 *
 * Заголовок x-user-id — инструмент разработки: он позволяет проверять
 * многопользовательские сценарии, не поднимая настоящий auth. Доверять ему
 * можно ТОЛЬКО при включённой dev-авторизации, иначе кто угодно представится
 * кем угодно. Вне dev-режима — 401 и ожидание настоящего провайдера.
 */
export function resolveUserId(header: string | undefined, config: AuthConfig): string {
  if (!config.devAuth) {
    throw ApiException.unauthorized(
      'Авторизация не настроена. Включите DEV_AUTH для локальной разработки или подключите реальный провайдер.',
    );
  }
  if (header === undefined) return config.devUserId;
  if (!UUID_RE.test(header)) {
    throw ApiException.unauthorized('Заголовок x-user-id должен быть UUID пользователя.');
  }
  return header;
}

/**
 * DEVELOPMENT-ONLY. Подставляет пользователя без настоящей авторизации.
 *
 * Конструктора у гварда нет намеренно. Nest создаёт гвард через контейнер
 * внедрения; при сборке через tsc включён emitDecoratorMetadata, и любой
 * параметр конструктора попадает в design:paramtypes. Интерфейс в метаданных
 * вырождается в Object, Nest ищет провайдер Object, не находит и роняет
 * приложение на старте. В dev через tsx этого не видно — esbuild метаданные
 * не эмитит, — поэтому решение принимает чистая функция resolveUserId,
 * которую можно проверить тестом без всякого Nest.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    req.userId = resolveUserId(req.header('x-user-id'), authConfigFromEnv());
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.userId) throw ApiException.unauthorized();
  return req.userId;
});

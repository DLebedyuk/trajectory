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

/**
 * DEVELOPMENT-ONLY. Подставляет пользователя без настоящей авторизации.
 *
 * Заголовок x-user-id — инструмент разработки: он позволяет проверять
 * многопользовательские сценарии, не поднимая настоящий auth. Доверять ему
 * можно ТОЛЬКО при включённой dev-авторизации, иначе кто угодно представится
 * кем угодно. Вне dev-режима гвард отвечает 401 и ждёт настоящего провайдера.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  private readonly config: AuthConfig;

  constructor(config?: AuthConfig) {
    this.config = config ?? { devAuth: isDevAuthEnabled, devUserId: env.DEV_USER_ID };
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!this.config.devAuth) {
      throw ApiException.unauthorized(
        'Авторизация не настроена. Включите DEV_AUTH для локальной разработки или подключите реальный провайдер.',
      );
    }

    const header = req.header('x-user-id');
    if (header !== undefined) {
      if (!UUID_RE.test(header)) {
        throw ApiException.unauthorized('Заголовок x-user-id должен быть UUID пользователя.');
      }
      req.userId = header;
      return true;
    }

    req.userId = this.config.devUserId;
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.userId) throw ApiException.unauthorized();
  return req.userId;
});

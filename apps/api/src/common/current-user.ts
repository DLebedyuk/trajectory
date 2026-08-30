import {
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  type CanActivate,
} from '@nestjs/common';
import type { Request } from 'express';
import { env, isDevAuthEnabled } from '../config/env.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { readSessionToken } from '../modules/auth/auth.controller.js';
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
 * Кто выполняет запрос, когда настоящей сессии нет.
 *
 * Заголовок x-user-id — инструмент разработки: он позволяет проверять
 * многопользовательские сценарии, не поднимая настоящий вход. Доверять ему
 * можно ТОЛЬКО при включённой dev-авторизации, иначе кто угодно представится
 * кем угодно.
 */
export function resolveUserId(header: string | undefined, config: AuthConfig): string {
  if (!config.devAuth) {
    throw ApiException.unauthorized('Нужно войти в аккаунт.');
  }
  if (header === undefined) return config.devUserId;
  if (!UUID_RE.test(header)) {
    throw ApiException.unauthorized('Заголовок x-user-id должен быть UUID пользователя.');
  }
  return header;
}

/**
 * Основной гвард: сначала настоящая сессия из куки, затем — dev-режим.
 *
 * Параметры конструктора помечены явным @Inject. Без этого tsc записал бы в
 * design:paramtypes тип, который Nest попытался бы найти как провайдер, и
 * собранное приложение упало бы на старте.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = readSessionToken(req);
    if (token) {
      const userId = await this.auth.resolveSession(token);
      if (userId) {
        req.userId = userId;
        return true;
      }
    }

    req.userId = resolveUserId(req.header('x-user-id'), authConfigFromEnv());
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.userId) throw ApiException.unauthorized();
  return req.userId;
});

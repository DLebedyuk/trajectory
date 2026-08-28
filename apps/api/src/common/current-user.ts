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

/**
 * DEVELOPMENT-ONLY. Подставляет фиксированного seed-пользователя.
 * Архитектура при этом остаётся многопользовательской: userId приходит из
 * запроса, а не зашит в сервисы.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.header('x-user-id');
    if (header) {
      req.userId = header;
      return true;
    }
    if (isDevAuthEnabled) {
      req.userId = env.DEV_USER_ID;
      return true;
    }
    throw ApiException.unauthorized(
      'Авторизация не настроена. Включите DEV_AUTH для локальной разработки или подключите реальный провайдер.',
    );
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.userId) throw ApiException.unauthorized();
  return req.userId;
});

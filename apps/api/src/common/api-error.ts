import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@planner/contracts';

/** Единый формат ошибки API: { error: { code, message, details? } }. */
export class ApiException extends HttpException {
  constructor(
    readonly code: ErrorCode | string,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ error: { code, message, details } }, status);
  }

  static notFound(what: string): ApiException {
    return new ApiException(ERROR_CODES.NOT_FOUND, `${what} не найден`, HttpStatus.NOT_FOUND);
  }

  static validation(message: string, details?: unknown): ApiException {
    return new ApiException(ERROR_CODES.VALIDATION, message, HttpStatus.BAD_REQUEST, details);
  }

  static conflict(code: string, message: string, details?: unknown): ApiException {
    return new ApiException(code, message, HttpStatus.CONFLICT, details);
  }

  static unauthorized(message = 'Требуется авторизация'): ApiException {
    return new ApiException(ERROR_CODES.UNAUTHORIZED, message, HttpStatus.UNAUTHORIZED);
  }
}

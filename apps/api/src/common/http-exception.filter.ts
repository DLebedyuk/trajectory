import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ERROR_CODES } from '@planner/contracts';

/** Приводит любые ошибки к единому формату { error: { code, message } }. */
function isHttpException(e: unknown): e is HttpException {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as HttpException).getStatus === 'function' &&
    typeof (e as HttpException).getResponse === 'function'
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    // Утиная типизация вместо instanceof: под vitest в графе может оказаться
    // две копии @nestjs/common, и instanceof тогда ложно отрицателен.
    if (isHttpException(exception)) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null && 'error' in payload) {
        res.status(status).json(payload);
        return;
      }
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string }).message ?? exception.message);
      res.status(status).json({
        error: { code: status === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.VALIDATION, message },
      });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: ERROR_CODES.INTERNAL, message: 'Внутренняя ошибка сервера' },
    });
  }
}

import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { ApiException } from './api-error.js';

/** Валидация входных данных схемой Zod из @planner/contracts. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    // safeParse вместо try/catch: не зависит от instanceof, а значит переживает
    // ситуацию с двумя копиями zod в графе модулей (например, под vitest).
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    throw ApiException.validation('Данные не прошли проверку', result.error.flatten());
  }
}

export const zodBody = (schema: ZodSchema): ZodValidationPipe => new ZodValidationPipe(schema);

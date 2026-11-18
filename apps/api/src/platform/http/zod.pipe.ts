import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { errors } from './app-error.js';

/**
 * Valida entrada com Zod. Os schemas usam `z.strictObject`: campo desconhecido (price, role, status, userId...)
 * vira 400, nunca é ignorado em silêncio (SEC-022).
 */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw errors.validation(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(corpo)',
        message: issue.message,
      })),
    );
  }
}

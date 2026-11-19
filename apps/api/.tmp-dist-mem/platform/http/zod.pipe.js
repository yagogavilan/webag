import { errors } from './app-error.js';
/**
 * Valida entrada com Zod. Os schemas usam `z.strictObject`: campo desconhecido (price, role, status, userId...)
 * vira 400, nunca é ignorado em silêncio (SEC-022).
 */
export class ZodPipe {
    schema;
    constructor(schema) {
        this.schema = schema;
    }
    transform(value) {
        const result = this.schema.safeParse(value ?? {});
        if (result.success)
            return result.data;
        throw errors.validation(result.error.issues.map((issue) => ({
            field: issue.path.join('.') || '(corpo)',
            message: issue.message,
        })));
    }
}
//# sourceMappingURL=zod.pipe.js.map
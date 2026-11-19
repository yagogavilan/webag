import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { parameterHistory, parameters } from './db/schema.js';
import {
  PARAMETER_BY_KEY,
  PARAMETER_DEFINITIONS,
  validateParameterValue,
  type ParameterDefinition,
} from './parameters.definitions.js';

export interface ParameterView {
  key: string;
  value: string | number;
  default: string | number;
  type: ParameterDefinition['type'];
  min: number | null;
  max: number | null;
  values: readonly string[] | null;
  description: string;
  ref: string;
  legalFloor: boolean;
  updatedAt: string | null;
}

const CACHE_TTL_MS = 10_000;

@Injectable()
export class ParametersService {
  private cache: { at: number; values: Map<string, string | number> } | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  private async values(): Promise<Map<string, string | number>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.values;
    const rows = await this.db.select().from(parameters);
    const values = new Map(rows.map((row) => [row.key, row.value]));
    this.cache = { at: Date.now(), values };
    return values;
  }

  /** Valor vigente (ou o padrão, se ainda não houver linha). Muda para todos em até 10 s entre instâncias. */
  async get(key: string): Promise<string | number> {
    const definition = PARAMETER_BY_KEY.get(key);
    if (!definition) throw new Error(`Parâmetro desconhecido: ${key}`);
    return (await this.values()).get(key) ?? definition.default;
  }

  async getNumber(key: string): Promise<number> {
    return Number(await this.get(key));
  }

  async list(): Promise<ParameterView[]> {
    const rows = await this.db.select().from(parameters);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return PARAMETER_DEFINITIONS.map((definition) => {
      const row = byKey.get(definition.key);
      return {
        key: definition.key,
        value: row?.value ?? definition.default,
        default: definition.default,
        type: definition.type,
        min: 'min' in definition ? (definition.min ?? null) : null,
        max: 'max' in definition ? (definition.max ?? null) : null,
        values: definition.type === 'enum' ? definition.values : null,
        description: definition.description,
        ref: definition.ref,
        legalFloor: definition.legalFloor === true,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  /** WB-119 C2/C3: valida faixa, exige motivo, grava histórico e auditoria na mesma transação. */
  async update(key: string, value: unknown, reason: string, ctx: RequestContext, expectedUpdatedAt?: string | null): Promise<ParameterView> {
    const definition = PARAMETER_BY_KEY.get(key);
    if (!definition) throw errors.notFound('Parâmetro não encontrado.');
    if (definition.legalFloor) throw errors.unprocessable('PARAMETER_LOCKED', 'Parâmetro fixo por lei', { detail: 'Piso legal de troca não é editável (DEC-011).' });
    const problem = validateParameterValue(definition, value);
    if (problem) throw errors.unprocessable('PARAMETER_OUT_OF_RANGE', 'Valor fora da faixa', { detail: problem, errors: [{ field: 'value', message: problem }] });
    await this.assertFreeShippingRule(key, value as number);
    await this.write(definition, value as string | number, reason, ctx, 'parameter.update', expectedUpdatedAt);
    return this.view(key);
  }

  /** RN-04 / R-17c: entrega grátis acima de X precisa ser estritamente maior que o pedido mínimo (0 desliga o grátis). */
  private async assertFreeShippingRule(key: string, value: number): Promise<void> {
    if (key !== 'pedido_minimo_cents' && key !== 'frete_gratis_acima_cents') return;
    const min = key === 'pedido_minimo_cents' ? value : await this.getNumber('pedido_minimo_cents');
    const freeAbove = key === 'frete_gratis_acima_cents' ? value : await this.getNumber('frete_gratis_acima_cents');
    if (freeAbove !== 0 && freeAbove <= min) {
      const detail = 'O valor para entrega grátis precisa ser maior que o pedido mínimo (ou 0 para desligar).';
      throw errors.unprocessable('PARAMETER_OUT_OF_RANGE', 'Valor fora da faixa', { detail, errors: [{ field: 'value', message: detail }] });
    }
  }

  /** WB-119 C4: volta ao padrão de seed. */
  async reset(key: string, reason: string, ctx: RequestContext, expectedUpdatedAt?: string | null): Promise<ParameterView> {
    const definition = PARAMETER_BY_KEY.get(key);
    if (!definition) throw errors.notFound('Parâmetro não encontrado.');
    if (definition.legalFloor) throw errors.unprocessable('PARAMETER_LOCKED', 'Parâmetro fixo por lei', { detail: 'Piso legal de troca não é editável (DEC-011).' });
    await this.write(definition, definition.default, reason, ctx, 'parameter.reset', expectedUpdatedAt);
    return this.view(key);
  }

  /** Seed idempotente: cria só o que falta, nunca sobrescreve valor editado pelo admin. */
  async ensureDefaults(): Promise<void> {
    await this.db
      .insert(parameters)
      .values(PARAMETER_DEFINITIONS.map((definition) => ({ key: definition.key, value: definition.default })))
      .onConflictDoNothing();
  }

  private async write(
    definition: ParameterDefinition,
    value: string | number,
    reason: string,
    ctx: RequestContext,
    action: string,
    expectedUpdatedAt?: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(parameters).where(eq(parameters.key, definition.key)).for('update');
      // RN-02: edição concorrente. `undefined` = cliente sem controle de versão; `null` = "nunca foi editado".
      if (expectedUpdatedAt !== undefined) {
        const currentVersion = current?.updatedAt?.getTime() ?? null;
        const expectedVersion = expectedUpdatedAt === null ? null : new Date(expectedUpdatedAt).getTime();
        if (currentVersion !== expectedVersion) {
          throw errors.conflict('PARAMETER_CONFLICT', 'Parâmetro alterado por outra pessoa', 'Outro admin alterou este parâmetro. Recarregue para ver o valor atual.');
        }
      }
      const before = current?.value ?? definition.default;
      await tx
        .insert(parameters)
        .values({ key: definition.key, value, updatedBy: ctx.principal?.userId ?? null })
        .onConflictDoUpdate({
          target: parameters.key,
          set: { value, updatedAt: new Date(), updatedBy: ctx.principal?.userId ?? null },
        });
      await tx.insert(parameterHistory).values({
        key: definition.key,
        oldValue: before,
        newValue: value,
        reason,
        changedBy: ctx.principal?.userId ?? null,
      });
      await this.audit.record(tx, ctx, {
        action,
        targetType: 'parameter',
        targetId: definition.key,
        before: { value: before },
        after: { value },
        reason,
      });
    });
    this.cache = null;
  }

  private async view(key: string): Promise<ParameterView> {
    const found = (await this.list()).find((item) => item.key === key);
    if (!found) throw errors.notFound();
    return found;
  }
}

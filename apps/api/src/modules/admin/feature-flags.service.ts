import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { featureFlags } from './db/schema.js';
import { FEATURE_FLAG_DEFINITIONS, FLAG_KEYS } from './feature-flags.definitions.js';

export interface FlagView {
  key: string;
  enabled: boolean;
  description: string;
  updatedAt: string | null;
}

@Injectable()
export class FeatureFlagsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<FlagView[]> {
    const rows = await this.db.select().from(featureFlags);
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return FEATURE_FLAG_DEFINITIONS.map((definition) => {
      const row = byKey.get(definition.key);
      return {
        key: definition.key,
        enabled: row?.enabled ?? definition.default,
        description: definition.description,
        updatedAt: row?.updatedAt.toISOString() ?? null,
      };
    });
  }

  /** Mapa chave → ligada, para o app (cache de até 60 s no cliente, WB-120 C4). */
  async publicMap(): Promise<Record<string, boolean>> {
    return Object.fromEntries((await this.list()).map((flag) => [flag.key, flag.enabled]));
  }

  async isEnabled(key: string): Promise<boolean> {
    const found = (await this.list()).find((flag) => flag.key === key);
    if (!found) throw new Error(`Feature flag desconhecida: ${key}`);
    return found.enabled;
  }

  async set(key: string, enabled: boolean, ctx: RequestContext, reason?: string): Promise<FlagView> {
    const definition = FEATURE_FLAG_DEFINITIONS.find((flag) => flag.key === key);
    if (!definition || !FLAG_KEYS.has(key)) throw errors.notFound('Feature flag não encontrada.');
    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(featureFlags).where(eq(featureFlags.key, key)).for('update');
      const before = current?.enabled ?? definition.default;
      await tx
        .insert(featureFlags)
        .values({ key, enabled, description: definition.description, updatedBy: ctx.principal?.userId ?? null })
        .onConflictDoUpdate({
          target: featureFlags.key,
          set: { enabled, updatedAt: new Date(), updatedBy: ctx.principal?.userId ?? null },
        });
      await this.audit.record(tx, ctx, {
        action: 'feature_flag.set',
        targetType: 'feature_flag',
        targetId: key,
        before: { enabled: before },
        after: { enabled },
        reason,
      });
    });
    const view = (await this.list()).find((flag) => flag.key === key);
    if (!view) throw errors.notFound();
    return view;
  }

  /** Seed idempotente. */
  async ensureDefaults(): Promise<void> {
    await this.db
      .insert(featureFlags)
      .values(FEATURE_FLAG_DEFINITIONS.map((flag) => ({ key: flag.key, enabled: flag.default, description: flag.description })))
      .onConflictDoNothing();
  }
}

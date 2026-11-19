import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../platform/storage/object-storage.js';
import { ParametersService } from '../admin/index.js';
import { retentionRuns } from './db/schema.js';

const DAY = 86_400_000;
const BATCH = 5_000;

export interface RetentionResult {
  id: string;
  counts: Record<string, number>;
  errors: string[];
}

/**
 * WB-215 / DT-021 / DT-032: expurgo diário, idempotente e em lotes. Cada passo roda isolado (um que falha não derruba os outros),
 * grava só CONTAGENS em `retention_runs` (nunca dado pessoal) e uma falha vira o alerta `retention_failed` ao admin (WB-198).
 *
 * Prazos (parâmetros): registro de acesso 6 meses (piso do Marco Civil), fotos de troca 180 dias após o fim da troca, documentos de
 * loja reprovada 90 dias após a decisão. Sessões vencidas, códigos, tickets, convites usados e webhooks processados não têm
 * finalidade depois de expirar. Dados FISCAIS (pedidos, pagamentos, ledger) não são apagados: viram anônimos na exclusão da conta.
 */
@Injectable()
export class RetentionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RetentionService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly params: ParametersService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timers.push(setInterval(() => void this.runIfDue().catch((e: Error) => this.logger.error(e.message)), 30 * 60_000).unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  /** Roda no máximo uma vez a cada 23 h (a inserção condicional também segura duas instâncias ao mesmo tempo). */
  async runIfDue(now = new Date()): Promise<RetentionResult | null> {
    const claimed = await this.db.execute<{ id: string }>(
      sql`insert into retention_runs (started_at) select ${now.toISOString()}::timestamptz where not exists (select 1 from retention_runs where started_at > ${new Date(now.getTime() - 23 * 3_600_000).toISOString()}::timestamptz) returning id`,
    );
    const id = claimed.rows[0]?.id;
    return id ? this.execute(id, now) : null;
  }

  /** Execução avulsa (teste e operação). */
  async run(now = new Date()): Promise<RetentionResult> {
    const [row] = await this.db.insert(retentionRuns).values({ startedAt: now }).returning({ id: retentionRuns.id });
    return this.execute(row!.id, now);
  }

  private async execute(id: string, now: Date): Promise<RetentionResult> {
    const [accessMonths, photoDays, rejectedDays] = await Promise.all([
      this.params.getNumber('retencao_log_acesso_meses'),
      this.params.getNumber('retencao_foto_troca_dias'),
      this.params.getNumber('retencao_loja_reprovada_dias'),
    ]);
    const ago = (days: number) => new Date(now.getTime() - days * DAY);
    const counts: Record<string, number> = {};
    const errs: string[] = [];
    const step = async (name: string, fn: () => Promise<number>): Promise<void> => {
      try {
        counts[name] = await fn();
      } catch (error) {
        errs.push(`${name}: ${safeErrorMessage(error).slice(0, 200)}`);
        this.logger.error(`retenção: passo ${name} falhou: ${safeErrorMessage(error)}`);
      }
    };

    await step('accessLog', () => this.purge('access_log', sql`created_at < ${new Date(now.getTime() - accessMonths * 30.4375 * DAY).toISOString()}::timestamptz`));
    await step('sessions', () => this.purge('sessions', sql`coalesce(revoked_at, absolute_expires_at) < ${ago(30).toISOString()}::timestamptz and (revoked_at is not null or absolute_expires_at < ${now.toISOString()}::timestamptz)`));
    await step('authCodes', () => this.purge('auth_codes', sql`created_at < ${ago(7).toISOString()}::timestamptz`));
    await step('authTickets', () => this.purge('auth_tickets', sql`expires_at < ${ago(7).toISOString()}::timestamptz`));
    await step('oauthStates', () => this.purge('payment_oauth_states', sql`expires_at < ${ago(1).toISOString()}::timestamptz`));
    await step('invitations', () => this.purge('invitations', sql`coalesce(used_at, revoked_at, expires_at) < ${ago(30).toISOString()}::timestamptz and (used_at is not null or revoked_at is not null or expires_at < ${now.toISOString()}::timestamptz)`));
    await step('webhookEvents', () => this.purge('webhook_events', sql`status in ('processed','discarded') and received_at < ${ago(90).toISOString()}::timestamptz`));
    await step('exportLinks', () => this.purge('data_export_links', sql`expires_at < ${ago(1).toISOString()}::timestamptz`));
    await step('exchangePhotos', () => this.exchangePhotos(ago(photoDays)));
    await step('rejectedStoreDocuments', () => this.rejectedStoreDocuments(ago(rejectedDays)));
    await step('orphanUploads', () => this.orphanUploads(now));

    await this.db.update(retentionRuns).set({ finishedAt: new Date(), counts, errors: errs }).where(eq(retentionRuns.id, id));
    if (errs.length > 0) {
      await this.db.insert(t.paymentAlerts).values({ kind: 'retention_failed', details: { runId: id, steps: errs.map((e) => e.split(':')[0]) } });
    }
    return { id, counts, errors: errs };
  }

  /** Apaga em lotes (não segura lock longo nem estoura o WAL). Tabelas daqui têm `id` (uuid ou bigserial). */
  private async purge(table: string, where: ReturnType<typeof sql>): Promise<number> {
    let total = 0;
    for (;;) {
      const res = await this.db.execute(sql`delete from ${sql.identifier(table)} where id in (select id from ${sql.identifier(table)} where ${where} limit ${BATCH})`);
      total += res.rowCount ?? 0;
      if ((res.rowCount ?? 0) < BATCH) return total;
    }
  }

  private async deleteAssets(assets: { id: string; objectKey: string; variants: Record<string, string> | null }[]): Promise<void> {
    for (const asset of assets) {
      await this.storage.deleteObject('private', asset.objectKey);
      for (const key of Object.values(asset.variants ?? {})) await this.storage.deleteObject('public', key);
    }
  }

  /** WB-215 C1: foto de troca some `retencao_foto_troca_dias` depois que a troca terminou. */
  private async exchangePhotos(cutoff: Date): Promise<number> {
    const rows = await this.db
      .select({ id: t.exchangeRequests.id, photoIds: t.exchangeRequests.photoIds })
      .from(t.exchangeRequests)
      .where(and(inArray(t.exchangeRequests.status, ['completed', 'rejected', 'cancelled', 'expired']), sql`jsonb_array_length(${t.exchangeRequests.photoIds}) > 0`, lt(t.exchangeRequests.updatedAt, cutoff)))
      .limit(200);
    let removed = 0;
    for (const row of rows) {
      const assets = await this.db.select({ id: t.mediaAssets.id, objectKey: t.mediaAssets.objectKey, variants: t.mediaAssets.variants }).from(t.mediaAssets).where(and(inArray(t.mediaAssets.id, row.photoIds), eq(t.mediaAssets.purpose, 'exchange_photo')));
      await this.deleteAssets(assets);
      await this.db.transaction(async (tx) => {
        await tx.update(t.exchangeRequests).set({ photoIds: [] }).where(eq(t.exchangeRequests.id, row.id));
        if (assets.length > 0) await tx.delete(t.mediaAssets).where(inArray(t.mediaAssets.id, assets.map((a) => a.id)));
      });
      removed += assets.length;
    }
    return removed;
  }

  /** HIP-035: documentos de loja reprovada somem `retencao_loja_reprovada_dias` depois da decisão. */
  private async rejectedStoreDocuments(cutoff: Date): Promise<number> {
    const stores = await this.db
      .select({ id: t.stores.id })
      .from(t.stores)
      .where(and(eq(t.stores.status, 'rejected'), lt(t.stores.decidedAt, cutoff), sql`exists (select 1 from store_documents d where d.store_id = ${t.stores.id})`))
      .limit(50);
    let removed = 0;
    for (const store of stores) {
      const docs = await this.db.select({ docId: t.storeDocuments.id, id: t.mediaAssets.id, objectKey: t.mediaAssets.objectKey, variants: t.mediaAssets.variants }).from(t.storeDocuments).innerJoin(t.mediaAssets, eq(t.mediaAssets.id, t.storeDocuments.assetId)).where(eq(t.storeDocuments.storeId, store.id));
      await this.deleteAssets(docs);
      await this.db.transaction(async (tx) => {
        await tx.delete(t.storeDocuments).where(eq(t.storeDocuments.storeId, store.id));
        if (docs.length > 0) await tx.delete(t.mediaAssets).where(inArray(t.mediaAssets.id, docs.map((d) => d.id)));
      });
      removed += docs.length;
    }
    return removed;
  }

  /** DT-032: upload que ficou `pending` (o cliente nunca completou) ou foi rejeitado não tem finalidade depois de 24 h / 7 dias. */
  private async orphanUploads(now: Date): Promise<number> {
    const rows = await this.db
      .select({ id: t.mediaAssets.id, objectKey: t.mediaAssets.objectKey, variants: t.mediaAssets.variants })
      .from(t.mediaAssets)
      .where(or(and(eq(t.mediaAssets.status, 'pending'), lt(t.mediaAssets.expiresAt, new Date(now.getTime() - DAY))), and(eq(t.mediaAssets.status, 'rejected'), lt(t.mediaAssets.createdAt, new Date(now.getTime() - 7 * DAY)))))
      .limit(200);
    let removed = 0;
    for (const row of rows) {
      try {
        await this.db.delete(t.mediaAssets).where(eq(t.mediaAssets.id, row.id)); // se algo ainda aponta para ele (FK), o objeto fica
        await this.deleteAssets([row]);
        removed += 1;
      } catch (error) {
        if ((error as { code?: string }).code !== '23503') throw error;
      }
    }
    return removed;
  }
}


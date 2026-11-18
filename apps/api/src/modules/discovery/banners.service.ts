import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull, lte, or } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { CacheService } from '../../platform/cache/cache.service.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from '../admin/index.js';
import { categories, cities } from '../admin/db/schema.js';
import { products } from '../catalog/db/schema.js';
import { MediaService, type MediaAsset } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { stores } from '../stores/db/schema.js';
import { banners, type BannerDestination } from './db/schema.js';

export type Banner = typeof banners.$inferSelect;

export interface BannerInput {
  title: string;
  imageAssetId: string;
  cityId?: string | null;
  destinationType: BannerDestination;
  destinationId?: string | null;
  destinationCode?: string | null;
  startsAt: Date;
  endsAt: Date;
  position?: number;
  active?: boolean;
}

const PUBLIC_TTL_SECONDS = 60;
const MAX_ACTIVE_PER_SCOPE = 10;

/** Banners da home (WB-011 leitura pública com cache curto; WB-115 gestão pelo admin com auditoria). */
@Injectable()
export class BannersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly cache: CacheService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  present(banner: Banner, asset: MediaAsset | null) {
    return {
      id: banner.id,
      title: banner.title,
      image: { urls: this.media.publicVariants(asset) ?? {} },
      destination: { type: banner.destinationType, id: banner.destinationId, code: banner.destinationCode },
      position: banner.position,
    };
  }

  /** Vigentes agora, da cidade pedida ou de todas. Sem dado pessoal: cache compartilhado de 60 s. */
  async listPublic(cityId: string | undefined) {
    return this.cache.wrap('banners', cityId ?? 'all', PUBLIC_TTL_SECONDS, async () => {
      const now = new Date();
      const rows = await this.db
        .select({ banner: banners, asset: mediaAssets })
        .from(banners)
        .innerJoin(mediaAssets, eq(mediaAssets.id, banners.imageAssetId))
        .where(and(eq(banners.active, true), lte(banners.startsAt, now), gt(banners.endsAt, now), cityId ? or(isNull(banners.cityId), eq(banners.cityId, cityId)) : isNull(banners.cityId)))
        .orderBy(asc(banners.position), asc(banners.createdAt))
        .limit(MAX_ACTIVE_PER_SCOPE);
      return rows.map((row) => this.present(row.banner, row.asset));
    });
  }

  async listAdmin() {
    const rows = await this.db
      .select({ banner: banners, asset: mediaAssets })
      .from(banners)
      .innerJoin(mediaAssets, eq(mediaAssets.id, banners.imageAssetId))
      .orderBy(asc(banners.position), asc(banners.createdAt));
    const now = Date.now();
    return rows.map(({ banner, asset }) => ({
      ...this.present(banner, asset),
      cityId: banner.cityId,
      startsAt: banner.startsAt.toISOString(),
      endsAt: banner.endsAt.toISOString(),
      active: banner.active,
      live: banner.active && banner.startsAt.getTime() <= now && banner.endsAt.getTime() > now,
    }));
  }

  private async validate(input: BannerInput): Promise<MediaAsset> {
    const asset = await this.media.requireReadyBanner(input.imageAssetId);
    if (input.endsAt <= input.startsAt) throw errors.validation([{ field: 'endsAt', message: 'O fim precisa ser depois do início.' }]);
    if (input.cityId) {
      const [city] = await this.db.select({ id: cities.id }).from(cities).where(eq(cities.id, input.cityId));
      if (!city) throw errors.validation([{ field: 'cityId', message: 'Cidade não encontrada.' }]);
    }
    const bad = (field: string, message: string) => errors.validation([{ field, message }]);
    switch (input.destinationType) {
      case 'none':
        break;
      case 'coupon':
        if (!input.destinationCode) throw bad('destinationCode', 'Informe o código do cupom.');
        break;
      default: {
        if (!input.destinationId) throw bad('destinationId', 'Informe o destino do banner.');
        const table = { store: stores, category: categories, product: products }[input.destinationType];
        const [found] = await this.db.select({ id: table.id }).from(table).where(eq(table.id, input.destinationId));
        if (!found) throw bad('destinationId', 'Destino não encontrado.');
      }
    }
    return asset;
  }

  private values(input: BannerInput) {
    return {
      title: input.title,
      imageAssetId: input.imageAssetId,
      cityId: input.cityId ?? null,
      destinationType: input.destinationType,
      destinationId: input.destinationType === 'none' || input.destinationType === 'coupon' ? null : (input.destinationId ?? null),
      destinationCode: input.destinationType === 'coupon' ? (input.destinationCode ?? null) : null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      position: input.position ?? 0,
      active: input.active ?? true,
    };
  }

  async create(input: BannerInput, ctx: RequestContext) {
    const asset = await this.validate(input);
    const banner = await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(banners).values({ ...this.values(input), createdBy: ctx.principal?.userId ?? null }).returning();
      if (!row) throw new Error('Banner não criado');
      await this.audit.record(tx, ctx, { action: 'banner.create', targetType: 'banner', targetId: row.id, after: { ...row } });
      return row;
    });
    await this.cache.bump('banners');
    return this.present(banner, asset);
  }

  async update(id: string, patch: Partial<BannerInput>, ctx: RequestContext) {
    const result = await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(banners).where(eq(banners.id, id)).for('update');
      if (!before) throw errors.notFound('Banner não encontrado.');
      const merged: BannerInput = {
        title: patch.title ?? before.title,
        imageAssetId: patch.imageAssetId ?? before.imageAssetId,
        cityId: patch.cityId === undefined ? before.cityId : patch.cityId,
        destinationType: patch.destinationType ?? before.destinationType,
        destinationId: patch.destinationId === undefined ? before.destinationId : patch.destinationId,
        destinationCode: patch.destinationCode === undefined ? before.destinationCode : patch.destinationCode,
        startsAt: patch.startsAt ?? before.startsAt,
        endsAt: patch.endsAt ?? before.endsAt,
        position: patch.position ?? before.position,
        active: patch.active ?? before.active,
      };
      const asset = await this.validate(merged);
      const [after] = await tx.update(banners).set({ ...this.values(merged), updatedAt: new Date() }).where(eq(banners.id, id)).returning();
      if (!after) throw new Error('Banner não atualizado');
      await this.audit.record(tx, ctx, { action: 'banner.update', targetType: 'banner', targetId: id, before: { ...before }, after: { ...after } });
      return this.present(after, asset);
    });
    await this.cache.bump('banners');
    return result;
  }

  async remove(id: string, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [gone] = await tx.delete(banners).where(eq(banners.id, id)).returning();
      if (!gone) throw errors.notFound('Banner não encontrado.');
      await this.audit.record(tx, ctx, { action: 'banner.delete', targetType: 'banner', targetId: id, before: { ...gone } });
    });
    await this.cache.bump('banners');
  }
}

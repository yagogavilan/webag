import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Principal } from '../../platform/auth/decorators.js';
import { adminHasPermission, memberHasStorePermission, type StorePermissionName } from '../../platform/auth/permissions.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../platform/storage/object-storage.js';
import { ParametersService } from '../admin/index.js';
import { PrincipalService } from '../identity/index.js';
import { ImageRejected, inspectImage, ratioWithin, renderVariant, VARIANT_WIDTHS } from './image.processor.js';
import { mediaAssets, type MediaPurpose } from './db/schema.js';
import { detectType, isImage, type DetectedType } from './sniff.js';

export type MediaAsset = typeof mediaAssets.$inferSelect;

const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_WINDOW_SECONDS = 900;

/** Quem pode enviar o quê: a permissão da loja que a finalidade exige (RN-13). */
const PURPOSE_PERMISSION: Record<Exclude<MediaPurpose, 'banner'>, StorePermissionName> = {
  store_logo: 'settings',
  store_cover: 'settings',
  store_document: 'settings',
  product_image: 'catalog',
};

const PUBLIC_PURPOSES: readonly MediaPurpose[] = ['store_logo', 'store_cover', 'product_image', 'banner'];

export class UploadRejectedError extends AppError {
  constructor(reason: string) {
    super(422, 'UPLOAD_REJECTED', 'Arquivo recusado', { detail: reason });
  }
}

/**
 * Upload em 2 passos (ADR-005, SEC-050): `create` devolve um POST pré-assinado com tamanho e tipo fixos e a chave
 * gerada pelo servidor; `complete` confere dono, tamanho e magic bytes, mede a imagem (<= 40 MP), recusa SVG/HTML/GIF
 * animado e gera as variantes WebP sem EXIF no bucket público. Documento fica só no privado.
 */
@Injectable()
export class MediaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(OBJECT_STORAGE) readonly storage: ObjectStorage,
    private readonly params: ParametersService,
    private readonly principals: PrincipalService,
  ) {}

  async maxBytes(): Promise<number> {
    return (await this.params.getNumber('upload_max_mb')) * 1024 * 1024;
  }

  async create(principal: Principal, input: { purpose: MediaPurpose; contentType: string; sizeBytes: number; storeId?: string | undefined }) {
    let owner: string | null = null;
    if (input.purpose === 'banner') {
      // Banner da home (WB-115): sem loja; só admin com a permissão e o segundo fator concluído.
      if (input.storeId !== undefined) throw errors.validation([{ field: 'storeId', message: 'Banner não pertence a uma loja.' }]);
      if (!principal.adminProfile || !principal.mfaVerified || !adminHasPermission(principal.adminProfile, 'banners:write')) throw errors.forbidden();
    } else {
      if (input.storeId === undefined) throw errors.validation([{ field: 'storeId', message: 'Informe a loja.' }]);
      owner = input.storeId;
      const member = await this.principals.storeMembership(principal.userId, owner);
      // 404 também para quem não é membro (SEC-020): não revela que a loja existe.
      if (!member) throw errors.notFound();
      if (!memberHasStorePermission(member, PURPOSE_PERMISSION[input.purpose])) throw errors.forbidden();
    }

    const allowed = input.purpose === 'store_document' ? [...IMAGE_TYPES, 'application/pdf'] : IMAGE_TYPES;
    if (!allowed.includes(input.contentType)) throw new UploadRejectedError('Formato não aceito. Envie JPG, PNG ou WebP' + (input.purpose === 'store_document' ? ' ou PDF.' : '.'));
    const max = await this.maxBytes();
    if (input.sizeBytes < 1 || input.sizeBytes > max) throw new UploadRejectedError(`O arquivo passa do limite de ${max / 1024 / 1024} MB.`);

    const id = randomUUID();
    const objectKey = `uploads/${owner ?? 'banners'}/${id}`;
    const post = await this.storage.presignedPost('private', objectKey, { contentType: input.contentType, maxBytes: max, expiresSeconds: UPLOAD_WINDOW_SECONDS });
    await this.db.insert(mediaAssets).values({
      id,
      ownerUserId: principal.userId,
      storeId: owner,
      purpose: input.purpose,
      objectKey,
      declaredContentType: input.contentType,
      declaredSizeBytes: input.sizeBytes,
      expiresAt: post.expiresAt,
    });
    return { id, upload: { url: post.url, fields: post.fields, expiresAt: post.expiresAt } };
  }

  /** Dono do upload, e só ele; qualquer outro recebe 404 (SEC-050, O2-DOC-05). */
  private async ownedAsset(principal: Principal, id: string): Promise<MediaAsset> {
    const [asset] = await this.db.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.ownerUserId, principal.userId)));
    if (!asset) throw errors.notFound();
    return asset;
  }

  async get(principal: Principal, id: string): Promise<MediaAsset> {
    return this.ownedAsset(principal, id);
  }

  async complete(principal: Principal, id: string): Promise<MediaAsset> {
    const asset = await this.ownedAsset(principal, id);
    if (asset.status !== 'pending') return asset; // idempotente: repetir devolve o resultado já registrado
    if (asset.expiresAt.getTime() < Date.now()) return this.reject(asset, 'O envio demorou demais. Envie de novo.');

    const max = await this.maxBytes();
    const body = await this.storage.getObject('private', asset.objectKey, { maxBytes: max });
    if (!body) throw errors.conflict('UPLOAD_NOT_RECEIVED', 'Arquivo ainda não recebido', 'Envie o arquivo antes de concluir.');
    if (body.length > max) return this.reject(asset, `O arquivo passa do limite de ${max / 1024 / 1024} MB.`);

    const detected = detectType(body);
    if (!detected) return this.reject(asset, 'Formato não reconhecido. Envie JPG, PNG, WebP ou PDF.');
    if (detected !== asset.declaredContentType) return this.reject(asset, 'O conteúdo do arquivo não corresponde ao tipo informado.');
    if (detected === 'application/pdf' && asset.purpose !== 'store_document') return this.reject(asset, 'PDF só vale para documentos.');

    if (!isImage(detected)) return this.ready(asset, detected, body.length, null, null);

    try {
      const info = await inspectImage(body);
      if (asset.purpose === 'store_logo' && !ratioWithin(info, 1, 0.02)) throw new ImageRejected('A logo precisa ser quadrada (1:1).');
      if (asset.purpose === 'store_cover' && !ratioWithin(info, 16 / 9, 0.03)) throw new ImageRejected('A capa precisa ter proporção 16:9.');
      if (asset.purpose === 'banner' && !ratioWithin(info, 2, 0.03)) throw new ImageRejected('O banner precisa ter proporção 2:1.');
      let variants: Record<string, string> | null = null;
      if (PUBLIC_PURPOSES.includes(asset.purpose)) {
        variants = {};
        for (const width of VARIANT_WIDTHS) {
          if (width > Math.max(info.width, VARIANT_WIDTHS[0])) continue;
          const key = `media/${asset.id}/${width}.webp`;
          await this.storage.putObject('public', key, await renderVariant(body, width), 'image/webp');
          variants[String(width)] = key;
        }
        if (Object.keys(variants).length === 0) {
          const key = `media/${asset.id}/${VARIANT_WIDTHS[0]}.webp`;
          await this.storage.putObject('public', key, await renderVariant(body, VARIANT_WIDTHS[0]), 'image/webp');
          variants[String(VARIANT_WIDTHS[0])] = key;
        }
      }
      return this.ready(asset, detected, body.length, info, variants);
    } catch (error) {
      if (error instanceof ImageRejected) return this.reject(asset, error.message);
      throw error;
    }
  }

  private async ready(asset: MediaAsset, contentType: DetectedType, sizeBytes: number, info: { width: number; height: number } | null, variants: Record<string, string> | null): Promise<MediaAsset> {
    const [row] = await this.db
      .update(mediaAssets)
      .set({ status: 'ready', contentType, sizeBytes, width: info?.width ?? null, height: info?.height ?? null, variants, completedAt: new Date() })
      .where(and(eq(mediaAssets.id, asset.id), eq(mediaAssets.status, 'pending')))
      .returning();
    return row ?? asset;
  }

  /** Recusa: apaga o objeto (não fica lixo nem arquivo suspeito no storage) e responde 422 com o motivo. */
  private async reject(asset: MediaAsset, reason: string): Promise<never> {
    await this.db.update(mediaAssets).set({ status: 'rejected', rejectionReason: reason, completedAt: new Date() }).where(eq(mediaAssets.id, asset.id));
    await this.storage.deleteObject('private', asset.objectKey).catch(() => undefined);
    throw new UploadRejectedError(reason);
  }

  /** Asset pronto da loja, do tipo certo (usado por loja e catálogo ao anexar). 422 se não servir. */
  async requireReady(assetId: string, expected: { storeId: string; purposes: MediaPurpose[] }): Promise<MediaAsset> {
    const [asset] = await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    if (!asset || asset.storeId !== expected.storeId) throw errors.notFound('Arquivo não encontrado.');
    if (asset.status !== 'ready' || !expected.purposes.includes(asset.purpose)) {
      throw errors.unprocessable('MEDIA_NOT_USABLE', 'Arquivo não pode ser usado aqui', { detail: 'Conclua o envio do arquivo certo antes.' });
    }
    return asset;
  }

  /** Banner pronto (WB-115): imagem 2:1 enviada por admin, sem loja. */
  async requireReadyBanner(assetId: string): Promise<MediaAsset> {
    const [asset] = await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
    if (!asset || asset.purpose !== 'banner') throw errors.notFound('Arquivo não encontrado.');
    if (asset.status !== 'ready') throw errors.unprocessable('MEDIA_NOT_USABLE', 'Arquivo não pode ser usado aqui', { detail: 'Conclua o envio da imagem antes.' });
    return asset;
  }

  /** URLs públicas das variantes (nunca a chave do original). */
  publicVariants(asset: Pick<MediaAsset, 'variants'> | null): Record<string, string> | null {
    if (!asset?.variants) return null;
    return Object.fromEntries(Object.entries(asset.variants).map(([w, key]) => [w, this.storage.publicUrl(key)]));
  }
}

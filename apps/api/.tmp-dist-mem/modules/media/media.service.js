var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { adminHasPermission, memberHasStorePermission } from '../../platform/auth/permissions.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { OBJECT_STORAGE, PRIVATE_URL_TTL_SECONDS } from '../../platform/storage/object-storage.js';
import { ParametersService } from '../admin/index.js';
import { PrincipalService } from '../identity/index.js';
import { ImageRejected, inspectImage, ratioWithin, renderVariant, renderVariants, VARIANT_WIDTHS } from './image.processor.js';
import { mediaAssets } from './db/schema.js';
import { detectType, isImage } from './sniff.js';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_WINDOW_SECONDS = 900;
/** PRD de trocas: foto de até 5 MB. */
const EXCHANGE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Quem pode enviar o quê: a permissão da loja que a finalidade exige (RN-13). */
const PURPOSE_PERMISSION = {
    store_logo: 'settings',
    store_cover: 'settings',
    store_document: 'settings',
    product_image: 'catalog',
};
const PUBLIC_PURPOSES = ['store_logo', 'store_cover', 'product_image', 'banner'];
export class UploadRejectedError extends AppError {
    constructor(reason) {
        super(422, 'UPLOAD_REJECTED', 'Arquivo recusado', { detail: reason });
    }
}
/**
 * Upload em 2 passos (ADR-005, SEC-050): `create` devolve um POST pré-assinado com tamanho e tipo fixos e a chave
 * gerada pelo servidor; `complete` confere dono, tamanho e magic bytes, mede a imagem (<= 40 MP), recusa SVG/HTML/GIF
 * animado e gera as variantes WebP sem EXIF no bucket público. Documento fica só no privado.
 */
let MediaService = class MediaService {
    db;
    storage;
    params;
    principals;
    constructor(db, storage, params, principals) {
        this.db = db;
        this.storage = storage;
        this.params = params;
        this.principals = principals;
    }
    async maxBytes() {
        return (await this.params.getNumber('upload_max_mb')) * 1024 * 1024;
    }
    async create(principal, input) {
        let owner = null;
        if (input.purpose === 'exchange_photo') {
            // Foto de troca (WB-170): do CLIENTE, sem loja, privada. Quem lê é o dono, a loja do pedido e o admin (URL assinada curta).
            if (input.storeId !== undefined)
                throw errors.validation([{ field: 'storeId', message: 'Foto de troca não pertence a uma loja.' }]);
        }
        else if (input.purpose === 'banner') {
            // Banner da home (WB-115): sem loja; só admin com a permissão e o segundo fator concluído.
            if (input.storeId !== undefined)
                throw errors.validation([{ field: 'storeId', message: 'Banner não pertence a uma loja.' }]);
            if (!principal.adminProfile || !principal.mfaVerified || !adminHasPermission(principal.adminProfile, 'banners:write'))
                throw errors.forbidden();
        }
        else {
            if (input.storeId === undefined)
                throw errors.validation([{ field: 'storeId', message: 'Informe a loja.' }]);
            owner = input.storeId;
            const member = await this.principals.storeMembership(principal.userId, owner);
            // 404 também para quem não é membro (SEC-020): não revela que a loja existe.
            if (!member)
                throw errors.notFound();
            if (!memberHasStorePermission(member, PURPOSE_PERMISSION[input.purpose]))
                throw errors.forbidden();
        }
        const allowed = input.purpose === 'store_document' ? [...IMAGE_TYPES, 'application/pdf'] : IMAGE_TYPES;
        if (!allowed.includes(input.contentType))
            throw new UploadRejectedError('Formato não aceito. Envie JPG, PNG ou WebP' + (input.purpose === 'store_document' ? ' ou PDF.' : '.'));
        const max = input.purpose === 'exchange_photo' ? Math.min(await this.maxBytes(), EXCHANGE_PHOTO_MAX_BYTES) : await this.maxBytes();
        if (input.sizeBytes < 1 || input.sizeBytes > max)
            throw new UploadRejectedError(`O arquivo passa do limite de ${max / 1024 / 1024} MB.`);
        const id = randomUUID();
        const objectKey = `uploads/${owner ?? (input.purpose === 'exchange_photo' ? 'exchange' : 'banners')}/${id}`;
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
    async ownedAsset(principal, id) {
        const [asset] = await this.db.select().from(mediaAssets).where(and(eq(mediaAssets.id, id), eq(mediaAssets.ownerUserId, principal.userId)));
        if (!asset)
            throw errors.notFound();
        return asset;
    }
    async get(principal, id) {
        return this.ownedAsset(principal, id);
    }
    async complete(principal, id) {
        const asset = await this.ownedAsset(principal, id);
        if (asset.status !== 'pending')
            return asset; // idempotente: repetir devolve o resultado já registrado
        if (asset.expiresAt.getTime() < Date.now())
            return this.reject(asset, 'O envio demorou demais. Envie de novo.');
        const max = asset.purpose === 'exchange_photo' ? Math.min(await this.maxBytes(), EXCHANGE_PHOTO_MAX_BYTES) : await this.maxBytes();
        const body = await this.storage.getObject('private', asset.objectKey, { maxBytes: max });
        if (!body)
            throw errors.conflict('UPLOAD_NOT_RECEIVED', 'Arquivo ainda não recebido', 'Envie o arquivo antes de concluir.');
        if (body.length > max)
            return this.reject(asset, `O arquivo passa do limite de ${max / 1024 / 1024} MB.`);
        const detected = detectType(body);
        if (!detected)
            return this.reject(asset, 'Formato não reconhecido. Envie JPG, PNG, WebP ou PDF.');
        if (detected !== asset.declaredContentType)
            return this.reject(asset, 'O conteúdo do arquivo não corresponde ao tipo informado.');
        if (detected === 'application/pdf' && asset.purpose !== 'store_document')
            return this.reject(asset, 'PDF só vale para documentos.');
        if (!isImage(detected))
            return this.ready(asset, detected, body.length, null, null);
        try {
            const info = await inspectImage(body);
            if (asset.purpose === 'store_logo' && !ratioWithin(info, 1, 0.02))
                throw new ImageRejected('A logo precisa ser quadrada (1:1).');
            if (asset.purpose === 'store_cover' && !ratioWithin(info, 16 / 9, 0.03))
                throw new ImageRejected('A capa precisa ter proporção 16:9.');
            if (asset.purpose === 'banner' && !ratioWithin(info, 2, 0.03))
                throw new ImageRejected('O banner precisa ter proporção 2:1.');
            if (asset.purpose === 'exchange_photo') {
                // LGPD: foto de troca fica PRIVADA e sai re-codificada (WebP, sem EXIF/GPS); o original é substituído.
                const clean = await renderVariant(body, 1600);
                await this.storage.putObject('private', asset.objectKey, clean, 'image/webp');
                return this.ready(asset, 'image/webp', clean.length, info, null);
            }
            let variants = null;
            if (PUBLIC_PURPOSES.includes(asset.purpose)) {
                variants = {};
                const widths = VARIANT_WIDTHS.filter((width) => width <= Math.max(info.width, VARIANT_WIDTHS[0]));
                for (const [width, rendered] of await renderVariants(body, widths.length > 0 ? widths : [VARIANT_WIDTHS[0]])) {
                    const key = `media/${asset.id}/${width}.webp`;
                    await this.storage.putObject('public', key, rendered, 'image/webp');
                    variants[String(width)] = key;
                }
            }
            return this.ready(asset, detected, body.length, info, variants);
        }
        catch (error) {
            if (error instanceof ImageRejected)
                return this.reject(asset, error.message);
            throw error;
        }
    }
    async ready(asset, contentType, sizeBytes, info, variants) {
        const [row] = await this.db
            .update(mediaAssets)
            .set({ status: 'ready', contentType, sizeBytes, width: info?.width ?? null, height: info?.height ?? null, variants, completedAt: new Date() })
            .where(and(eq(mediaAssets.id, asset.id), eq(mediaAssets.status, 'pending')))
            .returning();
        return row ?? asset;
    }
    /** Recusa: apaga o objeto (não fica lixo nem arquivo suspeito no storage) e responde 422 com o motivo. */
    async reject(asset, reason) {
        await this.db.update(mediaAssets).set({ status: 'rejected', rejectionReason: reason, completedAt: new Date() }).where(eq(mediaAssets.id, asset.id));
        await this.storage.deleteObject('private', asset.objectKey).catch(() => undefined);
        throw new UploadRejectedError(reason);
    }
    /** Asset pronto da loja, do tipo certo (usado por loja e catálogo ao anexar). 422 se não servir. */
    async requireReady(assetId, expected) {
        const [asset] = await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
        if (!asset || asset.storeId !== expected.storeId)
            throw errors.notFound('Arquivo não encontrado.');
        if (asset.status !== 'ready' || !expected.purposes.includes(asset.purpose)) {
            throw errors.unprocessable('MEDIA_NOT_USABLE', 'Arquivo não pode ser usado aqui', { detail: 'Conclua o envio do arquivo certo antes.' });
        }
        return asset;
    }
    /** Fotos da troca (1 a 5): do próprio cliente, prontas e da finalidade certa. 404 para foto alheia (não revela existência). */
    async requireExchangePhotos(userId, ids) {
        if (ids.length === 0)
            return [];
        const rows = await this.db.select().from(mediaAssets).where(and(inArray(mediaAssets.id, [...ids]), eq(mediaAssets.ownerUserId, userId), eq(mediaAssets.purpose, 'exchange_photo')));
        if (rows.length !== new Set(ids).size)
            throw errors.notFound('Foto não encontrada.');
        if (rows.some((a) => a.status !== 'ready'))
            throw errors.unprocessable('MEDIA_NOT_USABLE', 'Arquivo não pode ser usado aqui', { detail: 'Conclua o envio da foto antes.' });
        return rows;
    }
    /** URL assinada e curta (SEC-051) de uma foto privada de troca. */
    async privatePhotoUrl(assetId) {
        const [asset] = await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
        if (!asset || asset.status !== 'ready' || !asset.contentType)
            return null;
        return this.storage.presignedGetUrl('private', asset.objectKey, { expiresSeconds: PRIVATE_URL_TTL_SECONDS, contentType: asset.contentType });
    }
    /** Banner pronto (WB-115): imagem 2:1 enviada por admin, sem loja. */
    async requireReadyBanner(assetId) {
        const [asset] = await this.db.select().from(mediaAssets).where(eq(mediaAssets.id, assetId));
        if (!asset || asset.purpose !== 'banner')
            throw errors.notFound('Arquivo não encontrado.');
        if (asset.status !== 'ready')
            throw errors.unprocessable('MEDIA_NOT_USABLE', 'Arquivo não pode ser usado aqui', { detail: 'Conclua o envio da imagem antes.' });
        return asset;
    }
    /** URLs públicas das variantes (nunca a chave do original). */
    publicVariants(asset) {
        if (!asset?.variants)
            return null;
        return Object.fromEntries(Object.entries(asset.variants).map(([w, key]) => [w, this.storage.publicUrl(key)]));
    }
};
MediaService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __param(1, Inject(OBJECT_STORAGE)),
    __metadata("design:paramtypes", [Object, Object, ParametersService,
        PrincipalService])
], MediaService);
export { MediaService };
//# sourceMappingURL=media.service.js.map
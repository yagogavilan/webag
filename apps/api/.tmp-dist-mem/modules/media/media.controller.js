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
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { MEDIA_PURPOSES } from './db/schema.js';
import { MediaService } from './media.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const createSchema = z.strictObject({
    /** Obrigatório, exceto para `banner` (admin, sem loja). */
    storeId: z.uuid().optional(),
    purpose: z.enum(MEDIA_PURPOSES),
    contentType: z.string().max(100),
    sizeBytes: z.number().int().min(1).max(50 * 1024 * 1024),
});
export const presentMedia = (media, asset) => ({
    id: asset.id,
    purpose: asset.purpose,
    status: asset.status,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    urls: media.publicVariants(asset),
    rejectionReason: asset.rejectionReason,
    createdAt: asset.createdAt.toISOString(),
});
let MediaController = class MediaController {
    media;
    constructor(media) {
        this.media = media;
    }
    async create(principal, body) {
        const created = await this.media.create(principal, body);
        return { id: created.id, upload: { url: created.upload.url, fields: created.upload.fields, expiresAt: created.upload.expiresAt.toISOString() } };
    }
    async complete(principal, id) {
        if (!UUID.test(id))
            throw errors.notFound();
        return presentMedia(this.media, await this.media.complete(principal, id));
    }
    async get(principal, id) {
        if (!UUID.test(id))
            throw errors.notFound();
        return presentMedia(this.media, await this.media.get(principal, id));
    }
};
__decorate([
    RateLimit({ name: 'upload-create', limit: 60, windowSeconds: 3600 }),
    Post(),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(createSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "create", null);
__decorate([
    HttpCode(200),
    RateLimit({ name: 'upload-complete', limit: 120, windowSeconds: 3600 }),
    Post(':id/complete'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "complete", null);
__decorate([
    Get(':id'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], MediaController.prototype, "get", null);
MediaController = __decorate([
    Controller('v1/uploads'),
    __metadata("design:paramtypes", [MediaService])
], MediaController);
export { MediaController };
//# sourceMappingURL=media.controller.js.map
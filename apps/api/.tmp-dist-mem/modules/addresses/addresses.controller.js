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
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { uuidParam } from '../stores/index.js';
import { createAddressSchema, updateAddressSchema } from './addresses.schemas.js';
import { AddressesService, presentAddress } from './addresses.service.js';
/** `/v1/me/addresses` (WB-003, DEC-028): autenticado; o dono é sempre o `userId` do token (BOLA, SEC-020). */
let AddressesController = class AddressesController {
    addresses;
    constructor(addresses) {
        this.addresses = addresses;
    }
    async list(principal) {
        const rows = await this.addresses.list(principal.userId);
        return { data: rows.map(presentAddress), nextCursor: null };
    }
    /** 201 ao criar; 200 com o existente se o mesmo endereço já estava salvo (reenvio em rede ruim não duplica). */
    async create(principal, body, res) {
        const { address, created } = await this.addresses.create(principal.userId, body);
        res.status(created ? 201 : 200);
        return presentAddress(address);
    }
    async get(principal, id) {
        return presentAddress(await this.addresses.get(principal.userId, uuidParam(id)));
    }
    async update(principal, id, body) {
        return presentAddress(await this.addresses.update(principal.userId, uuidParam(id), body));
    }
    async remove(principal, id) {
        await this.addresses.remove(principal.userId, uuidParam(id));
    }
};
__decorate([
    Get(),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AddressesController.prototype, "list", null);
__decorate([
    RateLimit({ name: 'address-write', limit: 60, windowSeconds: 3600 }),
    Post(),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(createAddressSchema))),
    __param(2, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AddressesController.prototype, "create", null);
__decorate([
    Get(':id'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AddressesController.prototype, "get", null);
__decorate([
    RateLimit({ name: 'address-write', limit: 60, windowSeconds: 3600 }),
    Patch(':id'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(updateAddressSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], AddressesController.prototype, "update", null);
__decorate([
    HttpCode(204),
    Delete(':id'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AddressesController.prototype, "remove", null);
AddressesController = __decorate([
    Controller('v1/me/addresses'),
    __metadata("design:paramtypes", [AddressesService])
], AddressesController);
export { AddressesController };
//# sourceMappingURL=addresses.controller.js.map
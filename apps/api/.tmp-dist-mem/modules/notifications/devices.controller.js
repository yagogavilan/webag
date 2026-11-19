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
import { Body, Controller, HttpCode, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { NotificationsService } from './notifications.service.js';
/** Token do Expo: `ExponentPushToken[...]` ou `ExpoPushToken[...]`. */
const token = z.string().trim().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,80}\]$/);
const registerSchema = z.strictObject({ token, platform: z.enum(['android', 'ios']) });
const revokeSchema = z.strictObject({ token });
/** Registro do aparelho para push (RF-NOT-01). Sempre da conta logada; o token é revogável por quem o registrou. */
let PushDevicesController = class PushDevicesController {
    notifications;
    constructor(notifications) {
        this.notifications = notifications;
    }
    async register(p, body) {
        await this.notifications.registerDevice(p.userId, body);
    }
    async revoke(p, body) {
        await this.notifications.revokeDevice(p.userId, body.token);
    }
};
__decorate([
    HttpCode(204),
    RateLimit({ name: 'push-device', limit: 60, windowSeconds: 3600 }),
    Put(),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(registerSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PushDevicesController.prototype, "register", null);
__decorate([
    HttpCode(204),
    RateLimit({ name: 'push-device', limit: 60, windowSeconds: 3600 }),
    Post('revoke'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(revokeSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PushDevicesController.prototype, "revoke", null);
PushDevicesController = __decorate([
    Controller('v1/me/push-devices'),
    __metadata("design:paramtypes", [NotificationsService])
], PushDevicesController);
export { PushDevicesController };
//# sourceMappingURL=devices.controller.js.map
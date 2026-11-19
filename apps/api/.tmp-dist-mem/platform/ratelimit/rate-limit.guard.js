var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
import { RateLimitService } from './rate-limit.service.js';
export const RATE_LIMIT = 'webag:rate-limit';
/** Limite por IP em endpoint sensível ou público (login, códigos, cadastro, `exists`). Empilha com o padrão global. */
export const RateLimit = (...rules) => SetMetadata(RATE_LIMIT, rules);
/** Teto global por IP: segura abuso grosseiro sem atrapalhar CGNAT (SEC-066). Falha aberta se o Redis cair. */
/** Mensagens por minuto por socket (reposição contínua). */
export const WS_MESSAGES_PER_MINUTE = 30;
/** Balde de fichas por socket, em memória (o socket vive em um processo só). Esgotado: `WsException` com código estável. */
export function consumeSocketToken(client, now = Date.now()) {
    const data = (client.data ??= {});
    const bucket = data.wsBucket ?? { tokens: WS_MESSAGES_PER_MINUTE, at: now };
    bucket.tokens = Math.min(WS_MESSAGES_PER_MINUTE, bucket.tokens + ((now - bucket.at) / 60_000) * WS_MESSAGES_PER_MINUTE);
    bucket.at = now;
    data.wsBucket = bucket;
    if (bucket.tokens < 1)
        throw new WsException({ code: 'RATE_LIMITED', message: 'Muitas mensagens. Aguarde um instante.' });
    bucket.tokens -= 1;
    return true;
}
export const GLOBAL_LIMIT = { name: 'global', limit: 600, windowSeconds: 60 };
let RateLimitGuard = class RateLimitGuard {
    reflector;
    limiter;
    constructor(reflector, limiter) {
        this.reflector = reflector;
        this.limiter = limiter;
    }
    async canActivate(context) {
        // Mensagens do Socket.IO (I10): balde de fichas POR SOCKET (cada mensagem faz consultas ao banco). Vale para todo `@SubscribeMessage`.
        if (context.getType() === 'ws')
            return consumeSocketToken(context.switchToWs().getClient());
        if (context.getType() !== 'http')
            return true;
        const req = context.switchToHttp().getRequest();
        if (req.path.startsWith('/health'))
            return true;
        const ip = req.ip ?? 'unknown';
        await this.limiter.enforce(`rl:${GLOBAL_LIMIT.name}:${ip}`, GLOBAL_LIMIT.limit, GLOBAL_LIMIT.windowSeconds, false);
        const rules = this.reflector.getAllAndOverride(RATE_LIMIT, [
            context.getHandler(),
            context.getClass(),
        ]);
        for (const rule of rules ?? []) {
            await this.limiter.enforce(`rl:${rule.name}:${ip}`, rule.limit, rule.windowSeconds);
        }
        return true;
    }
};
RateLimitGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Reflector,
        RateLimitService])
], RateLimitGuard);
export { RateLimitGuard };
//# sourceMappingURL=rate-limit.guard.js.map
import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RateLimitService } from './rate-limit.service.js';

export const RATE_LIMIT = 'webag:rate-limit';

export interface RateLimitRule {
  /** Nome do limite (parte da chave). */
  name: string;
  limit: number;
  windowSeconds: number;
}

/** Limite por IP em endpoint sensível ou público (login, códigos, cadastro, `exists`). Empilha com o padrão global. */
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT, rules);

/** Teto global por IP: segura abuso grosseiro sem atrapalhar CGNAT (SEC-066). Falha aberta se o Redis cair. */
export const GLOBAL_LIMIT: RateLimitRule = { name: 'global', limit: 600, windowSeconds: 60 };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.path.startsWith('/health')) return true;
    const ip = req.ip ?? 'unknown';

    await this.limiter.enforce(`rl:${GLOBAL_LIMIT.name}:${ip}`, GLOBAL_LIMIT.limit, GLOBAL_LIMIT.windowSeconds, false);
    const rules = this.reflector.getAllAndOverride<RateLimitRule[] | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    for (const rule of rules ?? []) {
      await this.limiter.enforce(`rl:${rule.name}:${ip}`, rule.limit, rule.windowSeconds);
    }
    return true;
  }
}

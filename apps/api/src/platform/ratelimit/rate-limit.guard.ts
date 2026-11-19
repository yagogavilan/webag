import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WsException } from '@nestjs/websockets';
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
/** Mensagens por minuto por socket (reposição contínua). */
export const WS_MESSAGES_PER_MINUTE = 30;

/** Balde de fichas por socket, em memória (o socket vive em um processo só). Esgotado: `WsException` com código estável. */
export function consumeSocketToken(client: { data?: Record<string, unknown> }, now = Date.now()): boolean {
  const data = (client.data ??= {});
  const bucket = (data.wsBucket as { tokens: number; at: number } | undefined) ?? { tokens: WS_MESSAGES_PER_MINUTE, at: now };
  bucket.tokens = Math.min(WS_MESSAGES_PER_MINUTE, bucket.tokens + ((now - bucket.at) / 60_000) * WS_MESSAGES_PER_MINUTE);
  bucket.at = now;
  data.wsBucket = bucket;
  if (bucket.tokens < 1) throw new WsException({ code: 'RATE_LIMITED', message: 'Muitas mensagens. Aguarde um instante.' });
  bucket.tokens -= 1;
  return true;
}

export const GLOBAL_LIMIT: RateLimitRule = { name: 'global', limit: 600, windowSeconds: 60 };

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Mensagens do Socket.IO (I10): balde de fichas POR SOCKET (cada mensagem faz consultas ao banco). Vale para todo `@SubscribeMessage`.
    if (context.getType() === 'ws') return consumeSocketToken(context.switchToWs().getClient<{ data?: Record<string, unknown> }>());
    if (context.getType() !== 'http') return true;
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

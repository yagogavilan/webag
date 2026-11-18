import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { AppError, errors } from '../http/app-error.js';

export interface HitResult {
  count: number;
  /** Segundos até a janela zerar. */
  ttlSeconds: number;
}

/**
 * Contadores em Redis com janela fixa (DT-003: storage próprio, sem depender de pacote com peer até Nest 11).
 * `failClosed`: com o Redis fora, bloqueia (503) em vez de liberar. Usado em login, códigos e cadastro.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Conecta sob demanda (o cliente é `lazyConnect`). */
  private async ready(): Promise<void> {
    if (this.redis.status === 'wait') await this.redis.connect();
  }

  /** Conta um evento na chave e devolve o total da janela. */
  async hit(key: string, windowSeconds: number, failClosed = true): Promise<HitResult> {
    try {
      await this.ready();
      const results = await this.redis
        .multi()
        .set(key, 0, 'EX', windowSeconds, 'NX')
        .incr(key)
        .pttl(key)
        .exec();
      const count = Number(results?.[1]?.[1] ?? 0);
      const pttl = Number(results?.[2]?.[1] ?? windowSeconds * 1000);
      return { count, ttlSeconds: Math.max(1, Math.ceil(pttl / 1000)) };
    } catch (error) {
      return this.unavailable(error, failClosed);
    }
  }

  /** Lê o contador sem incrementar. */
  async peek(key: string, failClosed = true): Promise<HitResult> {
    try {
      await this.ready();
      const [raw, pttl] = await Promise.all([this.redis.get(key), this.redis.pttl(key)]);
      return { count: Number(raw ?? 0), ttlSeconds: pttl > 0 ? Math.ceil(pttl / 1000) : 0 };
    } catch (error) {
      return this.unavailable(error, failClosed);
    }
  }

  /**
   * Desfaz uma contagem (usado quando o evento contado era legítimo, p.ex. 2º fator certo). Nunca passa de zero (a chave some ao zerar).
   * Padrão "conta antes, confere depois" (SEC-117): só assim requisições paralelas não furam o teto.
   */
  async release(key: string): Promise<void> {
    try {
      await this.ready();
      await this.redis.eval("local v = redis.call('GET', KEYS[1]) if v and tonumber(v) > 1 then return redis.call('DECR', KEYS[1]) end if v then redis.call('DEL', KEYS[1]) end return 0", 1, key);
    } catch (error) {
      this.logger.warn(`Redis indisponível ao devolver contagem: ${(error as Error).message}`);
    }
  }

  /** Encurta/estende a janela de uma chave existente (usado quando o limite é atingido). */
  async setWindow(key: string, windowSeconds: number): Promise<void> {
    try {
      await this.redis.expire(key, windowSeconds);
    } catch (error) {
      this.logger.warn(`Redis indisponível ao ajustar janela: ${(error as Error).message}`);
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn(`Redis indisponível ao limpar contador: ${(error as Error).message}`);
    }
  }

  /** Conta e lança 429 se passar do limite. */
  async enforce(key: string, limit: number, windowSeconds: number, failClosed = true): Promise<void> {
    const { count, ttlSeconds } = await this.hit(key, windowSeconds, failClosed);
    if (count > limit) throw errors.tooMany(ttlSeconds);
  }

  private unavailable(error: unknown, failClosed: boolean): HitResult {
    this.logger.warn(`Redis indisponível no rate limit: ${(error as Error).message}`);
    if (failClosed) {
      throw new AppError(503, 'RATE_LIMIT_UNAVAILABLE', 'Serviço temporariamente indisponível', {
        detail: 'Tente novamente em instantes.',
        retryAfterSeconds: 5,
      });
    }
    return { count: 0, ttlSeconds: 0 };
  }
}

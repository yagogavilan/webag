import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';

const logger = new Logger('Cache');

/**
 * Cache de leitura em Redis (padroes-backend: TTL explícito, nunca dado pessoal). Falha aberta: se o Redis cair,
 * a leitura vai direto ao banco e o erro vira aviso no log. Só guarda JSON; as chaves levam o prefixo `cache:`.
 * Invalidação por versão de namespace: `bump('regions')` torna todas as chaves antigas do namespace inalcançáveis.
 */
@Injectable()
export class CacheService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private async version(namespace: string): Promise<string> {
    try {
      return (await this.redis.get(`cache:v:${namespace}`)) ?? '0';
    } catch {
      return '0';
    }
  }

  /** Devolve o valor em cache ou calcula, grava com TTL (segundos) e devolve. */
  async wrap<T>(namespace: string, key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const full = `cache:${namespace}:${await this.version(namespace)}:${key}`;
    try {
      const hit = await this.redis.get(full);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (error) {
      logger.warn(`Cache indisponível (leitura): ${(error as Error).message}`);
    }
    const value = await compute();
    try {
      await this.redis.set(full, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      logger.warn(`Cache indisponível (gravação): ${(error as Error).message}`);
    }
    return value;
  }

  /** Invalida o namespace inteiro (as chaves antigas expiram sozinhas pelo TTL). */
  async bump(namespace: string): Promise<void> {
    try {
      await this.redis.incr(`cache:v:${namespace}`);
    } catch (error) {
      logger.warn(`Cache indisponível (invalidação): ${(error as Error).message}`);
    }
  }
}

@Global()
@Module({ providers: [CacheService], exports: [CacheService] })
export class CacheModule {}

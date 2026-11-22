import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { CacheService } from './cache.service.js';

const logger = new Logger('StorefrontCache');

/** Canal do pub/sub do Redis que leva a invalidação às demais réplicas da API (DEC-113, ADR-017). O pub/sub do Redis vale para o SERVIDOR inteiro, não por banco lógico: o número do banco entra no nome para staging, dev e testes no mesmo servidor não se invalidarem. */
export const storefrontChannel = (redis: Redis): string => `webag:storefront:invalidate:${redis.options.db ?? 0}`;

/**
 * O que mudou na vitrine pública (descoberta + páginas de loja e produto). Cada dono de cache local registra um `StorefrontHandler` e apaga as próprias entradas.
 * - `takedown`: produto retirado/pausado/restaurado pela MODERAÇÃO (DEC-113: some em até 5 s).
 * - `store`: loja suspensa, reprovada, reativada, pausada, conta de recebimento ou fechamento (o mesmo prazo).
 * - `product`: mudança comercial do lojista (preço, estoque, pausa, foto): apaga a página e a vitrine daquele produto; a home segue o TTL (DEC-113).
 * - `all`: cidade ativada/desativada, ou perda do canal de invalidação (por segurança, apaga tudo).
 */
export type StorefrontEvent =
  | { scope: 'takedown'; storeId: string; productId: string }
  | { scope: 'store'; storeId: string }
  | { scope: 'product'; storeId: string; productIds: string[] | null }
  | { scope: 'all' };

export type StorefrontHandler = (event: StorefrontEvent) => void;

/**
 * Invalidação ativa dos caches da vitrine (DEC-113, SEC-201, DT-087). Três camadas:
 * 1. Caches em memória do processo (`LocalTtlCache`): cada serviço dono registra um handler que APAGA a entrada (não só vence o TTL, para o stale-if-error não devolver o item retirado).
 * 2. Caches Redis `home` e `feed` (30 s, por posição): `bump` do namespace (já vale para todas as réplicas, pois o Redis é um só).
 * 3. Outras réplicas da API: pub/sub do Redis. Mensagem perdida (Redis fora, réplica reconectando) NÃO vira conteúdo retirado para sempre: a réplica que reconecta apaga
 *    tudo, e no pior caso o prazo volta ao TTL (e, com falha de banco, ao stale-if-error de até 4x o TTL; ver `docs/arquitetura/guia-deploy.md` §14).
 * Falha aberta como o `CacheService`: nunca derruba a operação de negócio que invalidou (a escrita já foi confirmada).
 * Sacola e checkout não passam por aqui: leem o banco.
 */
@Injectable()
export class StorefrontCacheService implements OnModuleInit, OnApplicationShutdown {
  private readonly handlers: StorefrontHandler[] = [];
  private readonly origin = randomUUID();
  private subscriber: Redis | null = null;
  readonly channel: string;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly cache: CacheService,
  ) {
    this.channel = storefrontChannel(redis);
  }

  register(handler: StorefrontHandler): void {
    this.handlers.push(handler);
  }

  takedown(storeId: string, productId: string): Promise<void> {
    return this.emit({ scope: 'takedown', storeId, productId });
  }

  storeChanged(storeId: string): Promise<void> {
    return this.emit({ scope: 'store', storeId });
  }

  /** `productIds` nulo = o catálogo inteiro da loja (importação de planilha). */
  productsChanged(storeId: string, productIds: string[] | null): Promise<void> {
    return productIds?.length === 0 ? Promise.resolve() : this.emit({ scope: 'product', storeId, productIds });
  }

  everythingChanged(): Promise<void> {
    return this.emit({ scope: 'all' });
  }

  private async emit(event: StorefrontEvent): Promise<void> {
    this.applyLocal(event);
    if (event.scope !== 'product') await Promise.all([this.cache.bump('home'), this.cache.bump('feed')]);
    try {
      await this.redis.publish(this.channel, JSON.stringify({ origin: this.origin, event }));
    } catch (error) {
      logger.warn(`Invalidação não propagada às outras réplicas (vale o TTL lá): ${(error as Error).message}`);
    }
  }

  /** Só os caches deste processo (também é o que a mensagem das outras réplicas dispara). */
  applyLocal(event: StorefrontEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        logger.error(`Falha ao invalidar cache local: ${(error as Error).message}`);
      }
    }
  }

  onModuleInit(): void {
    if (this.handlers.length === 0) return; // processo sem caches da vitrine (ex.: worker): nada a ouvir
    // Conexão própria (assinante não executa outros comandos). Com fila offline, o `subscribe` espera a conexão e o ioredis reassina sozinho ao reconectar.
    const subscriber = this.redis.duplicate({ lazyConnect: false, enableOfflineQueue: true, maxRetriesPerRequest: null });
    this.subscriber = subscriber;
    let connectedBefore = false;
    subscriber.on('error', (error: Error) => logger.warn(`Canal de invalidação indisponível: ${error.message}`));
    subscriber.on('ready', () => {
      // Reconexão: mensagens enviadas enquanto estava fora foram perdidas; apagar tudo é barato e fecha a janela.
      if (connectedBefore) this.applyLocal({ scope: 'all' });
      connectedBefore = true;
    });
    subscriber.on('message', (_channel: string, raw: string) => {
      try {
        const message = JSON.parse(raw) as { origin?: string; event?: StorefrontEvent };
        if (message.origin === this.origin || !message.event) return; // eco da própria réplica (já aplicado)
        this.applyLocal(message.event);
      } catch (error) {
        logger.warn(`Mensagem de invalidação ilegível: ${(error as Error).message}`);
      }
    });
    subscriber.subscribe(this.channel).catch((error: Error) => logger.warn(`Sem assinatura do canal de invalidação: ${error.message}`));
  }

  onApplicationShutdown(): void {
    this.subscriber?.disconnect();
  }
}

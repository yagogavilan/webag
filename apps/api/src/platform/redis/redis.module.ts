import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.js';

export const REDIS = Symbol('REDIS');

const logger = new Logger('Redis');

@Injectable()
class RedisLifecycle implements OnModuleInit, OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Conecta ao subir (rate limit e antirreplay dependem disso); falha só gera aviso e o ioredis retenta. */
  onModuleInit(): void {
    if (this.redis.status === 'wait') {
      this.redis.connect().catch((error: Error) => logger.warn(`Redis indisponível no boot: ${error.message}`));
    }
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}

/** Cliente Redis compartilhado (cache, rate limit). BullMQ e Socket.IO criam conexões próprias. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const client = new Redis(config.get('REDIS_URL', { infer: true }), {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          connectTimeout: 3_000,
          // Sem fila offline: comando com Redis fora falha na hora em vez de ficar pendurado.
          enableOfflineQueue: false,
        });
        // Sem listener o ioredis imprime "Unhandled error event" fora do logger estruturado.
        // A URL não entra no log (pode conter senha).
        client.on('error', (error: Error) => logger.warn(`Redis indisponível: ${error.message}`));
        return client;
      },
    },
    RedisLifecycle,
  ],
  exports: [REDIS],
})
export class RedisModule {}

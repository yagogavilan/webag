import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { PG_POOL } from '../platform/database/database.module.js';
import { REDIS } from '../platform/redis/redis.module.js';

const CHECK_TIMEOUT_MS = 2_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout de ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'erro desconhecido';
}

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  async check(key = 'database'): Promise<HealthIndicatorResult> {
    const session = this.indicator.check(key);
    try {
      await withTimeout(this.pool.query('SELECT 1'), CHECK_TIMEOUT_MS);
      return session.up();
    } catch (error) {
      return session.down({ message: errorMessage(error) });
    }
  }
}

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(key = 'redis'): Promise<HealthIndicatorResult> {
    const session = this.indicator.check(key);
    try {
      if (this.redis.status === 'wait') {
        await withTimeout(this.redis.connect(), CHECK_TIMEOUT_MS);
      }
      await withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS);
      return session.up();
    } catch (error) {
      return session.down({ message: errorMessage(error) });
    }
  }
}

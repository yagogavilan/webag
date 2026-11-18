import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Redis } from 'ioredis';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { PG_POOL } from '../../src/platform/database/database.module.js';
import * as schema from '../../src/platform/database/schema.js';
import { MailService, type MailMessage } from '../../src/platform/mail/mail.service.js';
import { REDIS } from '../../src/platform/redis/redis.module.js';
import { hotp } from '../../src/modules/identity/totp.js';

/** Captura os e-mails em memória (nos testes o SMTP real/Mailpit não é usado). */
export class MemoryMailService extends MailService {
  readonly outbox: MailMessage[] = [];
  override enqueue(message: MailMessage): void {
    this.outbox.push(message);
  }
  override sendNow(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    return Promise.resolve();
  }
  to(address: string): MailMessage[] {
    return this.outbox.filter((m) => m.to === address);
  }
  /** Último código de 6 dígitos enviado ao endereço. */
  lastCode(address: string): string {
    const last = this.to(address).at(-1);
    const match = last ? /\b(\d{6})\b/.exec(last.subject) : null;
    if (!match?.[1]) throw new Error(`Nenhum código enviado para ${address}`);
    return match[1];
  }
}

export interface TestContext {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  mail: MemoryMailService;
  db: NodePgDatabase<typeof schema>;
  pool: pg.Pool;
  redis: Redis;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestContext> {
  const mail = { current: undefined as MemoryMailService | undefined };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useFactory({
      factory: (config: never) => {
        mail.current = new MemoryMailService(config);
        return mail.current;
      },
      inject: [(await import('@nestjs/config')).ConfigService],
    })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  const pool = app.get<pg.Pool>(PG_POOL);
  const redis = app.get<Redis>(REDIS);
  await redis.connect().catch(() => undefined);
  return {
    app,
    http: request(app.getHttpServer()) as unknown as ReturnType<typeof request>,
    mail: mail.current as MemoryMailService,
    db: drizzle(pool, { schema, casing: 'snake_case' }),
    pool,
    redis,
    close: () => app.close(),
  };
}

export const uniqueEmail = (prefix = 'user'): string => `${prefix}-${randomUUID().slice(0, 8)}@teste.webag.local`;
/** Senha forte que não está na lista de comuns. */
export const STRONG_PASSWORD = 'cavalo-bateria-grampo-9';

/** IP distinto por teste (TRUST_PROXY=1): isola contadores de rate limit entre testes. */
export const randomIp = (): string => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

export const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

/** Código TOTP para um deslocamento de passos (o servidor aceita ±1 e recusa reuso do mesmo passo). */
export function totpAt(secretBase32: string, stepOffset = 0): string {
  const { base32Decode } = require_totp();
  return hotp(base32Decode(secretBase32), Math.floor(Date.now() / 30_000) + stepOffset);
}

import * as totpModule from '../../src/modules/identity/totp.js';
function require_totp(): typeof totpModule {
  return totpModule;
}

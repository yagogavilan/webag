import { randomUUID } from 'node:crypto';
import type { Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ADMIN_PERMISSION, ADMIN_SELF, ALLOW_PENDING_MFA, IS_PUBLIC } from '../../src/platform/auth/decorators.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Redis } from 'ioredis';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import type { Env } from '../../src/platform/config/env.js';
import { restoreFeesIfTouched } from './fees.js';
import { ParametersService } from '../../src/modules/admin/index.js';
import { PG_POOL } from '../../src/platform/database/database.module.js';
import * as schema from '../../src/platform/database/schema.js';
import { MailService, type MailMessage } from '../../src/platform/mail/mail.service.js';
import { REDIS } from '../../src/platform/redis/redis.module.js';
import { base32Decode, hotp } from '../../src/modules/identity/totp.js';

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
    // O último e-mail COM código no assunto: depois do código podem chegar outros avisos (ex.: B2, pedido novo à loja) sem trocar qual código vale.
    for (const mail of [...this.to(address)].reverse()) {
      const match = /\b(\d{6})\b/.exec(mail.subject);
      if (match?.[1]) return match[1];
    }
    throw new Error(`Nenhum código enviado para ${address}`);
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

export async function createTestApp(options: { controllers?: Type<unknown>[] } = {}): Promise<TestContext> {
  const mail = { current: undefined as MemoryMailService | undefined };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: options.controllers ?? [] })
    .overrideProvider(MailService)
    .useFactory({
      factory: (config: ConfigService<Env, true>) => {
        mail.current = new MemoryMailService(config);
        return mail.current;
      },
      inject: [ConfigService],
    })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  const pool = app.get<pg.Pool>(PG_POOL);
  const redis = app.get<Redis>(REDIS);
  await redis.connect().catch(() => undefined);
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  await seedDeliveryFees(db);
  // SEC-169: os testes usam pontos isolados no mapa que não batem com o CEP do endereço; a conferência liga só no teste dela.
  await app.get(ParametersService).update('endereco_pino_max_m', 0, 'testes usam pontos isolados', { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null }).catch(() => undefined);
  // DEC-072: o padrão de produção da comissão é 15%, mas os testes de dinheiro usam contas redondas de 10%; o padrão real é testado em `dec072-rules`.
  await app.get(ParametersService).update('comissao_padrao_pct', 10, 'testes de dinheiro usam 10%', { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null }).catch(() => undefined);
  const context: TestContext = {
    app,
    http: withRandomIp(request(app.getHttpServer())),
    mail: mail.current!,
    db,
    pool,
    redis,
    // BUG-047: parâmetro global do admin e tabela de frete que o arquivo mexeu voltam ao básico aqui, mesmo se um `expect` falhou antes do `restoreFees` do próprio teste
    // (sem isso, a falha de um arquivo envenenava o seguinte: `sec155` A3 com frete zerado, desconto 500 em vez de 1.000).
    close: async () => {
      await restoreFeesIfTouched(context).catch(() => undefined);
      await app.close();
    },
  };
  return context;
}

/**
 * Cada requisição sai de um IP próprio (X-Forwarded-For, TRUST_PROXY=1) para os limites por IP não vazarem entre testes.
 * Teste que precisa de IP fixo (limite, bloqueio) define o header explicitamente, e o dele vale.
 */
function withRandomIp(agent: ReturnType<typeof request>): ReturnType<typeof request> {
  return new Proxy(agent, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof prop === 'string' && ['get', 'post', 'put', 'patch', 'delete'].includes(prop) && typeof value === 'function') {
        return (url: string) => (value as (u: string) => { set: (k: string, v: string) => unknown }).call(target, url).set('X-Forwarded-For', randomIp());
      }
      return value;
    },
  });
}

/** Sufixo aleatório de `len` caracteres hexadecimais (BUG-019 d: `uniqueEmail().slice(0, 6)` valia só "user-" + 1 caractere = 16 valores e colidia). */
export const uniqueTag = (len = 8): string => randomUUID().replace(/-/g, '').slice(0, len);
export const uniqueEmail = (prefix = 'user'): string => `${prefix}-${randomUUID().slice(0, 8)}@teste.webag.local`;
/** Senha forte que não está na lista de comuns. */
export const STRONG_PASSWORD = 'cavalo-bateria-grampo-9';

/** IP distinto por teste (TRUST_PROXY=1): isola contadores de rate limit entre testes. */
export const randomIp = (): string => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

export const bearer = (token: string): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

/** Código TOTP de um passo deslocado (o servidor aceita ±1 e recusa reuso do mesmo passo). */
export function totpAt(secretBase32: string, stepOffset = 0): string {
  return hotp(base32Decode(secretBase32), Math.floor(Date.now() / 30_000) + stepOffset);
}

/** Lista as rotas HTTP registradas (método, caminho com placeholders e se são públicas). Base da matriz de RBAC. */
export interface ListedRoute {
  method: string;
  path: string;
  isPublic: boolean;
  /** WB-355: permissão de admin declarada por `@AdminOnly` (handler ou classe) ou `admin-self` (`@AdminSelf`); `null` se a rota não declara nenhuma. */
  adminPermission: string | null;
  /** Rota de admin que um admin com o segundo fator pendente alcança (`@AllowPendingMfa`). */
  allowPendingMfa: boolean;
  operation: string;
}

export function listRoutes(app: NestExpressApplication): ListedRoute[] {
  const discovery = new DiscoveryService(app.get(ModulesContainer));
  const scanner = new MetadataScanner();
  const reflector = new Reflector();
  const routes: ListedRoute[] = [];
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const prefix = String(Reflect.getMetadata('path', metatype) ?? '');
    const proto = Object.getPrototypeOf(instance) as object;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, () => unknown>)[name];
      if (!handler) continue;
      const methodIndex = Reflect.getMetadata('method', handler) as number | undefined;
      if (methodIndex === undefined) continue;
      const sub = String(Reflect.getMetadata('path', handler) ?? '');
      const path = `/${[prefix, sub].map((part) => part.replace(/^\/|\/$/g, '')).filter(Boolean).join('/')}`;
      routes.push({
        method: methods[methodIndex] ?? 'GET',
        path,
        isPublic: reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [handler, metatype]) === true,
        adminPermission: reflector.getAllAndOverride<string | undefined>(ADMIN_PERMISSION, [handler, metatype]) ?? (reflector.getAllAndOverride<boolean | undefined>(ADMIN_SELF, [handler, metatype]) ? 'admin-self' : null),
        allowPendingMfa: reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_MFA, [handler, metatype]) === true,
        operation: `${metatype.name}.${name}`,
      });
    }
  }
  return routes;
}

/**
 * Base mínima do modelo da Webag (DEC-036): tabela padrão de entrega com 1 faixa de R$ 5,00 até o raio máximo (15 km) e pedido
 * mínimo zero, para os testes que não tratam de frete. Teste que trata de frete grava a própria tabela (nova versão) e o
 * próprio mínimo. Idempotente entre arquivos de teste que compartilham o banco da execução.
 */
async function seedDeliveryFees(db: ReturnType<typeof drizzle<typeof schema>>): Promise<void> {
  const [table] = await db
    .insert(schema.deliveryFeeTables)
    .values({ scopeType: 'default', scopeKey: 'default', version: 1, effectiveFrom: new Date(Date.now() - 86_400_000), reason: 'base dos testes' })
    .onConflictDoNothing()
    .returning({ id: schema.deliveryFeeTables.id });
  if (table) await db.insert(schema.deliveryFeeTiers).values({ tableId: table.id, position: 0, fromM: 0, toM: 15_000, feeCents: 500, exchangeFeeCents: 250, expectedCostCents: 0, etaMinutes: 10 });
  await db.insert(schema.parameters).values({ key: 'pedido_minimo_cents', value: 0 }).onConflictDoNothing();
  // SEC-154: o padrão de produção é 72 h de arrependimento; os testes de exclusão existentes assumem a anonimização na hora e os que tratam do prazo ajustam o parâmetro.
  await db.insert(schema.parameters).values({ key: 'exclusao_arrependimento_horas', value: 0 }).onConflictDoNothing();
  // BUG-016: o horário de produção da logística (seg a sáb, 09:00 às 20:00) deixaria os testes dependentes do relógio; aqui ela fica aberta o dia todo. Os testes do horário ajustam o parâmetro.
  await db.insert(schema.parameters).values({ key: 'logistica_horario', value: '00:00-23:59' }).onConflictDoNothing();
  await db.insert(schema.parameters).values({ key: 'logistica_dias', value: 'seg_dom' }).onConflictDoNothing();
}

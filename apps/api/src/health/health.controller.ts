import { Controller, Get } from '@nestjs/common';
import { Public } from '../platform/auth/decorators.js';
import { HealthCheck, HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';
import { DatabaseHealthIndicator, RedisHealthIndicator, SchemaHealthIndicator } from './health.indicators.js';

/** Endpoints operacionais, fora do prefixo /v1 (contrato: getHealth, getReadiness). */
@Public()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly schema: SchemaHealthIndicator,
  ) {}

  /** Liveness: não consulta dependências. */
  @Get()
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  /** Readiness: PostgreSQL (com as migrações em dia) e Redis precisam responder; senão 503. */
  @Get('ready')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.check(), () => this.schema.check(), () => this.redis.check()]);
  }
}

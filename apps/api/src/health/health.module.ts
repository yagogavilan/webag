import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { DatabaseHealthIndicator, RedisHealthIndicator, SchemaHealthIndicator } from './health.indicators.js';

@Module({
  imports: [TerminusModule.forRoot({ errorLogStyle: 'json' })],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator, SchemaHealthIndicator],
})
export class HealthModule {}

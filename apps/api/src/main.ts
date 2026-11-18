import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './platform/config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('API_PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();

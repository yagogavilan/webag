import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { RealtimeAdapter } from './modules/realtime/realtime.adapter.js';
import { bffClientIp } from './platform/http/client-ip.js';
import type { Env } from './platform/config/env.js';
import { findContractPath, loadContract, setupContractDocs } from './platform/openapi/contract-docs.js';

/** Configuração HTTP compartilhada por main.ts e pelos testes E2E (o teste sobe o app como em produção). */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  // IP real atrás do proxy (rate limit, auditoria). 0 = usa o IP do socket.
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }) ?? 0);
  // SEC-114: IP do navegador informado pelo BFF do painel, aceito só com o segredo compartilhado.
  app.use(bffClientIp(config.get('BFF_SHARED_SECRET', { infer: true })));
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (config.get('NODE_ENV', { infer: true }) === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });
  // Importação de produtos por planilha: corpo text/csv de até 1 MB. O parser só age nesse Content-Type (o JSON segue no limite padrão).
  app.useBodyParser('text', { type: 'text/csv', limit: '1mb' });
  // Graceful shutdown: SIGTERM fecha HTTP, pool do Postgres e Redis (OnApplicationShutdown).
  app.enableShutdownHooks();

  const origins = config.get('CORS_ORIGINS', { infer: true });
  // Sem origens configuradas, nenhuma origem de navegador é aceita (CORS restrito por padrão).
  app.enableCors({ origin: origins.length > 0 ? origins : false, credentials: true });

  // Tempo real (ADR-004): Socket.IO no mesmo servidor HTTP, com o CORS da API.
  app.useWebSocketAdapter(new RealtimeAdapter(app, origins));

  const docsEnabled =
    config.get('API_DOCS_ENABLED', { infer: true }) ??
    config.get('NODE_ENV', { infer: true }) !== 'production';
  if (docsEnabled) {
    const contractPath =
      config.get('OPENAPI_SPEC_PATH', { infer: true }) ?? findContractPath(process.cwd());
    if (!contractPath) {
      throw new Error(
        'Contrato OpenAPI não encontrado: defina OPENAPI_SPEC_PATH ou API_DOCS_ENABLED=false',
      );
    }
    setupContractDocs(app, loadContract(contractPath));
  }
}

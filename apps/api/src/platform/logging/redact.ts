/** Campos que NUNCA vão a log (skill padroes-backend). Usado pelo `pino` em `app.module.ts` e testado em `redact.spec.ts`. */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-webag-bff-secret"]',
  // WB-352 (VA-24): a credencial da visão "Ver como o lojista" nunca vai a log.
  'req.headers["x-view-as"]',
  'res.headers["set-cookie"]',
  'req.body',
] as const;

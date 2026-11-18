// Ponto de entrada do pacote. Tudo em ./generated vem do openapi.yaml: nunca editar à mão (`pnpm generate`).
export * from './generated/client.js';
/** Schemas Zod gerados do contrato (validação na API e em formulários). */
export * as schemas from './generated/zod.js';
export { apiFetch, configureApiClient, type ApiClientConfig } from './http/api-fetch.js';

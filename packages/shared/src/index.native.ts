// Entrada do app mobile (Metro troca `@webag/shared` por `@webag/shared/native`, ver apps/mobile/metro.config.js).
// Igual ao index.ts, SEM `schemas`: os ~600 KB de schemas Zod gerados são usados só pela API e pelo painel web; o app valida
// formulários com os próprios schemas e nunca importa `schemas` do contrato. Incluí-los pesava no bundle e no boot (cada schema é construído ao carregar).
// Se o app passar a precisar de `schemas`, importe `@webag/shared/schemas` (ou remova este arquivo).
export * from './generated/client.js';
export { apiFetch, configureApiClient, type ApiClientConfig } from './http/api-fetch.js';

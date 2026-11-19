import type { Help } from '@webag/shared';
import { apiRequest } from './client';

/** Ajuda do lojista (WB-034): perguntas e contatos editados pelo admin (`/admin/ajuda`); `audience=merchant`. */
export type { Help };
export const helpApi = { merchant: () => apiRequest<Help>('lojista', 'help', { query: { audience: 'merchant' } }) };
export const helpKeys = { merchant: ['lojista', 'help'] as const };

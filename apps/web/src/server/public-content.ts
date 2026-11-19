import 'server-only';
import { callApi, parseJson } from './upstream';

export type LegalType = 'customer_terms' | 'merchant_terms' | 'privacy';

export interface LegalDoc {
  id: string;
  type: LegalType;
  version: number;
  title: string;
  content: string;
  effectiveAt: string;
}

export interface HelpData {
  audience: 'customer' | 'merchant';
  contacts: { whatsapp: string | null; email: string | null; hours: string | null };
  privacy: { officerName: string | null; officerEmail: string | null; deletionRegretHours?: number; fiscalRetentionYears?: number; accessLogMonths?: number; privacyAnswerDays?: number };
  groups: { id: string; label: string; items: { id: string; question: string; answer: string }[] }[];
}

/** `missing` = a API respondeu que não há versão publicada; `unavailable` = falha de rede, limite ou erro da API. */
export type Loaded<T> = { status: 'ok'; data: T } | { status: 'missing' } | { status: 'unavailable' };

const TTL_MS = 60_000;
/** Depois do TTL ainda serve a última cópia boa se a API falhar (página de privacidade não pode sumir por um soluço). */
const STALE_MS = 60 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, path: string, query: string | undefined, valid: (body: unknown) => body is T): Promise<Loaded<T>> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return { status: 'ok', data: hit.value as T };
  const result = await callApi(path, query ? { query } : {});
  if (result.status === 404) return { status: 'missing' };
  const body = result.status === 200 ? parseJson<unknown>(result.text) : null;
  if (valid(body)) {
    cache.set(key, { at: now, value: body });
    return { status: 'ok', data: body };
  }
  if (hit && now - hit.at < STALE_MS) return { status: 'ok', data: hit.value as T };
  return { status: 'unavailable' };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function isLegal(body: unknown): body is LegalDoc {
  return isObject(body) && typeof body.title === 'string' && typeof body.content === 'string' && typeof body.version === 'number' && typeof body.effectiveAt === 'string';
}

function isHelp(body: unknown): body is HelpData {
  return isObject(body) && Array.isArray(body.groups) && isObject(body.contacts) && isObject(body.privacy);
}

export function loadLegal(type: LegalType): Promise<Loaded<LegalDoc>> {
  return cached(`legal:${type}`, `/v1/legal/${type}`, undefined, isLegal);
}

export function loadHelp(audience: 'customer' | 'merchant' = 'customer'): Promise<Loaded<HelpData>> {
  return cached(`help:${audience}`, '/v1/help', `?audience=${audience}`, isHelp);
}

/** Só para os testes. */
export function resetPublicContentCache(): void {
  cache.clear();
}

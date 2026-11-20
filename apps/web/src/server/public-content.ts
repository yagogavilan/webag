import 'server-only';
import type { MaintenanceStatus } from '@/lib/maintenance';
import { legalReviewed, legalVariables } from '@/lib/legal-text';
import { publicOrigin } from './config';
import { callApi, parseJson } from './upstream';

export type LegalType = 'customer_terms' | 'merchant_terms' | 'privacy' | 'exchange_policy';

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

/** Texto legal pronto para a página: o documento da API, as variáveis de exibição (SITE_URL, VERSAO, VIGENCIA da própria versão) e se o jurídico já aprovou (`LEGAL_REVIEWED`). */
export interface LegalView {
  loaded: Loaded<LegalDoc>;
  variables: Record<string, string>;
  reviewed: boolean;
}

export async function loadLegalView(type: LegalType): Promise<LegalView> {
  const loaded = await loadLegal(type);
  const variables = loaded.status === 'ok' ? legalVariables({ doc: loaded.data, siteUrl: publicOrigin() }) : {};
  return { loaded, variables, reviewed: legalReviewed() };
}

export function loadHelp(audience: 'customer' | 'merchant' = 'customer'): Promise<Loaded<HelpData>> {
  return cached(`help:${audience}`, '/v1/help', `?audience=${audience}`, isHelp);
}

/** Só para os testes. */
export function resetPublicContentCache(): void {
  maintenanceCache = null;
  cache.clear();
}

const MAINTENANCE_TTL_MS = 15_000;
let maintenanceCache: { at: number; value: MaintenanceStatus | null } | null = null;

function isMaintenance(body: unknown): body is MaintenanceStatus {
  return isObject(body) && typeof body.active === 'boolean';
}

/**
 * Modo manutenção para o aviso do site (WB-121 C1). Cache curto como a API (15 s). Falha ou resposta estranha = sem aviso:
 * a página pública nunca fica de fora por causa disso e nunca inventa uma manutenção.
 */
export async function loadMaintenance(): Promise<MaintenanceStatus | null> {
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.at < MAINTENANCE_TTL_MS) return maintenanceCache.value;
  const result = await callApi('/v1/config/maintenance');
  const body = result.status === 200 ? parseJson<unknown>(result.text) : null;
  const value = isMaintenance(body) && body.active ? body : null;
  if (isMaintenance(body)) maintenanceCache = { at: now, value };
  return value;
}

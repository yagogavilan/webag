import 'server-only';
import { IS_PROD, areaHost } from './config';
import type { SessionArea } from './cookies';

/** Host da requisição. `X-Forwarded-Host` só vale com `WEB_TRUST_FORWARDED_HOST=true` (proxy que o sobrescreve). */
export function requestHost(headers: Headers): string {
  const trusted = process.env.WEB_TRUST_FORWARDED_HOST === 'true';
  const raw = (trusted ? headers.get('x-forwarded-host')?.split(',')[0] : null) ?? headers.get('host') ?? '';
  return raw.trim().toLowerCase();
}

/**
 * Separação de hosts (SEC-116, SEC-082): `/admin` só no `ADMIN_HOST` e `/lojista` só no `LOJISTA_HOST`.
 * Um XSS em tela de um painel não pode rodar no host do outro. Em produção, host não configurado = recusa tudo
 * (falha fechada); em dev, sem variável, qualquer host serve (localhost).
 */
export function areaAllowedOnHost(area: SessionArea, headers: Headers): boolean {
  const expected = areaHost(area);
  if (!expected) return !IS_PROD;
  return requestHost(headers) === expected;
}

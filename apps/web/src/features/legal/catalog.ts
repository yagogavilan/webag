import type { LegalDocument, LegalType } from '@/lib/api/admin';

export const LEGAL_TYPES: { type: LegalType; slug: string; label: string }[] = [
  { type: 'customer_terms', slug: 'cliente', label: 'Termos de uso (cliente)' },
  { type: 'merchant_terms', slug: 'lojista', label: 'Termos do lojista' },
  { type: 'privacy', slug: 'privacidade', label: 'Política de privacidade' },
];

export function typeFromSlug(slug: string) {
  return LEGAL_TYPES.find((t) => t.slug === slug) ?? null;
}

export type VersionStatus = 'current' | 'scheduled' | 'previous';

/** Vigente = a maior versão cuja vigência já começou; agendada = vigência no futuro; o resto é anterior. */
export function statusOf(doc: LegalDocument, all: LegalDocument[], now: Date = new Date()): VersionStatus {
  if (new Date(doc.effectiveAt) > now) return 'scheduled';
  const current = all.filter((d) => new Date(d.effectiveAt) <= now).reduce<LegalDocument | null>((best, d) => (!best || d.version > best.version ? d : best), null);
  return current?.id === doc.id ? 'current' : 'previous';
}

export const STATUS_LABEL: Record<VersionStatus, string> = { current: 'Vigente', scheduled: 'Agendada', previous: 'Anterior' };

export function currentOf(all: LegalDocument[], now: Date = new Date()): LegalDocument | null {
  return all.find((d) => statusOf(d, all, now) === 'current') ?? null;
}

/** "2026-11-20" (data escolhida no formulário) vira o início desse dia em Brasília (UTC-3), em ISO UTC. */
export function effectiveIso(date: string): string {
  return new Date(`${date}T00:00:00-03:00`).toISOString();
}

export function todayBrt(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

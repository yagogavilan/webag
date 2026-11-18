import type { MerchantStore, StoreStatus } from './api/lojista';

/** Rótulo do estado da loja no chip do cabeçalho e nas telas de acompanhamento (onda-2 §0.6, L8). */
export const STORE_STATUS_LABEL: Record<StoreStatus, string> = {
  draft: 'Cadastro em andamento',
  in_review: 'Em análise',
  correction_requested: 'Correção pedida',
  approved: 'Aprovada',
  live: 'No ar',
  rejected: 'Recusada',
  suspended: 'Suspensa',
};

export type LojistaSection = 'inicio' | 'loja' | 'equipe';

export interface LojistaNavItem {
  section: LojistaSection;
  label: string;
  href: string;
  /** Só o dono vê (RN-13). */
  ownerOnly?: boolean;
}

export const LOJISTA_NAV: readonly LojistaNavItem[] = [
  { section: 'inicio', label: 'Início', href: '/lojista' },
  { section: 'loja', label: 'Minha loja', href: '/lojista/loja', ownerOnly: true },
  { section: 'equipe', label: 'Equipe', href: '/lojista/equipe', ownerOnly: true },
];

export function isOwner(store: MerchantStore | null | undefined): boolean {
  return store?.role === 'owner';
}

export function visibleLojistaNav(store: MerchantStore | null | undefined): LojistaNavItem[] {
  return LOJISTA_NAV.filter((item) => !item.ownerOnly || isOwner(store));
}

/** Etapas do cadastro (onda-2 Parte A). A revisão não conta no "Etapa X de 4". */
export const ONBOARDING_STEPS = ['1', '2', '3', '4', 'revisao'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function onboardingPath(step: OnboardingStep): string {
  return `/lojista/onboarding/${step}`;
}

/** Próxima etapa a abrir: a seguinte à última concluída (WB-051 C4), ou a revisão se tudo foi preenchido. */
export function resumeStep(store: Pick<MerchantStore, 'step'> | null): OnboardingStep {
  const done = store?.step ?? 0;
  return done >= 4 ? 'revisao' : (String(done + 1) as OnboardingStep);
}


/** Estados em que o lojista ainda está montando o cadastro (a loja não foi enviada). */
export function isOnboarding(store: MerchantStore | null): boolean {
  return store === null || store.status === 'draft';
}

/** Destino pós-login seguro: só caminhos internos do painel do lojista (evita open redirect). */
export function safeLojistaNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/lojista') || value.startsWith('//') || value.includes('\\')) return null;
  if (/^\/lojista\/(entrar|cadastro|convite|esqueci-a-senha)/.test(value)) return null;
  return value;
}

/** Link do suporte (WhatsApp do Webag). O número é configuração do fundador: `NEXT_PUBLIC_SUPPORT_WHATSAPP`. */
export function supportHref(): string {
  const number = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
  return number ? `https://wa.me/${number}` : 'https://wa.me/';
}

/** O catálogo (sub-onda 2B) ainda não existe: "Cadastrar produtos" só aparece quando a rota existir. */
export const CATALOG_READY = false;
export const NEW_PRODUCT_PATH = '/lojista/produtos/novo';

/** Documento do dono mascarado na revisão: só os 4 últimos caracteres (minimização). */
export function maskedDocument(value: string | null): string {
  if (!value) return '';
  return `${'•'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

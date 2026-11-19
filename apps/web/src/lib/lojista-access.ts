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

export type LojistaSection = 'inicio' | 'pedidos' | 'trocas' | 'produtos' | 'avaliacoes' | 'financeiro' | 'loja' | 'equipe';

export interface LojistaNavItem {
  section: LojistaSection;
  label: string;
  href: string;
  /** Só o dono vê (RN-13). */
  ownerOnly?: boolean;
  /**
   * Prioridade na barra de baixo do celular (1 a 8, `onda-7-navegacao-paineis.md` §3.1): os 4 primeiros que o perfil enxerga ficam na
   * barra; o resto vai para "Mais". Posição fixa por perfil, não muda com uso nem contagem.
   */
  bottomPriority: number;
  /** Grupo na barra lateral do desktop. */
  group: 'day' | 'store';
  /** Só o dono ou o funcionário com esta permissão (lista vazia = desconhecida, a tela abre e a API decide). */
  permission?: string;
}

export const LOJISTA_NAV_GROUP_LABEL: Record<LojistaNavItem['group'], string> = { day: 'Dia a dia', store: 'Minha loja' };

export const LOJISTA_NAV: readonly LojistaNavItem[] = [
  { section: 'inicio', label: 'Início', href: '/lojista', bottomPriority: 1, group: 'day' },
  { section: 'pedidos', label: 'Pedidos', href: '/lojista/pedidos', bottomPriority: 2, group: 'day' },
  { section: 'produtos', label: 'Produtos', href: '/lojista/produtos', bottomPriority: 3, group: 'day' },
  { section: 'trocas', label: 'Trocas', href: '/lojista/trocas', bottomPriority: 4, group: 'day' },
  { section: 'avaliacoes', label: 'Avaliações', href: '/lojista/avaliacoes', bottomPriority: 5, group: 'day', permission: 'reviews' },
  { section: 'financeiro', label: 'Financeiro', href: '/lojista/financeiro', bottomPriority: 6, group: 'store', ownerOnly: true },
  { section: 'loja', label: 'Minha loja', href: '/lojista/loja', bottomPriority: 7, group: 'store', ownerOnly: true },
  { section: 'equipe', label: 'Equipe', href: '/lojista/equipe', bottomPriority: 8, group: 'store', ownerOnly: true },
];

/** Os destinos da barra de baixo: os 4 de maior prioridade que o perfil enxerga (menos de 4 = os que existem). */
export function bottomLojistaNav(store: MerchantStore | null | undefined): LojistaNavItem[] {
  return [...visibleLojistaNav(store)].sort((a, b) => a.bottomPriority - b.bottomPriority).slice(0, 4);
}

export function isOwner(store: MerchantStore | null | undefined): boolean {
  return store?.role === 'owner';
}

/**
 * Dono, ou funcionário com a permissão "Pedidos" (`orders`). `GET /stores/mine` ainda não devolve as permissões do funcionário
 * (pendência de contrato, C4): lista vazia = desconhecido, a tela abre e a API decide (403/404).
 */
export function canManageOrders(store: MerchantStore | null | undefined): boolean {
  if (!store) return false;
  return store.role === 'owner' || store.permissions.length === 0 || store.permissions.includes('orders');
}

/** O painel de pedidos (e o alerta sonoro) só funciona com a loja aprovada; suspensa ainda acompanha o que está em andamento. */
export function ordersAvailable(store: MerchantStore | null | undefined): boolean {
  return Boolean(store) && (store?.status === 'approved' || store?.status === 'live' || store?.status === 'suspended') && canManageOrders(store);
}

/**
 * Loja "no ar": o painel do dia (vendas, ranking, avaliações) ocupa o lugar do passo a passo. A API não manda `live` (o estado dela é
 * `approved`): a loja está no ar quando os três itens do aviso "Falta pouco para aparecer no app" estão feitos (aprovada, ao menos um
 * produto ativo e conta de recebimento conectada). `[HIPÓTESE]` do web, ver `docs/gestao/fila-backend-dev.md`: se a API passar a mandar
 * `live`, ele vale primeiro.
 */
export function isStoreLive(store: Pick<MerchantStore, 'status' | 'hasActiveProduct' | 'payout'>): boolean {
  if (store.status === 'live') return true;
  return store.status === 'approved' && store.hasActiveProduct && store.payout.status === 'connected';
}

/** Financeiro só do dono (RN-13). */
export const canSeeFinance = (store: MerchantStore | null | undefined): boolean => store?.role === 'owner';

export function visibleLojistaNav(store: MerchantStore | null | undefined): LojistaNavItem[] {
  return LOJISTA_NAV.filter((item) => (!item.ownerOnly || isOwner(store)) && (!item.permission || hasPermission(store, item.permission)));
}

/** Dono, ou funcionário com a permissão. `GET /stores/mine` ainda pode vir sem as permissões (C4): lista vazia = a API decide. */
export function hasPermission(store: MerchantStore | null | undefined, permission: string): boolean {
  if (!store) return false;
  return store.role === 'owner' || store.permissions.length === 0 || store.permissions.includes(permission);
}
export const canReplyReviews = (store: MerchantStore | null | undefined): boolean => hasPermission(store, 'reviews');

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
  if (/^\/lojista\/(entrar|cadastro|convite|esqueci-a-senha|desistir-da-exclusao)/.test(value)) return null;
  return value;
}

/** Link do suporte (WhatsApp do Webag). O número é configuração do fundador: `NEXT_PUBLIC_SUPPORT_WHATSAPP`. */
export function supportHref(): string {
  const number = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');
  return number ? `https://wa.me/${number}` : 'https://wa.me/';
}

/** O catálogo só abre com a loja aprovada (API: 409 `STORE_NOT_APPROVED`); por isso o atalho só aparece depois da aprovação. */
export const NEW_PRODUCT_PATH = '/lojista/produtos/novo';

/** Documento do dono mascarado na revisão: só os 4 últimos caracteres (minimização). */
export function maskedDocument(value: string | null): string {
  if (!value) return '';
  return `${'•'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

/** Valores de venda (RN-13, `vendas_valores`): o dono sempre; o funcionário só com a permissão. Sem ela, o painel não mostra dinheiro. */
export const canSeeSalesValues = (store: MerchantStore | null | undefined): boolean => store?.role === 'owner' || Boolean(store?.permissions.includes('sales_values'));

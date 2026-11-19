import type { OrderAdvanceStatus, OrderStatus, StoreOrderAction } from '@/lib/api/orders';

/** Rótulos do painel do lojista (onda-4 §0.2): os mesmos do cliente, com "Aguardando você" para os novos. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Aguardando pagamento',
  received: 'Aguardando você',
  accepted: 'Pedido aceito',
  in_preparation: 'Em separação',
  out_for_delivery: 'Saiu para entrega',
  ready_for_pickup: 'Pronto para retirar',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  refused: 'Recusado',
  expired: 'Pagamento vencido',
};

export type OrderTone = 'info' | 'success' | 'danger' | 'warning' | 'neutral';
export const ORDER_STATUS_TONE: Record<OrderStatus, OrderTone> = {
  awaiting_payment: 'warning',
  received: 'info',
  accepted: 'info',
  in_preparation: 'info',
  out_for_delivery: 'info',
  ready_for_pickup: 'success',
  delivered: 'success',
  cancelled: 'danger',
  refused: 'danger',
  expired: 'neutral',
};

/** Colunas do painel: Novos, Em preparo, Saiu ou pronto. */
export type OrderGroup = 'new' | 'preparing' | 'ready';
export const ORDER_GROUPS: readonly OrderGroup[] = ['new', 'preparing', 'ready'];
export const ORDER_GROUP_LABEL: Record<OrderGroup, string> = { new: 'Novos', preparing: 'Em preparo', ready: 'Saiu ou pronto' };

export function groupOf(status: OrderStatus): OrderGroup | null {
  if (status === 'received') return 'new';
  if (status === 'accepted' || status === 'in_preparation') return 'preparing';
  if (status === 'out_for_delivery' || status === 'ready_for_pickup') return 'ready';
  return null;
}

export const isFinished = (status: OrderStatus): boolean => status === 'delivered' || status === 'cancelled' || status === 'refused' || status === 'expired';

export interface NextStep {
  /** Ação da API que o botão executa. */
  action: Extract<StoreOrderAction, 'prepare' | 'dispatch' | 'ready' | 'complete'>;
  label: string;
  /** Destino enviado a `POST /status`. */
  to: OrderAdvanceStatus;
}

const STEPS: Record<NextStep['action'], Omit<NextStep, 'label'>> = {
  prepare: { action: 'prepare', to: 'in_preparation' },
  dispatch: { action: 'dispatch', to: 'out_for_delivery' },
  ready: { action: 'ready', to: 'ready_for_pickup' },
  complete: { action: 'complete', to: 'delivered' },
};

/**
 * O próximo passo do pedido (StatusAction, P2): um botão só. Quem manda é `allowedActions` da API; aqui só se escolhe o
 * rótulo. Em "aceito" o passo é separar; pular direto para "saiu"/"pronto" fica no menu "Mais" (`skipStep`).
 */
export function nextStep(order: { status: OrderStatus; mode: 'delivery' | 'pickup'; allowedActions: StoreOrderAction[] }): NextStep | null {
  const allowed = new Set(order.allowedActions);
  const pick = (action: NextStep['action'], label: string): NextStep | null => (allowed.has(action) ? { ...STEPS[action], label } : null);
  switch (order.status) {
    case 'accepted':
      return pick('prepare', 'Iniciar separação') ?? skipStep(order);
    case 'in_preparation':
      return skipStep(order);
    case 'out_for_delivery':
      return pick('complete', 'Marcar como entregue');
    case 'ready_for_pickup':
      return pick('complete', 'Entregar com código');
    default:
      return null;
  }
}

/** "Saiu para entrega" (entrega) ou "pronto para retirada" (retirada): o passo seguinte em "separação" e o atalho em "aceito". */
export function skipStep(order: { mode: 'delivery' | 'pickup'; allowedActions: StoreOrderAction[] }): NextStep | null {
  const allowed = new Set(order.allowedActions);
  if (order.mode === 'delivery' && allowed.has('dispatch')) return { ...STEPS.dispatch, label: 'Marcar como saiu para entrega' };
  if (order.mode === 'pickup' && allowed.has('ready')) return { ...STEPS.ready, label: 'Marcar como pronto para retirada' };
  return null;
}

/** Hora em que o pedido "chegou" para a loja: o pagamento aprovado (a loja nem vê o que não foi pago). */
export const arrivedAt = (order: { paidAt: string | null; createdAt: string }): string => order.paidAt ?? order.createdAt;

export type ElapsedTone = 'normal' | 'warning' | 'danger';
/** A partir de 5 min em alerta; a partir de 8 min em erro (onda-4 P1). Sempre com ícone, nunca só cor. */
export function elapsedTone(minutes: number): ElapsedTone {
  if (minutes >= 8) return 'danger';
  if (minutes >= 5) return 'warning';
  return 'normal';
}

/** "agora", "há 2 min", "há 1 h 05 min". */
export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** "9:12" até o cancelamento automático; zera em "0:00". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "Sincronizado há 3 s" / "há 2 min". */
export function formatSyncAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `há ${seconds} s`;
  return `há ${Math.floor(seconds / 60)} min`;
}

export const ACTOR_LABEL: Record<'customer' | 'store' | 'system' | 'admin', string> = { customer: 'Cliente', store: 'Loja', system: 'Webag (automático)', admin: 'Webag' };

/** Motivos de recusa (P1). `other` exige texto de até 140 caracteres. */
export const REFUSE_REASONS = [
  { id: 'out_of_stock', label: 'Sem estoque' },
  { id: 'closing', label: 'Loja fechando' },
  { id: 'out_of_area', label: 'Fora da área' },
  { id: 'order_problem', label: 'Problema no pedido' },
  { id: 'other', label: 'Outro' },
] as const;
export type RefuseReasonId = (typeof REFUSE_REASONS)[number]['id'];
export const REFUSE_OTHER_MAX = 140;

/** Texto enviado à API (`reason`, 3 a 200). Devolve `null` quando falta o texto de "Outro". */
export function refuseReasonText(id: RefuseReasonId | null, other: string): string | null {
  if (!id) return null;
  if (id === 'other') {
    const text = other.trim();
    return text.length >= 3 ? `Outro: ${text}`.slice(0, 200) : null;
  }
  return REFUSE_REASONS.find((reason) => reason.id === id)?.label ?? null;
}

/** Primeiro nome já vem da API; o telefone só vira link do WhatsApp com DDD + número (10 ou 11 dígitos). */
export function whatsappHref(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  return national.length === 10 || national.length === 11 ? `https://wa.me/55${national}` : null;
}

/** "(11) 91234-5678" a partir dos dígitos; devolve o texto original se não for um telefone brasileiro. */
export function formatPhone(phone: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  if (national.length === 11) return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
  return phone ?? '';
}

/** "M · Preto" a partir dos atributos da variação. */
export function attributesText(attributes: Record<string, string>): string {
  return Object.values(attributes).join(' · ');
}

/** Endereço de entrega (o contrato o descreve como objeto livre): junta o que existir, na ordem de leitura. */
export function addressLines(address: Record<string, unknown>): string[] {
  const text = (key: string): string => (typeof address[key] === 'string' ? (address[key] as string).trim() : '');
  const street = [text('street'), text('number')].filter(Boolean).join(', ');
  const place = [text('neighborhood'), [text('city'), text('state')].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
  return [street, text('complement'), place, text('cep'), text('reference')].filter(Boolean);
}

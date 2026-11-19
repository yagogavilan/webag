import type { OrderAdvanceStatus, OrderStatus, StoreOrderAction } from '@/lib/api/orders';

/** Rótulos do painel do lojista (onda-4 §0.2): os mesmos do cliente, com "Aguardando você" para os novos. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  awaiting_payment: 'Aguardando pagamento',
  received: 'Aguardando você',
  accepted: 'Pedido aceito',
  in_preparation: 'Em separação',
  ready_for_collection: 'Pronto para coleta',
  out_for_delivery: 'Com o entregador',
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
  ready_for_collection: 'success',
  out_for_delivery: 'info',
  ready_for_pickup: 'success',
  delivered: 'success',
  cancelled: 'danger',
  refused: 'danger',
  expired: 'neutral',
};

/** Colunas do painel: Novos, Em separação, Prontos (para coleta ou retirada). O que vem depois da coleta é da logística (DEC-036). */
export type OrderGroup = 'new' | 'preparing' | 'ready';
export const ORDER_GROUPS: readonly OrderGroup[] = ['new', 'preparing', 'ready'];
export const ORDER_GROUP_LABEL: Record<OrderGroup, string> = { new: 'Novos', preparing: 'Em separação', ready: 'Prontos' };

export function groupOf(status: OrderStatus): OrderGroup | null {
  if (status === 'received') return 'new';
  if (status === 'accepted' || status === 'in_preparation') return 'preparing';
  if (status === 'ready_for_collection' || status === 'out_for_delivery' || status === 'ready_for_pickup') return 'ready';
  return null;
}

export const isFinished = (status: OrderStatus): boolean => status === 'delivered' || status === 'cancelled' || status === 'refused' || status === 'expired';

export interface NextStep {
  /** Ação da API que o botão executa. */
  action: Extract<StoreOrderAction, 'prepare' | 'ready' | 'complete'>;
  label: string;
  /** Destino enviado a `POST /status`. */
  to: OrderAdvanceStatus;
}

/**
 * O próximo passo do pedido (StatusAction, P2): um botão só. Quem manda é `allowedActions` da API; aqui só se escolhe o rótulo.
 * Entrega Webag: a loja termina em "Pronto para coleta" (DEC-036); "saiu" e "entregue" são da logística e nunca aparecem.
 * Retirada: "Pronto para retirar" e depois "Entregar com código".
 */
export function nextStep(order: { status: OrderStatus; mode: 'delivery' | 'pickup'; allowedActions: StoreOrderAction[] }): NextStep | null {
  const allowed = new Set(order.allowedActions);
  const ready: NextStep | null = allowed.has('ready')
    ? order.mode === 'delivery'
      ? { action: 'ready', to: 'ready_for_collection', label: 'Pronto para coleta' }
      : { action: 'ready', to: 'ready_for_pickup', label: 'Pronto para retirar' }
    : null;
  switch (order.status) {
    case 'accepted':
      return allowed.has('prepare') ? { action: 'prepare', to: 'in_preparation', label: 'Iniciar separação' } : ready;
    case 'in_preparation':
      return ready;
    case 'ready_for_pickup':
      return allowed.has('complete') ? { action: 'complete', to: 'delivered', label: 'Entregar com código' } : null;
    default:
      return null;
  }
}

/** Atalho em "aceito": pular a separação e ir direto a "pronto". */
export function skipStep(order: { mode: 'delivery' | 'pickup'; allowedActions: StoreOrderAction[] }): NextStep | null {
  if (!order.allowedActions.includes('ready')) return null;
  return order.mode === 'delivery' ? { action: 'ready', to: 'ready_for_collection', label: 'Já está pronto para coleta' } : { action: 'ready', to: 'ready_for_pickup', label: 'Já está pronto para retirar' };
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

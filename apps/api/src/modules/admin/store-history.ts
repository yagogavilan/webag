/**
 * Histórico por loja (WB-350 C4, D9): funções PURAS que traduzem uma linha do `audit_log` no formato do contrato (`AdminStoreHistoryEntry`).
 * Sem banco: testadas por tabela em `store-history.spec.ts`.
 */
export const STORE_HISTORY_TYPES = ['price', 'stock', 'catalog', 'hours', 'holidays', 'delivery', 'pickup', 'exchange_policy', 'pause', 'status', 'profile', 'commission', 'access', 'bulk', 'restore', 'other'] as const;
export type StoreHistoryType = (typeof STORE_HISTORY_TYPES)[number];

const STATUS_ACTIONS = new Set(['approve', 'reject', 'suspend', 'reactivate', 'request_correction', 'close', 'submit', 'draft', 'data_review_approve', 'data_review_reject']);
const EXACT: Record<string, StoreHistoryType> = {
  'store.hours': 'hours',
  'store.holidays': 'holidays',
  'store.delivery': 'delivery',
  'store.pickup': 'pickup',
  'store.exchange_policy': 'exchange_policy',
  'store.pause': 'pause',
  'store.resume': 'pause',
  'store.update': 'profile',
  'store.profile': 'profile',
};

export function historyTypeOf(action: string): StoreHistoryType {
  const exact = EXACT[action];
  if (exact) return exact;
  if (action.startsWith('view_as.')) return 'access';
  if (action.startsWith('commission.')) return 'commission';
  if (action.startsWith('store.') && STATUS_ACTIONS.has(action.slice(6))) return 'status';
  if (action.startsWith('product.price')) return 'price';
  if (action.startsWith('product.stock')) return 'stock';
  if (action.startsWith('product.bulk') || action.startsWith('bulk.')) return 'bulk';
  if (action.startsWith('product.restore') || action.endsWith('.restore')) return 'restore';
  if (action.startsWith('product.')) return 'catalog';
  return 'other';
}

/** Ações do `audit_log` que formam cada tipo (para o filtro `type` ir ao índice, sem varrer todas as linhas da loja). */
export function actionsOfType(type: StoreHistoryType): { exact: string[]; prefixes: string[] } {
  const exact = Object.entries(EXACT).filter(([, t]) => t === type).map(([a]) => a);
  const prefixes: string[] = [];
  if (type === 'status') exact.push(...[...STATUS_ACTIONS].map((a) => `store.${a}`));
  if (type === 'access') prefixes.push('view_as.');
  if (type === 'commission') prefixes.push('commission.');
  if (type === 'price') prefixes.push('product.price');
  if (type === 'stock') prefixes.push('product.stock');
  if (type === 'bulk') prefixes.push('product.bulk', 'bulk.');
  return { exact, prefixes };
}

export type TargetType = 'store' | 'product' | 'variant' | 'config';
export function targetTypeOf(type: StoreHistoryType): TargetType {
  if (type === 'price' || type === 'catalog' || type === 'bulk' || type === 'restore') return 'product';
  if (type === 'stock') return 'variant';
  if (['hours', 'holidays', 'delivery', 'pickup', 'exchange_policy', 'pause'].includes(type)) return 'config';
  return 'store';
}

const SUMMARY: Record<StoreHistoryType, string> = {
  price: 'Preço alterado',
  stock: 'Estoque alterado',
  catalog: 'Catálogo alterado',
  hours: 'Horário de funcionamento alterado',
  holidays: 'Feriados e datas especiais alterados',
  delivery: 'Configuração de entrega alterada',
  pickup: 'Configuração de retirada alterada',
  exchange_policy: 'Política de trocas alterada',
  pause: 'Pausa da loja alterada',
  status: 'Situação da loja alterada',
  profile: 'Dados da loja alterados',
  commission: 'Comissão alterada',
  access: 'Visualização do painel pela Webag',
  bulk: 'Ação em massa no catálogo',
  restore: 'Valor restaurado',
  other: 'Registro da loja',
};
const STATUS_LABEL: Record<string, string> = { approved: 'aprovada', rejected: 'recusada', suspended: 'suspensa', correction_requested: 'com correção pedida', in_review: 'em análise', draft: 'rascunho', closed: 'encerrada' };

/** Frase curta em português, sem dado de cliente nem texto livre do usuário. */
export function summaryOf(action: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  const type = historyTypeOf(action);
  if (action === 'store.resume') return 'Loja reaberta (pausa encerrada)';
  if (action === 'store.pause') return 'Loja pausada';
  if (action === 'view_as.open') return 'Visualização do painel aberta pela Webag';
  if (action === 'view_as.close') return 'Visualização do painel encerrada';
  if (action === 'view_as.denied') return 'Tentativa recusada durante a visualização';
  if (type === 'status') {
    const to = typeof after?.status === 'string' ? STATUS_LABEL[after.status] : undefined;
    return to ? `Loja ${to}` : SUMMARY.status;
  }
  void before;
  return SUMMARY[type];
}

/** O `reason` do `audit_log` guarda `codigo` ou `codigo|nota` (texto puro); o contrato quer `{ code, note? }`. */
export const encodeReason = (reason: { code: string; note?: string | undefined }): string => (reason.note ? `${reason.code}|${reason.note}` : reason.code);

export function decodeReason(raw: string | null, codes: readonly string[]): { code: string; note?: string } | null {
  if (!raw) return null;
  const bar = raw.indexOf('|');
  const code = bar === -1 ? raw : raw.slice(0, bar);
  if (!codes.includes(code)) return null; // motivo em texto livre de ação antiga: não é do catálogo
  return bar === -1 ? { code } : { code, note: raw.slice(bar + 1) };
}

/** Quem agiu: admin (perfil de admin no registro), sistema (sem ator) ou lojista. */
export function actorKindOf(actorId: string | null, actorRole: string | null): 'admin' | 'merchant' | 'system' {
  if (!actorId) return 'system';
  if (actorRole && ['super_admin', 'operations', 'finance', 'support'].includes(actorRole)) return 'admin';
  return 'merchant';
}

/** O contrato quer `before` e `after` como objeto (ou nulo); lista (horários, feriados) vai em `{ items: [...] }`. */
export function asHistoryObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return { items: value };
  return typeof value === 'object' ? (value as Record<string, unknown>) : { value };
}

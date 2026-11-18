import type { AuditFilters } from '@/lib/api/admin';
import { todayBrt } from '@/features/legal/catalog';

/** Ações que a API grava hoje, em português (AD6: "Parâmetro alterado"). Ação desconhecida aparece com o código. */
export const ACTION_LABEL: Record<string, string> = {
  'admin.login': 'Entrada no painel',
  'admin.login_throttled': 'Entrada bloqueada por excesso de tentativas',
  'admin.access_denied': 'Acesso negado',
  'admin.access_reactivated': 'Acesso reativado',
  'admin.invite': 'Convite de admin enviado',
  'admin.invite_accept': 'Convite de admin aceito',
  'admin.invite_revoke': 'Convite de admin cancelado',
  'admin.update': 'Admin alterado',
  'admin.password_reset': 'Senha de admin redefinida',
  'admin.totp_configured': 'Verificação em duas etapas configurada',
  'admin.recovery_code_used': 'Código de recuperação usado',
  'admin.recovery_codes_regenerated': 'Códigos de recuperação gerados',
  'category.create': 'Categoria criada',
  'category.update': 'Categoria alterada',
  'category.delete': 'Categoria excluída',
  'category.reorder': 'Categorias reordenadas',
  'city.create': 'Cidade criada',
  'city.update': 'Cidade alterada',
  'neighborhood.create': 'Bairro criado',
  'neighborhood.update': 'Bairro alterado',
  'parameter.update': 'Parâmetro alterado',
  'parameter.reset': 'Parâmetro restaurado ao padrão',
  'feature_flag.set': 'Feature flag alterada',
  'legal.publish': 'Versão de termos publicada',
  'payment.refund': 'Estorno',
  'payment.webhook_reprocess': 'Webhook reprocessado',
  mfa_bruteforce_suspected: 'Tentativas suspeitas no segundo fator',
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

export type Period = 'today' | '7d' | '30d' | 'custom' | 'all';

/** Período vira `from`/`to` em ISO. Dias contam a partir da meia-noite de Brasília. */
export function periodRange(period: Period, custom: { from: string; to: string }, now: Date = new Date()): Pick<AuditFilters, 'from' | 'to'> {
  const startOfDay = (ymd: string) => new Date(`${ymd}T00:00:00-03:00`);
  const today = todayBrt(now);
  if (period === 'today') return { from: startOfDay(today).toISOString() };
  if (period === '7d' || period === '30d') {
    const days = period === '7d' ? 6 : 29;
    return { from: new Date(startOfDay(today).getTime() - days * 86_400_000).toISOString() };
  }
  if (period === 'custom') {
    return {
      from: custom.from ? startOfDay(custom.from).toISOString() : undefined,
      to: custom.to ? new Date(startOfDay(custom.to).getTime() + 86_400_000 - 1).toISOString() : undefined,
    };
  }
  return {};
}

const TARGET_LABEL: Record<string, string> = {
  parameter: 'Parâmetro',
  feature_flag: 'Flag',
  legal_document: 'Documento',
  category: 'Categoria',
  city: 'Cidade',
  neighborhood: 'Bairro',
  user: 'Usuário',
  invitation: 'Convite',
  payment_attempt: 'Pagamento',
  webhook_event: 'Webhook',
};

export function targetText(type: string | null, id: string | null): string {
  if (!type) return '—';
  const label = TARGET_LABEL[type] ?? type;
  return id ? `${label}: ${id.length > 14 ? `${id.slice(0, 8)}…` : id}` : label;
}

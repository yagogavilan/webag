import type { AdminProfile } from '../identity/db/schema.js';

/**
 * B3 / WB-198 / WB-113 (leitura): catálogo dos alertas de operação que o sistema grava em `payment_alerts` (a tabela nasceu para a conciliação e
 * virou a caixa de entrada de tudo o que pede um humano). UMA tabela de rótulo, gravidade, área e quem vê: o painel não inventa texto e o
 * RBAC (`alerts:read`, `alerts:resolve`) corta por TIPO, não por tela. Tipo desconhecido (alerta novo sem entrada aqui) aparece como
 * "Outro alerta", só para o super admin, para nunca ficar invisível. O teste `alert-catalog.spec.ts` lê o código e falha se um tipo gravado não estiver aqui.
 */
export const ALERT_AREAS = ['payments', 'orders', 'logistics', 'exchanges', 'stores', 'privacy', 'platform'] as const;
export type AlertArea = (typeof ALERT_AREAS)[number];
export const ALERT_SEVERITIES = ['critical', 'warning', 'info'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface AlertKindInfo {
  label: string;
  area: AlertArea;
  /** `critical` = dinheiro ou prazo legal em risco, agir no dia; `warning` = agir logo; `info` = acompanhar. */
  severity: AlertSeverity;
  /** O que fazer, em uma frase (pt-BR). */
  hint: string;
  /** Perfis que veem (e resolvem, se tiverem `alerts:resolve`). */
  audience: readonly AdminProfile[];
}

const SUPER: AdminProfile = 'super_admin';
const OPS: AdminProfile = 'operations';
const FIN: AdminProfile = 'finance';
const SUP: AdminProfile = 'support';
const MONEY = [SUPER, FIN] as const;
const OPERATION = [SUPER, OPS, SUP] as const;
const LOGISTICS = [SUPER, OPS, FIN, SUP] as const;

export const ALERT_KINDS: Readonly<Record<string, AlertKindInfo>> = {
  // ---- pagamentos e conciliação (dinheiro: financeiro e super admin)
  conciliation_mismatch: { label: 'Pagamento diverge do provedor', area: 'payments', severity: 'critical', hint: 'Compare o valor, a loja e a referência do pagamento com o pedido e o provedor antes de liberar o pedido.', audience: MONEY },
  provider_payment_missing: { label: 'Pedido pago sem pagamento no provedor', area: 'payments', severity: 'critical', hint: 'O provedor não reconhece o pagamento aprovado; confira no painel do provedor e, se confirmado, estorne e cancele o pedido.', audience: MONEY },
  unknown_payment: { label: 'Pagamento do provedor sem pedido', area: 'payments', severity: 'critical', hint: 'Chegou um pagamento que nenhum pedido reconhece; localize o pagador e estorne no provedor.', audience: MONEY },
  creation_unresolved: { label: 'Pagamento sem resposta do provedor', area: 'payments', severity: 'warning', hint: 'A criação do pagamento não foi confirmada; a conciliação tenta de novo, acompanhe até virar aprovado ou cancelado.', audience: MONEY },
  late_payment_refunded: { label: 'Pagamento tardio estornado', area: 'payments', severity: 'info', hint: 'Um pagamento chegou depois de o pedido expirar e foi devolvido sozinho; nada a fazer além de conferir.', audience: MONEY },
  payment_disputed: { label: 'Pagamento contestado (chargeback)', area: 'payments', severity: 'critical', hint: 'O cliente contestou a cobrança no cartão; reúna a prova de entrega e responda ao provedor no prazo.', audience: MONEY },
  order_attempt_mismatch: { label: 'Pagamento não confere com o pedido', area: 'payments', severity: 'critical', hint: 'Valor, loja ou vínculo do pagamento não bate com o pedido; o sistema não pagou o pedido e estornou se aprovado. Confira o estorno.', audience: MONEY },
  exchange_attempt_mismatch: { label: 'Pagamento não confere com a troca', area: 'payments', severity: 'critical', hint: 'Valor ou vínculo do pagamento da taxa de coleta não bate com a troca; confira e estorne se cobrado.', audience: MONEY },
  webhook_failed: { label: 'Aviso do provedor não processado', area: 'payments', severity: 'critical', hint: 'O webhook falhou todas as tentativas; reprocesse o evento em Pagamentos ou confirme o pagamento no provedor.', audience: MONEY },
  reconcile_provider_failures: { label: 'Conciliação com falhas do provedor', area: 'payments', severity: 'warning', hint: 'O provedor falhou ao responder durante a conciliação; veja se está fora do ar. A próxima rodada tenta de novo.', audience: MONEY },
  refund_failed: { label: 'Estorno recusado pelo provedor', area: 'payments', severity: 'warning', hint: 'O provedor recusou o estorno; o sistema tenta de novo com espera. Acompanhe na fila de estornos.', audience: MONEY },
  refund_exhausted: { label: 'Estorno esgotou as tentativas', area: 'payments', severity: 'critical', hint: 'O estorno não passou depois de todas as tentativas (por exemplo, falta saldo ao lojista); decida na fila de estornos entre tentar de novo ou cobrir.', audience: MONEY },
  refund_unresolved: { label: 'Estorno sem confirmação', area: 'payments', severity: 'critical', hint: 'Não sabemos se o provedor concluiu o estorno; confira no provedor para não devolver duas vezes.', audience: MONEY },
  refund_covered_payout_pending: { label: 'Estorno coberto pela Webag, falta pagar por fora', area: 'payments', severity: 'critical', hint: 'A Webag assumiu o estorno; pague o cliente por fora do provedor e registre a dívida da loja.', audience: MONEY },
  refund_double_paid: { label: 'Estorno devolvido duas vezes', area: 'payments', severity: 'critical', hint: 'O cliente recebeu o valor por duas vias (cobertura e provedor); confira e cobre a diferença.', audience: MONEY },
  payment_token_refresh_failed: { label: 'Conta de recebimento da loja não renovou o acesso', area: 'payments', severity: 'warning', hint: 'A conexão da loja com o provedor venceu e não renovou; peça à loja para reconectar a conta, ou as vendas dela param.', audience: MONEY },
  payment_account_holder_mismatch: { label: 'Titular da conta de recebimento não é o da loja', area: 'payments', severity: 'critical', hint: 'O CPF/CNPJ do titular da conta conectada difere do da loja; revise antes de liberar a conta (Lojas).', audience: MONEY },
  payment_account_changed: { label: 'Conta de recebimento da loja foi trocada', area: 'payments', severity: 'warning', hint: 'A loja conectou outra conta; confira se foi ela mesma (risco de desvio) antes dos próximos repasses.', audience: MONEY },

  // ---- pedidos
  order_not_received: { label: 'Cliente diz que não recebeu o pedido', area: 'orders', severity: 'warning', hint: 'Fale com o cliente e a Logística; decida entre reentrega, estorno ou manter a entrega como feita.', audience: OPERATION },
  cancel_request_unanswered: { label: 'Loja não respondeu ao pedido de cancelamento', area: 'orders', severity: 'warning', hint: 'O cliente pediu para cancelar um pedido em separação e a loja não respondeu no prazo; decida e cancele o pedido se for o caso.', audience: OPERATION },
  pickup_code_locked: { label: 'Código de retirada bloqueado por tentativas', area: 'orders', severity: 'warning', hint: 'Houve várias tentativas erradas do código de retirada; confirme com a loja e o cliente se é erro ou tentativa de fraude.', audience: OPERATION },
  store_cancel_rate: { label: 'Loja com muitos cancelamentos por culpa dela', area: 'stores', severity: 'warning', hint: 'A taxa de cancelamento da loja passou do limite nos últimos 30 dias; fale com a loja e, se persistir, avalie suspender.', audience: [SUPER, OPS, SUP] },

  // ---- logística
  delivery_auto_conclude_held: { label: 'Auto-conclusão da entrega retida (cliente disse que não recebeu)', area: 'logistics', severity: 'warning', hint: 'A entrega não foi concluída sozinha porque o cliente avisou que não recebeu; a operação decide.', audience: LOGISTICS },
  delivery_ready: { label: 'Pedido pronto aguardando motoboy', area: 'logistics', severity: 'info', hint: 'A loja marcou o pedido como pronto; atribua um motoboy na Logística.', audience: LOGISTICS },
  delivery_late: { label: 'Entrega atrasada', area: 'logistics', severity: 'warning', hint: 'A entrega passou do fim da faixa prometida; acompanhe com o motoboy na Logística.', audience: LOGISTICS },
  collection_late: { label: 'Coleta de troca atrasada', area: 'logistics', severity: 'warning', hint: 'A coleta da troca passou do prazo; atribua motoboy ou combine novo horário com o cliente.', audience: LOGISTICS },
  late_cancel_requested: { label: 'Cliente pediu cancelamento por atraso', area: 'logistics', severity: 'critical', hint: 'Responda em poucos minutos (aceitar ou "chego em até N min"); sem resposta o sistema aceita o cancelamento.', audience: LOGISTICS },
  delivery_cancelled_with_courier: { label: 'Entrega cancelada com o motoboy já atribuído', area: 'logistics', severity: 'warning', hint: 'Avise o motoboy e registre o custo, se houver.', audience: LOGISTICS },
  delivery_cost_high: { label: 'Custo da corrida acima do esperado', area: 'logistics', severity: 'warning', hint: 'O custo lançado passou do alerta ou de 1,5x o previsto; confira o motivo informado e o lançamento.', audience: [SUPER, FIN, OPS] },
  return_awaiting_store: { label: 'Devolução aguardando a loja confirmar', area: 'logistics', severity: 'warning', hint: 'O pedido voltou à loja e ela ainda não confirmou o recebimento; cobre a loja ou confirme pelo admin com motivo.', audience: LOGISTICS },

  // ---- trocas
  exchange_code_locked: { label: 'Código da troca bloqueado por tentativas', area: 'exchanges', severity: 'warning', hint: 'Houve várias tentativas erradas do código da troca; confirme com a loja e o cliente.', audience: OPERATION },
  exchange_refund_late: { label: 'Reembolso da troca atrasado', area: 'exchanges', severity: 'warning', hint: 'O item foi recebido e o reembolso passou do prazo; conclua ou fale com o cliente.', audience: [SUPER, OPS, FIN, SUP] },

  // ---- privacidade (LGPD: super admin)
  privacy_request_due: { label: 'Pedido de titular perto do prazo', area: 'privacy', severity: 'critical', hint: 'Um pedido de titular (LGPD) vence logo; responda em Titulares dentro do prazo legal.', audience: [SUPER] },
  account_deletion_overdue: { label: 'Exclusão de conta atrasada', area: 'privacy', severity: 'critical', hint: 'Uma exclusão passou do prazo de anonimização; investigue a falha e conclua pela CLI (runbook de privacidade).', audience: [SUPER] },
  account_deletion_failed: { label: 'Exclusão de conta falhou', area: 'privacy', severity: 'critical', hint: 'A anonimização falhou várias vezes; veja o log e o runbook de privacidade.', audience: [SUPER] },
  account_deletion_under_attack: { label: 'Exclusão de conta sob tentativa de invasão', area: 'privacy', severity: 'warning', hint: 'Há muitas tentativas de senha ou código numa conta com exclusão pendente; avise o titular por outro canal e considere o runbook.', audience: [SUPER] },
  retention_failed: { label: 'Rotina de retenção falhou', area: 'privacy', severity: 'warning', hint: 'A rotina diária que apaga dado vencido falhou; veja o log, dado vencido pode estar ficando além do prazo.', audience: [SUPER] },

  // ---- plataforma
  push_campaign_failed: { label: 'Campanha de push falhou', area: 'platform', severity: 'info', hint: 'A campanha não foi enviada; veja o motivo em Notificações e crie de novo se precisar.', audience: [SUPER, OPS] },
};

const UNKNOWN: AlertKindInfo = { label: 'Outro alerta', area: 'platform', severity: 'info', hint: 'Alerta sem descrição cadastrada; veja os detalhes e fale com o time técnico.', audience: [SUPER] };

export const alertKindInfo = (kind: string): AlertKindInfo => (Object.hasOwn(ALERT_KINDS, kind) ? ALERT_KINDS[kind]! : UNKNOWN);

/** Tipos que o perfil vê. O super admin também vê os desconhecidos (`all: true`), para alerta novo nunca ficar invisível. */
export function alertKindsVisibleTo(profile: AdminProfile): { kinds: string[]; all: boolean } {
  return { kinds: Object.entries(ALERT_KINDS).filter(([, info]) => info.audience.includes(profile)).map(([kind]) => kind), all: profile === 'super_admin' };
}

export const canSeeAlertKind = (profile: AdminProfile, kind: string): boolean => alertKindInfo(kind).audience.includes(profile);

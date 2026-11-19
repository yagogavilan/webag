/**
 * Parâmetros do negócio (RN-02, WB-119). Definição, faixa e padrão ficam no código (revisados em PR);
 * o valor corrente fica na tabela `parameters` e muda pelo admin sem deploy.
 */
export type ParameterType = 'int' | 'decimal' | 'enum' | 'window';

interface Base {
  key: string;
  description: string;
  /** Referência de origem (HIP/WB) para rastrear a hipótese. */
  ref: string;
  /** Piso legal fixo (DEC-011/DEC-023): ninguém edita, nem o super admin. */
  legalFloor?: boolean;
}

export type ParameterDefinition =
  | (Base & { type: 'int' | 'decimal'; default: number; min?: number; max?: number })
  | (Base & { type: 'enum'; default: string; values: readonly string[] })
  | (Base & { type: 'window'; default: string });

const int = (key: string, def: number, min: number | undefined, max: number | undefined, description: string, ref: string, legalFloor = false): ParameterDefinition => ({
  key, type: 'int', default: def, min, max, description, ref, ...(legalFloor ? { legalFloor } : {}),
});

/**
 * BUG-017: parâmetros que NÃO existem na 1.0 e por isso não aparecem no painel (mexer neles não faria nada). Cada um diz por quê;
 * a RN-02 espelha esta lista. O teste `parameters-wired` garante que nenhum fica sem leitura ou sem justificativa aqui.
 */
export const DISABLED_PARAMETERS: Readonly<Record<string, string>> = {
  raio_padrao_km: 'DEC-036b: a loja não tem raio próprio; o raio é global (`raio_max_km`) e o alcance real vem do teto do ETA (DEC-054).',
  repasse_periodicidade: 'DEC-016: o repasse é o split do Mercado Pago no pagamento; a Webag não retém nem agenda repasse. A carência (`repasse_carencia_dias`) é só o rótulo do extrato.',
  dados_cliente_visivel_dias: 'RN-14 pede N dias de visibilidade depois da conclusão; o código mostra o dado do cliente à loja só com o pedido em andamento (regra mais restritiva, LGPD: minimização). Ligar o parâmetro AFROUXARIA a proteção; fica fora da 1.0 até o jurídico pedir.',
};

export const PARAMETER_DEFINITIONS: readonly ParameterDefinition[] = [
  { key: 'comissao_padrao_pct', type: 'decimal', default: 10, min: 0, max: 30, description: 'Comissão padrão sobre o subtotal de produtos (%)', ref: 'HIP-001' },
  { key: 'taxa_servico_tipo', type: 'enum', default: 'nenhuma', values: ['nenhuma', 'fixa', 'percentual'], description: 'Tipo da taxa de serviço ao cliente', ref: 'HIP-003' },
  int('taxa_servico_valor', 0, 0, 5000, 'Taxa de serviço: centavos (fixa) ou pontos-base de % (percentual, até 50,00%)', 'HIP-003'),
  int('pix_expiracao_min', 15, 5, 60, 'Validade do PIX (min)', 'HIP-006'),
  int('loja_aceite_timeout_min', 10, 3, 30, 'Tempo da loja para aceitar o pedido (min)', 'HIP-008'),
  int('cancelamento_resposta_min', 10, 3, 60, 'Prazo da loja para decidir o pedido de cancelamento do cliente com o pedido em separação (min); sem resposta o admin é alertado (WB-028 C2)', 'WB-028'),
  int('loja_aceite_lembrete_min', 5, 3, 30, 'Lembrete de aceite à loja (min)', 'HIP-008'),
  int('parcelas_max', 3, 1, 12, 'Máximo de parcelas no cartão', 'HIP-011'),
  int('parcela_min_cents', 3000, 1000, undefined, 'Valor mínimo da parcela (centavos)', 'HIP-011'),
  int('pedido_max_cents', 200000, 10000, undefined, 'Valor máximo por pedido (centavos)', 'HIP-012'),
  int('raio_max_km', 15, 1, 50, 'Raio máximo de entrega, global (km; a loja não tem raio próprio, DEC-036b)', 'HIP-013'),
  int('pedido_minimo_cents', 2000, 0, 50000, 'Pedido mínimo global, sobre o subtotal de produtos (centavos)', 'HIP-L12'),
  int('frete_gratis_acima_cents', 0, 0, 1000000, 'Entrega grátis acima deste subtotal (centavos; 0 desliga; subsídio da Webag)', 'HIP-L12'),
  int('logistica_sla_atribuir_min', 10, 1, 120, 'Espera sem motoboy que deixa a corrida amarela ("Espera longa", min)', 'HIP-L10'),
  int('logistica_sla_atribuir_critico_min', 20, 2, 240, 'Espera sem motoboy que deixa a corrida vermelha ("Atrasado", min)', 'HIP-L10'),
  int('logistica_alerta_entrega_min', 60, 10, 480, 'Só para corridas sem ETA gravado (anteriores à DEC-053): corrida em "saiu para entrega" há mais que isto ganha "Atenção" (min). Com ETA, o alerta vem do fim da faixa do pedido', 'HIP-L10'),
  int('entrega_preparo_padrao_min', 20, 5, 120, 'ETA: preparo padrão da loja (min); a loja pode definir o seu', 'DEC-053'),
  int('entrega_despacho_min', 15, 0, 60, 'ETA: espera de despacho até o motoboy sair (min)', 'DEC-053'),
  int('entrega_rota_fator_pct', 130, 100, 250, 'ETA: fator de rota sobre a distância em linha reta (130 = 1,30)', 'DEC-053'),
  { key: 'entrega_min_por_km', type: 'decimal', default: 6, min: 1, max: 30, description: 'ETA: minutos de deslocamento por km de rota', ref: 'DEC-053' },
  int('entrega_faixa_min', 15, 0, 60, 'ETA: folga da faixa para cada lado da estimativa (min)', 'DEC-053'),
  int('entrega_max_min', 120, 30, 240, 'ETA: teto do FIM da faixa (estimativa + folga); acima disso a loja não entrega para o endereço ("fora da área")', 'DEC-054'),
  int('entrega_atraso_tolerancia_min', 15, 0, 60, 'Atraso: minutos depois do fim da faixa antes de compensar e de liberar o cancelamento sem custo (RN-19 4c e 4d)', 'HIP-E04'),
  { key: 'entrega_compensacao_tipo', type: 'enum', default: 'frete_gratis_proximo', values: ['frete_gratis_proximo', 'cupom_valor', 'nenhuma'], description: 'Compensação do pedido entregue com atraso: entrega grátis no próximo pedido, cupom de valor ou nenhuma (RN-19 4c)', ref: 'HIP-E05' },
  int('entrega_compensacao_cents', 1000, 0, 5000, 'Valor do cupom de compensação, só no tipo cupom_valor (centavos)', 'HIP-E05'),
  int('entrega_cancel_resposta_min', 10, 3, 30, 'Pedido já em saída para entrega: prazo da operação responder ao cancelamento por atraso; sem resposta, aceita (min)', 'HIP-E06'),
  { key: 'logistica_horario', type: 'window', default: '09:00-20:00', description: 'Horário em que a Webag despacha entregas (Brasília); fora dele só retirada, com "Entrega volta às HH:MM" (DEC-039c)', ref: 'DEC-039c' },
  { key: 'logistica_dias', type: 'enum', default: 'seg_sab', values: ['seg_sab', 'seg_sex', 'seg_dom'], description: 'Dias em que a logística abre (seg_sab = segunda a sábado)', ref: 'DEC-039c' },
  int('entrega_lote_max', 4, 2, 10, 'Corridas da mesma área que a Logística atribui de uma vez ao mesmo motoboy (lote, DEC-053)', 'DEC-053'),
  int('entrega_custo_max_cents', 15000, 1000, 100000, 'Custo máximo lançável por corrida ao motoboy (centavos, SEC-145)', 'SEC-145'),
  int('entrega_custo_alerta_cents', 5000, 500, 100000, 'Custo por corrida acima do qual exige motivo e alerta o financeiro (centavos; também acima de 1,5x o previsto da faixa, SEC-145)', 'SEC-145'),
  int('pii_corrida_retencao_dias', 7, 1, 30, 'Dias após a corrida terminar para apagar telefone e endereço do cliente da corrida (LGPD, SEC-144)', 'SEC-144'),
  int('entrega_reentrega_max', 1, 0, 3, 'Reentregas sem custo ao cliente depois de entrega frustrada', 'HIP-L07'),
  int('retirada_distancia_max_km', 10, 1, 30, 'Distância máxima para retirada (km)', 'HIP-013'),
  int('retirada_prazo_horas', 48, 12, 168, 'Prazo para retirar o pedido (h)', 'HIP-038'),
  int('auto_conclusao_entrega_h', 24, 6, 72, 'Conclusão automática da entrega sem reclamação (h)', 'HIP-038'),
  int('repasse_carencia_dias', 7, 0, 30, 'Carência do repasse após a entrega (dias)', 'HIP-015'),
  int('troca_arrependimento_dias', 7, 7, 7, 'Prazo de arrependimento (piso legal CDC art. 49, fixo)', 'DEC-011', true),
  int('troca_defeito_dias', 30, 30, 30, 'Prazo para troca por defeito (piso legal, fixo)', 'DEC-011', true),
  int('troca_defeito_duravel_dias', 90, 90, 90, 'Prazo para defeito em produto durável (piso legal, fixo)', 'DEC-037', true),
  int('troca_voluntaria_dias_padrao', 7, 0, 30, 'Prazo padrão de troca por tamanho/cor (dias; 0 = não aceita)', 'HIP-017'),
  int('troca_voluntaria_dias_min', 3, 1, 30, 'Prazo mínimo que a loja pode definir para troca por tamanho/cor (dias)', 'DEC-037'),
  int('troca_voluntaria_dias_max', 30, 3, 90, 'Prazo máximo que a loja pode definir para troca por tamanho/cor (dias)', 'DEC-037'),
  int('troca_voluntaria_max_por_pedido', 1, 1, 3, 'Trocas voluntárias (tamanho/cor) por pedido; arrependimento e defeito não contam', 'HIP-T02'),
  int('troca_taxa_pagamento_h', 24, 1, 72, 'Prazo para o cliente pagar a taxa da coleta depois da aprovação (h); sem pagamento a troca é cancelada', 'HIP-T05'),
  int('taxa_coleta_max_cents', 3000, 0, 10000, 'Teto da taxa de coleta da troca voluntária (centavos)', 'HIP-018'),
  int('troca_taxa_alerta_pct', 25, 5, 100, 'Taxa de troca (trocas / pedidos entregues, %) por loja acima da qual o relatório destaca e alerta (WB-248)', 'WB-248'),
  int('troca_resposta_h', 24, 4, 120, 'SLA da loja para responder à troca (h); sem resposta a troca é aprovada automaticamente (DEC-037)', 'HIP-T03'),
  int('coleta_agendamento_dias_uteis', 3, 1, 10, 'Agendamento da coleta (dias úteis)', 'HIP-019'),
  int('coleta_entrega_item_dias', 7, 1, 10, 'Prazo do cliente para entregar o item (dias)', 'HIP-019'),
  int('reembolso_dias_uteis', 3, 1, 10, 'Reembolso após recebimento (dias úteis)', 'HIP-019'),
  int('mediacao_dias_uteis', 5, 1, 15, 'Prazo da mediação (dias úteis)', 'HIP-020'),
  int('contestacao_dias', 7, 1, 15, 'Prazo de contestação (dias)', 'HIP-020'),
  int('avaliacao_janela_dias', 30, 7, 90, 'Janela para avaliar após a entrega (dias)', 'HIP-021'),
  int('avaliacao_min_exibicao', 3, 1, 10, 'Mínimo de avaliações para exibir a média', 'HIP-021'),
  int('otp_validade_min', 10, 5, 30, 'Validade do código por e-mail (min)', 'HIP-022'),
  int('otp_tentativas', 5, 3, 10, 'Tentativas por código', 'HIP-022'),
  int('otp_reenvio_s', 60, 30, 120, 'Intervalo mínimo entre reenvios de código (s)', 'HIP-022'),
  int('login_falhas', 5, 3, 10, 'Falhas de login por conta+IP antes da espera', 'HIP-023'),
  int('login_espera_min', 15, 5, 60, 'Espera após as falhas, só para aquele IP (min). A conta nunca é bloqueada', 'HIP-023'),
  int('senha_min', 8, 8, 64, 'Tamanho mínimo da senha', 'HIP-023'),
  int('login_stepup_falhas_h', 20, 10, 100, 'Falhas na conta em 1 h que exigem código por e-mail no login', 'HIP-023'),
  int('email_nao_confirmado_pedidos_max', 1, 0, 3, 'Pedidos pagos permitidos com e-mail não confirmado', 'DEC-014'),
  int('pedidos_pendentes_max', 2, 1, 5, 'Pedidos aguardando pagamento ao mesmo tempo por conta', 'SEC-064'),
  int('pix_hora_max', 5, 2, 30, 'PIX gerados por conta na última hora', 'SEC-064'),
  int('loja_nova_dias', 30, 7, 90, 'Duração do limite de exposição da loja nova (dias)', 'DEC-016'),
  int('loja_nova_pedidos', 20, 5, 100, 'Pedidos entregues que encerram o limite da loja nova', 'DEC-016'),
  int('loja_nova_pedido_max_cents', 50000, 10000, undefined, 'Valor máximo por pedido de loja nova (centavos)', 'DEC-016'),
  int('reauth_min', 5, 1, 15, 'Validade da reautenticação (min)', 'SEC-016'),
  int('admin_inatividade_min', 30, 5, 120, 'Expiração da sessão admin por inatividade (min)', 'WB-100'),
  int('exclusao_anonimizacao_dias', 15, 0, 30, 'Prazo para anonimizar conta excluída (dias)', 'HIP-024'),
  int('retencao_fiscal_anos', 5, 5, 20, 'Retenção de dados fiscais e financeiros (anos)', 'HIP-024'),
  int('exclusao_arrependimento_horas', 72, 0, 168, 'Período de arrependimento da exclusão de conta (horas); padrão 72 h (SEC-154: com 0 a exclusão é imediata e sem volta). Limitado por exclusao_anonimizacao_dias', 'SEC-154'),
  int('retencao_log_acesso_meses', 6, 6, 24, 'Retenção do registro de acesso (meses); piso do Marco Civil, art. 15', 'SEC-075'),
  int('retencao_foto_troca_dias', 180, 30, 365, 'Retenção das fotos de troca após a conclusão (dias)', 'WB-215'),
  int('retencao_loja_reprovada_dias', 90, 30, 365, 'Retenção dos documentos de loja reprovada (dias)', 'HIP-035'),
  int('exportacao_link_min', 5, 1, 30, 'Validade do link de download da exportação (minutos); uso único', 'WB-212'),
  int('exportacao_validade_dias', 7, 1, 30, 'Validade do link de exportação de dados (dias)', 'HIP-025'),
  int('push_mkt_max_semana', 2, 0, 7, 'Máximo de push de marketing por semana', 'HIP-027'),
  int('push_mkt_min_segmento', 20, 5, 1000, 'Mínimo de destinatários de uma campanha de push (proteção contra reidentificação) [HIPÓTESE]', 'WB-197'),
  { key: 'push_mkt_janela', type: 'window', default: '09:00-20:00', description: 'Janela permitida para push de marketing', ref: 'HIP-027' },
  int('aprovacao_loja_sla_dias_uteis', 2, 1, 10, 'SLA de aprovação de loja (dias úteis)', 'HIP-030'),
  int('estoque_baixo_un', 3, 0, 100, 'Alerta de estoque baixo, padrão da loja (unidades)', 'HIP-033'),
  int('foto_max_produto', 8, 1, 20, 'Fotos por produto', 'HIP-034'),
  int('upload_max_mb', 5, 1, 20, 'Tamanho máximo de upload (MB)', 'HIP-034'),
  int('variacoes_max', 100, 1, 200, 'Variações por produto', 'HIP-034'),
  int('import_max_linhas', 500, 1, 500, 'Linhas por importação (teto de segurança SEC-052)', 'HIP-034'),
  int('cupom_total_minimo_cents', 100, 0, 1000, 'Total mínimo cobrado com cupom (centavos)', 'HIP-037'),
  int('estorno_super_admin_cents', 50000, 1000, undefined, 'Acima disto o estorno manual exige super admin (centavos)', 'HIP-039'),
  int('estorno_financeiro_dia_cents', 200000, 1000, undefined, 'Total que um operador do financeiro estorna por dia, em todos os pedidos; acima disto só o super admin (centavos)', 'SEC-142'),
  int('estorno_cobertura_teto_cents', 30000, 0, 100000, 'Teto por pedido que a Webag cobre quando o provedor não conclui o estorno (centavos)', 'DEC-020a'),
  int('codigo_retirada_digitos', 4, 4, 6, 'Dígitos do código de retirada', 'HIP-040'),
  int('carrinho_validade_dias', 7, 1, 30, 'Validade do carrinho (dias)', 'HIP-041'),
  int('item_qtd_max', 50, 1, 200, 'Quantidade máxima por item', 'HIP-041'),
  int('endereco_pino_max_m', 2000, 0, 20000, 'Endereço: distância máxima entre o ponto enviado pelo app e o centro do CEP (m); acima disso o endereço é recusado e a cidade do CEP precisa bater com a informada; 0 desliga a conferência (SEC-169)', 'SEC-169'),
  int('enderecos_max', 8, 1, 20, 'Endereços salvos por cliente', 'HIP-041'),
  int('cancelamento_loja_alerta_pct', 10, 1, 50, 'Taxa de cancelamento da loja que gera alerta (%, 30 dias)', 'HIP-008'),
  int('denuncia_prazo_dias_uteis', 2, 1, 10, 'Prazo para tratar uma denúncia (dias úteis); depois vira Atrasado', 'WB-124'),
];

export const PARAMETER_BY_KEY: ReadonlyMap<string, ParameterDefinition> = new Map(
  PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition]),
);

/** Valida o valor contra a definição. Devolve mensagem de erro (pt-BR) ou null. */
export function validateParameterValue(definition: ParameterDefinition, value: unknown): string | null {
  switch (definition.type) {
    case 'int':
    case 'decimal': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Informe um número.';
      if (definition.type === 'int' && !Number.isInteger(value)) return 'Informe um número inteiro.';
      if (definition.type === 'decimal' && Math.round(value * 100) !== value * 100)
        return 'Use no máximo 2 casas decimais.';
      if (definition.min !== undefined && value < definition.min) return `O valor mínimo é ${definition.min}.`;
      if (definition.max !== undefined && value > definition.max) return `O valor máximo é ${definition.max}.`;
      return null;
    }
    case 'enum':
      return typeof value === 'string' && definition.values.includes(value)
        ? null
        : `Use um destes valores: ${definition.values.join(', ')}.`;
    case 'window': {
      const match = typeof value === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.exec(value) : null;
      if (!match) return 'Use o formato HH:MM-HH:MM.';
      return `${match[1]}${match[2]}` < `${match[3]}${match[4]}` ? null : 'O início deve ser antes do fim.';
    }
  }
}

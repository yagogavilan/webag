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

export const PARAMETER_DEFINITIONS: readonly ParameterDefinition[] = [
  { key: 'comissao_padrao_pct', type: 'decimal', default: 10, min: 0, max: 30, description: 'Comissão padrão sobre o subtotal de produtos (%)', ref: 'HIP-001' },
  { key: 'taxa_servico_tipo', type: 'enum', default: 'nenhuma', values: ['nenhuma', 'fixa', 'percentual'], description: 'Tipo da taxa de serviço ao cliente', ref: 'HIP-003' },
  int('taxa_servico_valor', 0, 0, 5000, 'Taxa de serviço: centavos (fixa) ou pontos-base de % (percentual, até 50,00%)', 'HIP-003'),
  int('pix_expiracao_min', 15, 5, 60, 'Validade do PIX (min)', 'HIP-006'),
  int('loja_aceite_timeout_min', 10, 3, 30, 'Tempo da loja para aceitar o pedido (min)', 'HIP-008'),
  int('loja_aceite_lembrete_min', 5, 3, 30, 'Lembrete de aceite à loja (min)', 'HIP-008'),
  int('parcelas_max', 3, 1, 12, 'Máximo de parcelas no cartão', 'HIP-011'),
  int('parcela_min_cents', 3000, 1000, undefined, 'Valor mínimo da parcela (centavos)', 'HIP-011'),
  int('pedido_max_cents', 200000, 10000, undefined, 'Valor máximo por pedido (centavos)', 'HIP-012'),
  int('raio_max_km', 15, 1, 50, 'Raio máximo de entrega por loja (km)', 'HIP-013'),
  int('raio_padrao_km', 5, 1, 50, 'Raio padrão ao criar a loja (km)', 'HIP-013'),
  int('retirada_distancia_max_km', 10, 1, 30, 'Distância máxima para retirada (km)', 'HIP-013'),
  int('retirada_prazo_horas', 48, 12, 168, 'Prazo para retirar o pedido (h)', 'HIP-038'),
  int('auto_conclusao_entrega_h', 24, 6, 72, 'Conclusão automática da entrega sem reclamação (h)', 'HIP-038'),
  { key: 'repasse_periodicidade', type: 'enum', default: 'semanal', values: ['semanal', 'quinzenal'], description: 'Periodicidade do repasse', ref: 'HIP-015' },
  int('repasse_carencia_dias', 7, 0, 30, 'Carência do repasse após a entrega (dias)', 'HIP-015'),
  int('troca_arrependimento_dias', 7, 7, 7, 'Prazo de arrependimento (piso legal CDC art. 49, fixo)', 'DEC-011', true),
  int('troca_defeito_dias', 30, 30, 30, 'Prazo para troca por defeito (piso legal, fixo)', 'DEC-011', true),
  int('troca_voluntaria_dias_padrao', 7, 0, 30, 'Prazo padrão de troca por tamanho/cor (dias; 0 = não aceita)', 'HIP-017'),
  int('taxa_coleta_max_cents', 3000, 0, 10000, 'Teto da taxa de coleta da troca voluntária (centavos)', 'HIP-018'),
  int('troca_resposta_h', 48, 12, 120, 'Prazo da loja para responder à troca (h)', 'HIP-019'),
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
  int('loja_nova_dias', 30, 7, 90, 'Duração do limite de exposição da loja nova (dias)', 'DEC-016'),
  int('loja_nova_pedidos', 20, 5, 100, 'Pedidos entregues que encerram o limite da loja nova', 'DEC-016'),
  int('loja_nova_pedido_max_cents', 50000, 10000, undefined, 'Valor máximo por pedido de loja nova (centavos)', 'DEC-016'),
  int('reauth_min', 5, 1, 15, 'Validade da reautenticação (min)', 'SEC-016'),
  int('admin_inatividade_min', 30, 5, 120, 'Expiração da sessão admin por inatividade (min)', 'WB-100'),
  int('exclusao_anonimizacao_dias', 15, 0, 30, 'Prazo para anonimizar conta excluída (dias)', 'HIP-024'),
  int('retencao_fiscal_anos', 5, 5, 20, 'Retenção de dados fiscais e financeiros (anos)', 'HIP-024'),
  int('exportacao_validade_dias', 7, 1, 30, 'Validade do link de exportação de dados (dias)', 'HIP-025'),
  int('push_mkt_max_semana', 2, 0, 7, 'Máximo de push de marketing por semana', 'HIP-027'),
  { key: 'push_mkt_janela', type: 'window', default: '09:00-20:00', description: 'Janela permitida para push de marketing', ref: 'HIP-027' },
  int('aprovacao_loja_sla_dias_uteis', 2, 1, 10, 'SLA de aprovação de loja (dias úteis)', 'HIP-030'),
  int('estoque_baixo_un', 3, 0, 100, 'Alerta de estoque baixo, padrão da loja (unidades)', 'HIP-033'),
  int('foto_max_produto', 8, 1, 20, 'Fotos por produto', 'HIP-034'),
  int('upload_max_mb', 5, 1, 20, 'Tamanho máximo de upload (MB)', 'HIP-034'),
  int('variacoes_max', 100, 1, 200, 'Variações por produto', 'HIP-034'),
  int('import_max_linhas', 500, 1, 500, 'Linhas por importação (teto de segurança SEC-052)', 'HIP-034'),
  int('dados_cliente_visivel_dias', 30, 0, 90, 'Dias em que o lojista vê dados do cliente após a conclusão', 'HIP-036'),
  int('cupom_total_minimo_cents', 100, 0, 1000, 'Total mínimo cobrado com cupom (centavos)', 'HIP-037'),
  int('estorno_super_admin_cents', 50000, 1000, undefined, 'Acima disto o estorno manual exige super admin (centavos)', 'HIP-039'),
  int('codigo_retirada_digitos', 4, 4, 6, 'Dígitos do código de retirada', 'HIP-040'),
  int('carrinho_validade_dias', 7, 1, 30, 'Validade do carrinho (dias)', 'HIP-041'),
  int('item_qtd_max', 50, 1, 200, 'Quantidade máxima por item', 'HIP-041'),
  int('enderecos_max', 8, 1, 20, 'Endereços salvos por cliente', 'HIP-041'),
  int('cancelamento_loja_alerta_pct', 10, 1, 50, 'Taxa de cancelamento da loja que gera alerta (%, 30 dias)', 'HIP-008'),
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

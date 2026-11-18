/** Feature flags conhecidas (WB-120, HIP-042). Valor inicial no seed; o admin liga e desliga sem deploy. */
export interface FlagDefinition {
  key: string;
  default: boolean;
  description: string;
}

export const FEATURE_FLAG_DEFINITIONS: readonly FlagDefinition[] = [
  { key: 'cartao', default: true, description: 'Pagamento com cartão de crédito' },
  { key: 'pix', default: true, description: 'Pagamento com PIX' },
  { key: 'retirada', default: true, description: 'Retirada na loja' },
  { key: 'login_social', default: false, description: 'Login com Google e Apple' },
  { key: 'taxa_servico', default: false, description: 'Taxa de serviço ao cliente' },
  { key: 'cadastro_lojista', default: true, description: 'Cadastro aberto de lojistas' },
  { key: 'trocas_voluntarias', default: true, description: 'Trocas voluntárias (tamanho/cor)' },
  { key: 'push_marketing', default: true, description: 'Push de marketing (com opt-in)' },
  { key: 'confirmacao_email_bloqueia_compra', default: false, description: 'Exige e-mail confirmado já na 1ª compra (variante B do HIP-D07; DEC-014 permite 1 pedido antes)' },
  { key: 'codigo_entrega', default: false, description: 'Código de entrega de 4 dígitos (SEC-067)' },
];

export const FLAG_KEYS: ReadonlySet<string> = new Set(FEATURE_FLAG_DEFINITIONS.map((flag) => flag.key));

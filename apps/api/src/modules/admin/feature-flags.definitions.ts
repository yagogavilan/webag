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
  { key: 'codigo_entrega', default: true, description: 'Código de entrega de 4 dígitos (SEC-067)' },
  /** v1.1 R1 (J27, C-GEN-01): nasce DESLIGADA. Desligada, o admin só altera dados da loja com o motivo "solicitado pelo lojista". Liga só depois do parecer do jurídico e da cláusula nos Termos do Lojista. */
  { key: 'admin_edita_catalogo_sem_pedido', default: false, description: 'Admin altera dados da loja sem pedido do lojista (J27: depende da cláusula nos Termos do Lojista)' },
  /** v1.1 R1 (WB-373, F9): consulta de EAN em base EXTERNA. Nasce DESLIGADA e nenhum adaptador externo existe até o F9 (licença ODbL/Cosmos). */
  { key: 'ean_base_externa', default: false, description: 'Consulta de código de barras em base externa (F9: termos e licença ainda não verificados)' },
  /** v1.1 R1 (WB-378, F8, J25): IA de visão por provedor real. Nasce DESLIGADA; só o adaptador `fake` existe até a autorização do fundador. */
  { key: 'ia_visao_real', default: false, description: 'Sugestão de produto pela foto com provedor real de IA (F8/J25: exige autorização do fundador)' },
];

export const FLAG_KEYS: ReadonlySet<string> = new Set(FEATURE_FLAG_DEFINITIONS.map((flag) => flag.key));

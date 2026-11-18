import type { Parameter } from '@/lib/api/admin';
import { formatCents } from '@/lib/format';

/** Agrupamento e unidade dos parâmetros (onda-1b §AD3). Os valores e faixas vêm da API; isto só organiza a tela. */
export const GROUPS = [
  { id: 'pedido', label: 'Pedido e pagamento' },
  { id: 'entrega', label: 'Entrega e retirada' },
  { id: 'trocas', label: 'Trocas' },
  { id: 'avaliacoes', label: 'Avaliações' },
  { id: 'acesso', label: 'Código e acesso' },
  { id: 'loja-nova', label: 'Loja nova e risco' },
  { id: 'privacidade', label: 'Privacidade e retenção' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'repasses', label: 'Repasses' },
  { id: 'outros', label: 'Outros' },
] as const;
export type GroupId = (typeof GROUPS)[number]['id'];

const RULES: [RegExp, GroupId][] = [
  [/^(comissao|taxa_servico|pix_|loja_aceite|parcela|pedido_max|cupom_|carrinho_|item_qtd|estorno_|cancelamento_loja)/, 'pedido'],
  [/^(raio_|retirada_|auto_conclusao|codigo_retirada|enderecos_)/, 'entrega'],
  [/^(troca_|taxa_coleta|coleta_|reembolso_|mediacao_|contestacao_)/, 'trocas'],
  [/^avaliacao_/, 'avaliacoes'],
  [/^(otp_|login_|senha_|reauth_|admin_inatividade)/, 'acesso'],
  [/^(loja_nova|email_nao_confirmado|aprovacao_loja|estoque_baixo|foto_max|upload_max|variacoes_max|import_max|dados_cliente)/, 'loja-nova'],
  [/^(exclusao_|retencao_|exportacao_)/, 'privacidade'],
  [/^push_mkt/, 'marketing'],
  [/^repasse_/, 'repasses'],
];

export function groupOf(key: string): GroupId {
  return RULES.find(([re]) => re.test(key))?.[1] ?? 'outros';
}

/** Comissão e taxa de serviço têm uma única porta de entrada: Financeiro > Comissões (WB-111). */
export const FINANCE_OWNED = new Set(['comissao_padrao_pct', 'taxa_servico_tipo', 'taxa_servico_valor']);

type Unit = { kind: 'none' } | { kind: 'money' } | { kind: 'text'; text: string };

const UNIT_OVERRIDES: Record<string, Unit> = {
  login_stepup_falhas_h: { kind: 'text', text: 'falhas' },
  login_falhas: { kind: 'text', text: 'falhas' },
  taxa_servico_valor: { kind: 'none' },
  push_mkt_max_semana: { kind: 'text', text: 'por semana' },
  email_nao_confirmado_pedidos_max: { kind: 'text', text: 'pedido(s)' },
  loja_nova_pedidos: { kind: 'text', text: 'pedidos' },
  parcelas_max: { kind: 'text', text: 'parcelas' },
  codigo_retirada_digitos: { kind: 'text', text: 'dígitos' },
  avaliacao_min_exibicao: { kind: 'text', text: 'avaliações' },
  otp_tentativas: { kind: 'text', text: 'tentativas' },
  foto_max_produto: { kind: 'text', text: 'fotos' },
  variacoes_max: { kind: 'text', text: 'variações' },
  import_max_linhas: { kind: 'text', text: 'linhas' },
  item_qtd_max: { kind: 'text', text: 'unidades' },
  enderecos_max: { kind: 'text', text: 'endereços' },
};

export function unitOf(key: string): Unit {
  const override = UNIT_OVERRIDES[key];
  if (override) return override;
  if (key.endsWith('_cents')) return { kind: 'money' };
  if (key.endsWith('_pct')) return { kind: 'text', text: '%' };
  if (key.endsWith('_dias_uteis')) return { kind: 'text', text: 'dias úteis' };
  if (key.endsWith('_dias')) return { kind: 'text', text: 'dias' };
  if (key.endsWith('_min')) return { kind: 'text', text: 'min' };
  if (key.endsWith('_horas') || key.endsWith('_h')) return { kind: 'text', text: 'h' };
  if (key.endsWith('_s')) return { kind: 'text', text: 's' };
  if (key.endsWith('_km')) return { kind: 'text', text: 'km' };
  if (key.endsWith('_mb')) return { kind: 'text', text: 'MB' };
  if (key.endsWith('_un')) return { kind: 'text', text: 'un' };
  if (key.endsWith('_anos')) return { kind: 'text', text: 'anos' };
  return { kind: 'none' };
}

const num = (value: number) => String(value).replace('.', ',');

/** Valor legível com unidade: centavos viram reais ("R$ 2.000,00"), minutos viram "15 min". */
export function formatParamValue(key: string, value: string | number): string {
  if (typeof value === 'string') return value;
  const unit = unitOf(key);
  if (unit.kind === 'money') return formatCents(value);
  if (unit.kind === 'text') return unit.text === '%' ? `${num(value)}%` : `${num(value)} ${unit.text}`;
  return num(value);
}

/** Faixa em texto: "de 5 a 60" (centavos em reais). */
export function rangeText(p: Parameter): string | null {
  if (p.type === 'enum') return p.values ? `opções: ${p.values.join(', ')}` : null;
  if (p.type === 'window') return 'formato HH:MM-HH:MM';
  const fmt = (v: number) => formatParamValue(p.key, v);
  if (p.min !== null && p.max !== null) return `de ${fmt(p.min)} a ${fmt(p.max)}`;
  if (p.min !== null) return `mínimo ${fmt(p.min)}`;
  if (p.max !== null) return `máximo ${fmt(p.max)}`;
  return null;
}

export function isChanged(p: Parameter): boolean {
  return p.value !== p.default;
}

/** Texto do campo → valor para a API. Dinheiro é digitado em reais e vai em centavos. */
export function parseInput(p: Parameter, text: string): { value: string | number } | { error: string } {
  const raw = text.trim();
  if (raw === '') return { error: 'Digite um valor.' };
  if (p.type === 'enum' || p.type === 'window') return { value: raw };
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { error: 'Digite um número.' };
  const money = unitOf(p.key).kind === 'money';
  const value = money ? Math.round(n * 100) : n;
  if (p.type === 'int' && !Number.isInteger(value)) return { error: 'Use um número inteiro.' };
  if (p.type === 'decimal' && Math.round(value * 100) !== value * 100) return { error: 'Use no máximo 2 casas decimais.' };
  const fmt = (v: number) => (money ? formatCents(v) : num(v));
  if (p.min !== null && p.max !== null && (value < p.min || value > p.max)) return { error: `O valor vai de ${fmt(p.min)} a ${fmt(p.max)}.` };
  if (p.min !== null && value < p.min) return { error: `O valor mínimo é ${fmt(p.min)}.` };
  if (p.max !== null && value > p.max) return { error: `O valor máximo é ${fmt(p.max)}.` };
  return { value };
}

/** Valor atual no formato do campo de edição. */
export function toInput(p: Parameter): string {
  if (typeof p.value === 'string') return p.value;
  return unitOf(p.key).kind === 'money' ? (p.value / 100).toFixed(2).replace('.', ',') : num(p.value);
}

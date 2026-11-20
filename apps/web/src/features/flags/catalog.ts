import type { FeatureFlag } from '@/lib/api/admin';

interface FlagCopy {
  /** Nome curto usado nos títulos e no rótulo do Switch ("Pagamento com cartão"). */
  name: string;
  /** Nome no botão do Dialog: "Desligar cartão". */
  short: string;
  /** O que acontece ao desligar (1 frase, onda-1b §AD4). */
  effect: string;
}

/** Textos da onda-1b §AD4. Chave desconhecida cai no texto da API (nova flag nunca some da tela). */
export const FLAG_COPY: Record<string, FlagCopy> = {
  cartao: { name: 'Pagamento com cartão', short: 'cartão', effect: 'O cartão some do pagamento na próxima abertura do app.' },
  pix: { name: 'Pagamento com PIX', short: 'PIX', effect: 'O PIX some do pagamento na próxima abertura do app.' },
  retirada: { name: 'Retirada na loja', short: 'retirada', effect: 'A opção Retirada some do app e do cadastro das lojas.' },
  login_social: { name: 'Login com Google e Apple', short: 'login social', effect: 'Os botões somem do cadastro e do login.' },
  taxa_servico: { name: 'Taxa de serviço', short: 'taxa de serviço', effect: 'O cliente deixa de ver a linha de taxa no pagamento.' },
  cadastro_lojista: { name: 'Cadastro de lojista', short: 'cadastro de lojista', effect: 'Quem abrir o cadastro vê a lista de espera.' },
  trocas_voluntarias: { name: 'Trocas voluntárias (tamanho e cor)', short: 'trocas voluntárias', effect: 'Lojas deixam de aceitar novas trocas por tamanho ou cor. Trocas abertas terminam normalmente.' },
  push_marketing: { name: 'Push de marketing', short: 'push de marketing', effect: 'Nenhum push de marketing é enviado.' },
  confirmar_email_antes_compra: { name: 'Confirmar e-mail antes de comprar', short: 'confirmação antes da compra', effect: 'Ligada: o 1º pedido só sai depois do código. Desligada (padrão): confirma depois.' },
  codigo_entrega: { name: 'Código de entrega do cliente', short: 'código de entrega', effect: 'O lojista conclui a entrega sem pedir o código.' },
};

export function copyOf(flag: FeatureFlag): FlagCopy {
  return FLAG_COPY[flag.key] ?? { name: flag.description, short: flag.description.toLowerCase(), effect: 'Veja a descrição da flag.' };
}

const PAYMENT_KEYS = ['pix', 'cartao'] as const;

/** Trava contra erro caro (Z-5): desligar PIX ou cartão com o outro já desligado deixa o app sem meio de pagamento. */
export function leavesNoPayment(flags: FeatureFlag[], key: string): boolean {
  if (!PAYMENT_KEYS.includes(key as (typeof PAYMENT_KEYS)[number])) return false;
  const other = PAYMENT_KEYS.find((k) => k !== key);
  return flags.find((f) => f.key === other)?.enabled === false;
}

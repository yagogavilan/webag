import { formatCents } from '@/lib/format';
import { localToIso } from '@/lib/br/datetime';
import { DESCRIPTION_MAX, MAX_PRICE_CENTS, MAX_STOCK, MIN_PRICE_CENTS, NAME_MAX } from './helpers';

/** Valores do formulário do produto (onda-2 K2). Preço e promoção em centavos; datas no formato do campo `datetime-local`. */
export interface ProductFormValues {
  name: string;
  description: string;
  categoryId: string;
  sectionId: string;
  priceCents: number | null;
  promoOn: boolean;
  promoPriceCents: number | null;
  promoStart: string;
  promoEnd: string;
  mode: 'simple' | 'variants';
  /** Estoque do produto sem variação, em texto (o lojista pode digitar qualquer coisa). */
  stockText: string;
  /** Tabela de medidas em texto livre (a API guarda até 2.000 caracteres). */
  sizeChart: string;
  /** Produto sem troca por tamanho ou cor (sob medida, íntimo, higiene). Desistência e defeito seguem por lei. */
  noVoluntaryExchange: boolean;
}

export type FieldKey = 'name' | 'description' | 'category' | 'photos' | 'price' | 'promoPrice' | 'promoStart' | 'promoEnd' | 'stock' | 'variants';
export type FormErrors = Partial<Record<FieldKey, string>>;
export type Intent = 'draft' | 'publish';

export const EMPTY_VALUES: ProductFormValues = {
  name: '',
  description: '',
  categoryId: '',
  sectionId: '',
  priceCents: null,
  promoOn: false,
  promoPriceCents: null,
  promoStart: '',
  promoEnd: '',
  mode: 'simple',
  stockText: '10',
  sizeChart: '',
  noVoluntaryExchange: false,
};

/** Estoque digitado: só inteiro de 0 a 99.999; `null` se não for. */
export function parseStock(text: string): number | null {
  if (!/^\d{1,5}$/.test(text.trim())) return null;
  const value = Number(text);
  return value <= MAX_STOCK ? value : null;
}

interface Context {
  /** Fotos prontas (enviadas). */
  readyPhotos: number;
  /** Combinações definidas em "Editar variações". */
  variantRows: number;
}

/**
 * Valida o formulário com as mensagens da tela K2. Rascunho exige só o nome (a API cria o produto com o nome) e confere o
 * que foi preenchido; publicar exige tudo (a API também confere: `PRODUCT_INCOMPLETE`).
 */
export function validateProduct(values: ProductFormValues, context: Context, intent: Intent): FormErrors {
  const errors: FormErrors = {};
  const publish = intent === 'publish';
  const name = values.name.trim();
  if (name.length < 2) errors.name = 'Escreva o nome do produto.';
  else if (name.length > NAME_MAX) errors.name = `O nome tem no máximo ${NAME_MAX} caracteres.`;
  if (values.description.length > DESCRIPTION_MAX) errors.description = `A descrição tem no máximo ${DESCRIPTION_MAX.toLocaleString('pt-BR')} caracteres.`;
  if (publish && !values.categoryId) errors.category = 'Escolha a categoria.';
  if (publish && context.readyPhotos < 1) errors.photos = 'Adicione ao menos 1 foto.';

  const price = values.priceCents;
  if (price === null || price === 0) {
    if (publish) errors.price = 'Informe o preço.';
  } else if (price < MIN_PRICE_CENTS) errors.price = 'O preço precisa ser maior que R$ 0,00.';
  else if (price > MAX_PRICE_CENTS) errors.price = 'O preço máximo é R$ 99.999,99.';

  if (values.promoOn) {
    const promo = values.promoPriceCents;
    if (promo === null || promo <= 0) errors.promoPrice = 'Informe o preço da promoção.';
    else if (price !== null && price > 0 && promo >= price) errors.promoPrice = `O preço da promoção precisa ser menor que ${formatCents(price)}.`;
    const start = localToIso(values.promoStart);
    const end = localToIso(values.promoEnd);
    if (!start) errors.promoStart = 'Informe quando a promoção começa.';
    if (!end) errors.promoEnd = 'Informe quando a promoção termina.';
    else if (start && new Date(end).getTime() <= new Date(start).getTime()) errors.promoEnd = 'A promoção precisa terminar depois do início.';
  }

  if (values.mode === 'simple') {
    if (parseStock(values.stockText) === null && (publish || values.stockText.trim() !== '')) errors.stock = 'Use só números inteiros, de 0 a 99.999.';
  } else if (publish && context.variantRows < 1) errors.variants = 'Defina as opções do produto.';
  return errors;
}

/** Textos do resumo no topo: "3 campos precisam de atenção". */
export function summaryText(count: number): string {
  return count === 1 ? '1 campo precisa de atenção' : `${count} campos precisam de atenção`;
}

/** Prévia viva da promoção: "De R$ 99,90 por R$ 79,90 · 20% off". `null` enquanto os valores não fazem sentido. */
export function promoPreview(priceCents: number | null, promoCents: number | null, discount: (original: number, price: number) => number | null): string | null {
  if (!priceCents || !promoCents || promoCents >= priceCents) return null;
  const pct = discount(priceCents, promoCents);
  return `De ${formatCents(priceCents)} por ${formatCents(promoCents)}${pct ? ` · ${pct}% off` : ''}`;
}

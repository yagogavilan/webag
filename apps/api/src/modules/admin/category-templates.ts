import type { CategoryTemplateJson } from './db/schema.js';

/**
 * Os 8 modelos iniciais por categoria (PRD `v1-1-cadastro-rapido.md` RN-Q6, `[HIPÓTESE]`: o designer revisa). O modelo só SUGERE (tamanhos, atributos, avisos); a única
 * exigência que ele carrega é `descriptionRequired` (RN-Q1, DEC-106: Cosméticos e Eletrônicos, 20 caracteres). Nenhum valor vem marcado (evita estoque falso).
 * O seed aplica estes modelos às categorias de 2 níveis do seed (`seed/onda1.ts`) e a categorias criadas pelo admin com o MESMO nome da tabela do PRD.
 */
export interface InitialTemplate {
  /** Nome do modelo no PRD (para o log do seed e o teste). */
  model: string;
  template: CategoryTemplateJson;
  descriptionRequired: boolean;
  /** Categorias que recebem o modelo: `[pai ou null, nome]` (sem acento nem caixa na comparação). */
  match: readonly (readonly [string | null, string])[];
}

const sizes = ['P', 'M', 'G', 'GG'];
const shoeSizes = Array.from({ length: 11 }, (_, i) => String(34 + i));

export const INITIAL_CATEGORY_TEMPLATES: readonly InitialTemplate[] = [
  {
    model: 'Moda e vestuário',
    template: { attributes: [{ name: 'Tamanho', values: sizes }, { name: 'Cor', values: [] }], sizeChartHint: true, noVoluntaryExchangeHint: false },
    descriptionRequired: false,
    match: [[null, 'Moda e vestuário'], [null, 'Moda e calçados'], ['Moda e calçados', 'Roupas'], ['Moda e calçados', 'Acessórios']],
  },
  {
    model: 'Calçados',
    template: { attributes: [{ name: 'Tamanho', values: shoeSizes }, { name: 'Cor', values: [] }], sizeChartHint: true, noVoluntaryExchangeHint: false },
    descriptionRequired: false,
    match: [[null, 'Calçados'], ['Moda e calçados', 'Calçados']],
  },
  {
    model: 'Cosméticos e perfumaria',
    template: { attributes: [{ name: 'Volume', values: ['30 ml', '50 ml', '100 ml', '200 ml'] }, { name: 'Marca', values: [] }], sizeChartHint: false, noVoluntaryExchangeHint: true },
    descriptionRequired: true,
    match: [[null, 'Cosméticos e perfumaria'], ['Farmácia', 'Cuidados pessoais'], ['Farmácia', 'Higiene']],
  },
  {
    model: 'Eletrônicos e acessórios',
    template: { attributes: [{ name: 'Cor', values: [] }, { name: 'Voltagem', values: ['110V', '220V', 'Bivolt'] }, { name: 'Marca', values: [] }], sizeChartHint: false, noVoluntaryExchangeHint: false },
    descriptionRequired: true,
    match: [[null, 'Eletrônicos e acessórios'], [null, 'Eletrônicos'], ['Eletrônicos', 'Celulares'], ['Eletrônicos', 'Informática'], ['Eletrônicos', 'Áudio']],
  },
  {
    model: 'Casa e utilidades',
    template: { attributes: [{ name: 'Medida', values: [] }, { name: 'Cor', values: [] }], sizeChartHint: false, noVoluntaryExchangeHint: false },
    descriptionRequired: false,
    match: [[null, 'Casa e utilidades'], [null, 'Casa e construção'], ['Casa e construção', 'Utilidades']],
  },
  {
    model: 'Papelaria',
    template: { attributes: [{ name: 'Cor', values: [] }, { name: 'Quantidade por pacote', values: [] }], sizeChartHint: false, noVoluntaryExchangeHint: false },
    descriptionRequired: false,
    match: [[null, 'Papelaria'], ['Papelaria', 'Material escolar'], ['Papelaria', 'Escritório']],
  },
  {
    model: 'Pet',
    template: { attributes: [{ name: 'Porte ou peso', values: [] }, { name: 'Sabor', values: [] }], sizeChartHint: false, noVoluntaryExchangeHint: false },
    descriptionRequired: false,
    match: [[null, 'Pet'], ['Pet', 'Ração'], ['Pet', 'Acessórios']],
  },
  {
    model: 'Presentes',
    template: { attributes: [{ name: 'Cor', values: [] }], sizeChartHint: false, noVoluntaryExchangeHint: false },
    descriptionRequired: false,
    match: [[null, 'Presentes']],
  },
];

const fold = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Modelo inicial de uma categoria (por pai e nome), ou `undefined`. Puro: o seed e o teste usam. */
export function initialTemplateFor(parentName: string | null, name: string): InitialTemplate | undefined {
  return INITIAL_CATEGORY_TEMPLATES.find((item) => item.match.some(([parent, own]) => fold(own) === fold(name) && (parent === null ? parentName === null : parentName !== null && fold(parent) === fold(parentName))));
}

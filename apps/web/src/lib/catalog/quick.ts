import type { Product, QuickPublishRequest } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { MAX_PRICE_CENTS, MAX_STOCK, NAME_MAX } from './helpers';

/**
 * Cadastro rápido (WB-370, RN-Q1): regras locais de validação, mapeamento dos erros do servidor para o campo certo e as contas
 * de repetição (`UPLOAD_NOT_READY`, resposta perdida). Funções puras: a tela só liga os pontos.
 */
export interface QuickValues {
  name: string;
  priceCents: number | null;
  /** Texto do campo de quantidade ("1" por padrão). */
  stockText: string;
  categoryId: string;
  description: string;
}

export type QuickField = 'name' | 'price' | 'photo' | 'stock' | 'category' | 'description';
export type QuickErrors = Partial<Record<QuickField, string>>;

/** Ordem visual da tela: o foco vai ao primeiro campo com erro. */
export const QUICK_FIELD_ORDER: readonly QuickField[] = ['photo', 'name', 'price', 'stock', 'category', 'description'];

export const QUICK_MESSAGES = {
  nameEmpty: 'Escreva o nome do produto.',
  nameShort: 'Use ao menos 2 caracteres.',
  nameLong: `Use até ${NAME_MAX} caracteres.`,
  priceEmpty: 'Informe o preço, ex.: 49,90.',
  priceMax: 'O preço máximo é R$ 99.999,99.',
  photo: 'Falta a foto. Tire uma foto do produto.',
  stock: 'Use um número de 0 a 99.999.',
  category: 'Escolha a categoria.',
  forbidden: 'Esse tipo de produto não é permitido no Webag.',
  offlinePublish: 'Sem internet. O que você digitou fica neste aparelho; publique quando voltar.',
  offlineTap: 'Sem internet. Conecte para publicar.',
  offlineNew: 'Sem internet. Conecte para criar o produto.',
  offlineSave: 'Sem internet. Conecte para guardar.',
  lostResponse: 'Não recebemos a confirmação. Toque em Publicar de novo: não vai duplicar.',
  photoSlow: 'A foto está demorando. Tente publicar de novo.',
  generic: 'Não conseguimos publicar agora. Seu produto está guardado. Tente de novo.',
  alreadyPublished: 'Este produto já está publicado.',
} as const;

export function descriptionMessage(min: number): string {
  return `Escreva ao menos ${min} caracteres sobre o produto.`;
}

/** Estoque de 0 a 99.999 (inteiro). Vazio vale o padrão 1 (WB-370 C3); texto inválido devolve `null`. */
export function parseQuickStock(text: string): number | null {
  const clean = text.trim();
  if (clean === '') return 1;
  if (!/^\d{1,5}$/.test(clean)) return null;
  const value = Number(clean);
  return value <= MAX_STOCK ? value : null;
}

export interface QuickContext {
  /** Fotos já enviadas (com `assetId`). */
  photos: number;
  descriptionRequired: boolean;
  descriptionMin: number;
  /** Produto com grade: o estoque vem da soma das combinações e a quantidade simples não vale. */
  gradeRows: number;
}

/** Erros do que o lojista digitou (RN-Q1, RN-17: o botão nunca é desabilitado; o erro aparece no campo). */
export function validateQuick(values: QuickValues, context: QuickContext): QuickErrors {
  const errors: QuickErrors = {};
  const name = values.name.trim();
  if (name === '') errors.name = QUICK_MESSAGES.nameEmpty;
  else if (name.length < 2) errors.name = QUICK_MESSAGES.nameShort;
  else if (name.length > NAME_MAX) errors.name = QUICK_MESSAGES.nameLong;
  if (values.priceCents === null || values.priceCents <= 0) errors.price = QUICK_MESSAGES.priceEmpty;
  else if (values.priceCents > MAX_PRICE_CENTS) errors.price = QUICK_MESSAGES.priceMax;
  if (context.photos < 1) errors.photo = QUICK_MESSAGES.photo;
  if (context.gradeRows === 0 && parseQuickStock(values.stockText) === null) errors.stock = QUICK_MESSAGES.stock;
  if (values.categoryId === '') errors.category = QUICK_MESSAGES.category;
  if (context.descriptionRequired && values.description.trim().length < context.descriptionMin) errors.description = descriptionMessage(context.descriptionMin);
  return errors;
}

export function firstErrorField(errors: QuickErrors): QuickField | null {
  return QUICK_FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null;
}

export function toQuickBody(values: QuickValues, imageIds: string[]): QuickPublishRequest {
  const description = values.description.trim();
  return {
    name: values.name.trim(),
    basePriceCents: values.priceCents ?? 0,
    categoryId: values.categoryId === '' ? null : values.categoryId,
    ...(description === '' ? {} : { description }),
    stock: parseQuickStock(values.stockText) ?? 1,
    imageIds,
  };
}

/** Chave de idempotência: aleatória, só `[A-Za-z0-9_-]`, 8 a 80 caracteres (o BFF recusa o resto). */
export function newIntentKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20)}-${random}`.slice(0, 80);
}

/**
 * A chave vale por INTENÇÃO: repetir o mesmo corpo (3G, duplo toque, `UPLOAD_NOT_READY`) reaproveita a chave; se o lojista mudou
 * algo depois de um erro, é outra intenção e a chave muda (mesma chave com corpo diferente é 422 `IDEMPOTENCY_KEY_REUSED`).
 */
export function fingerprint(body: QuickPublishRequest): string {
  return JSON.stringify([body.name, body.basePriceCents, body.categoryId ?? null, body.description ?? null, body.stock ?? 1, body.imageIds]);
}

export interface Intent {
  key: string;
  fingerprint: string;
}

export function intentFor(current: Intent | null, body: QuickPublishRequest, prefix: string): Intent {
  const print = fingerprint(body);
  return current && current.fingerprint === print ? current : { key: newIntentKey(prefix), fingerprint: print };
}

/** `UPLOAD_NOT_READY` (C6): espera de 1 s a 3 s entre as tentativas e desiste depois de 30 s (o app não mostra erro antes disso). */
export const UPLOAD_WAIT_MAX_MS = 30_000;
export function uploadRetryDelay(attempt: number): number {
  return Math.min(1000 + attempt * 500, 3000);
}

export const isUploadNotReady = (error: unknown): boolean => error instanceof ApiError && error.status === 422 && error.code === 'UPLOAD_NOT_READY';
export const isNetworkError = (error: unknown): boolean => error instanceof ApiError && error.isNetwork;
/** 409 nesta rota (versão subiu ou produto já ativo): a resposta pode ter se perdido; o app reconsulta o produto (C15). */
export const isPublishConflict = (error: unknown): boolean => error instanceof ApiError && error.status === 409 && (error.code === 'PRODUCT_VERSION_CONFLICT' || error.code === 'QUICK_PUBLISH_NOT_APPLICABLE');
/** 422 `QUICK_PUBLISH_NOT_APPLICABLE`: rascunho com grade; segue pelo caminho da grade, sem mostrar erro (C16). */
export const isGradeRoute = (error: unknown): boolean => error instanceof ApiError && error.status === 422 && error.code === 'QUICK_PUBLISH_NOT_APPLICABLE';

/** C15: o produto está ATIVO com os mesmos dados que o lojista digitou? Então o "Publicar" anterior deu certo. */
export function isPublishedAsTyped(product: Product, values: QuickValues): boolean {
  if (product.status !== 'active') return false;
  if (product.name.trim() !== values.name.trim()) return false;
  if (product.basePriceCents !== values.priceCents) return false;
  if (values.categoryId !== '' && product.categoryId !== values.categoryId) return false;
  return true;
}

/** Campo e texto do erro devolvido pelo servidor (C17: o erro vem no campo certo e o produto continua rascunho). */
export function fieldErrorFrom(error: unknown, descriptionMin = 20): { field: QuickField; message: string } | null {
  if (!(error instanceof ApiError)) return null;
  switch (error.code) {
    case 'CATEGORY_FORBIDDEN':
      return { field: 'category', message: QUICK_MESSAGES.forbidden };
    case 'CATEGORY_INACTIVE':
      return { field: 'category', message: 'Essa categoria não está mais disponível. Escolha outra.' };
    case 'PRICE_OUT_OF_RANGE':
      return { field: 'price', message: QUICK_MESSAGES.priceMax };
    case 'DESCRIPTION_REQUIRED':
      return { field: 'description', message: descriptionMessage(descriptionMin) };
    case 'PRODUCT_INCOMPLETE': {
      const text = error.fields.map((f) => f.field).join(' ');
      if (/imageIds|photo|image/i.test(text)) return { field: 'photo', message: QUICK_MESSAGES.photo };
      if (/name/i.test(text)) return { field: 'name', message: QUICK_MESSAGES.nameEmpty };
      if (/price|basePriceCents/i.test(text)) return { field: 'price', message: QUICK_MESSAGES.priceEmpty };
      if (/category/i.test(text)) return { field: 'category', message: QUICK_MESSAGES.category };
      if (/description/i.test(text)) return { field: 'description', message: descriptionMessage(descriptionMin) };
      return null;
    }
    default:
      return null;
  }
}

/** "Salvo há 2 h" / "Salvo agora" (cartão "Continuar"). */
export function savedAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'salvo agora';
  if (minutes < 60) return `salvo há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `salvo há ${hours} h`;
  const days = Math.round(hours / 24);
  return `salvo há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}

const MISSING_TEXT: Record<string, string> = {
  name: 'Falta o nome',
  price: 'Falta o preço',
  photo: 'Falta a foto',
  category: 'Falta a categoria',
  stock: 'Falta o estoque',
  description: 'Falta a descrição',
};

/** "Falta a foto" / "Falta o preço e a foto" (aba Rascunhos). */
export function missingText(missing: readonly string[]): string {
  const parts = missing.map((m) => MISSING_TEXT[m]).filter((t): t is string => Boolean(t));
  if (parts.length === 0) return 'Pronto para publicar';
  if (parts.length === 1) return parts[0] ?? '';
  const [first, ...rest] = parts;
  return `${first} e ${rest.map((p) => p.replace(/^Falta (o|a) /, '$1 ')).join(', ')}`;
}

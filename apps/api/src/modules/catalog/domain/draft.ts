/**
 * Rascunho (RN-Q2, ADR-018 D1): o que falta para publicar e quando vence. Funções puras, sem banco, testadas por tabela em `draft.spec.ts`.
 */
export type MissingField = 'name' | 'price' | 'photo' | 'category' | 'stock' | 'description';

/** Mesma ordem do contrato (`ProductMissingField`): é a ordem em que a tela mostra o que falta. */
export interface DraftFacts {
  name: string;
  basePriceCents: number | null;
  categoryId: string | null;
  description: string | null;
  photoCount: number;
  activeVariantCount: number;
  /** Regra da categoria (RN-Q1, DEC-106); nulo = a descrição é opcional. */
  descriptionRule: { minChars: number } | null;
}

export function missingFields(facts: DraftFacts): MissingField[] {
  const missing: MissingField[] = [];
  if (facts.name.trim().length < 2) missing.push('name');
  if (facts.basePriceCents === null) missing.push('price');
  if (facts.photoCount < 1) missing.push('photo');
  if (!facts.categoryId) missing.push('category');
  if (facts.activeVariantCount < 1) missing.push('stock');
  if (facts.descriptionRule && (facts.description ?? '').trim().length < facts.descriptionRule.minChars) missing.push('description');
  return missing;
}

const DAY_MS = 86_400_000;

/** Vence `validityDays` depois da última alteração (RN-Q2). */
export const draftExpiresAt = (updatedAt: Date, validityDays: number): Date => new Date(updatedAt.getTime() + validityDays * DAY_MS);

/** Dias até vencer, arredondado PARA CIMA e nunca negativo: rascunho recém-criado diz 30 e o parado há 27 dias e 1 minuto diz 3 (3 ou menos mostra "Será apagado em N dias"). */
export const draftExpiresInDays = (expiresAt: Date, now: Date): number => Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));

/** Nome da cópia (RN-Q4): " (cópia)" cabe nos 80 caracteres cortando o nome de origem, nunca o sufixo. */
export const COPY_SUFFIX = ' (cópia)';
export const copyName = (name: string): string => `${[...name].slice(0, 80 - COPY_SUFFIX.length).join('').trimEnd()}${COPY_SUFFIX}`;

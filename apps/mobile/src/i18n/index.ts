import { ptBR } from './pt-BR';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<typeof ptBR>;

/** Idioma único do produto: pt-BR (CLAUDE.md §8). A estrutura já separa texto de tela para facilitar revisão do UX writing. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let node: unknown = ptBR;
  for (const part of key.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  if (typeof node !== 'string') return key;
  if (!params) return node;
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}

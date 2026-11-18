// Utilitarios compartilhados pelos scripts do pacote. Sem dependencias externas.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REF = /^\{([^}]+)\}$/;

export function loadSource() {
  return JSON.parse(readFileSync(resolve(root, 'tokens.json'), 'utf8'));
}

function lookup(source, path) {
  return path.split('.').reduce((node, key) => {
    if (node === null || typeof node !== 'object' || !(key in node)) {
      throw new Error(`Referencia inexistente: ${path}`);
    }
    return node[key];
  }, source);
}

function resolveValue(source, value, trail) {
  if (typeof value === 'string') {
    const match = REF.exec(value);
    if (!match) return value;
    const target = match[1];
    if (trail.includes(target)) {
      throw new Error(`Referencia circular: ${[...trail, target].join(' -> ')}`);
    }
    return resolveValue(source, lookup(source, target), [...trail, target]);
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(source, item, trail));
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([key]) => !key.startsWith('$'))
      .map(([key, item]) => [key, resolveValue(source, item, trail)]);
    return Object.fromEntries(entries);
  }
  return value;
}

/** Retorna os tokens com todas as referencias resolvidas e sem chaves "$...". */
export function loadResolved() {
  const source = loadSource();
  return resolveValue(source, source, []);
}

/** Busca um caminho (ex.: "color.text.primary") nos tokens resolvidos. */
export function get(tokens, path) {
  return path.split('.').reduce((node, key) => {
    if (node === null || typeof node !== 'object' || !(key in node)) {
      throw new Error(`Token inexistente: ${path}`);
    }
    return node[key];
  }, tokens);
}

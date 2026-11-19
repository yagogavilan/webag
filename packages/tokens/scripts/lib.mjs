// Utilitarios compartilhados pelos scripts do pacote. Sem dependencias externas.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REF = /^\{([^}]+)\}$/;
const THEME_NAME = /^[a-z0-9-]+$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Mescla o tema sobre a base. Chaves que ja existem na base mantem a posicao (a ordem das saidas geradas nao muda).
function deepMerge(base, over) {
  if (!isObject(base) || !isObject(over)) return over;
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

/**
 * Le tokens.json e mescla o tema de marca ativo (theme/<nome>.json).
 * Tema ativo: campo "$theme" do tokens.json. A variavel de ambiente WB_THEME sobrescreve
 * (para pre-visualizar outro tema em `check`; nao use com `build` para commitar).
 */
export function loadSource() {
  const base = JSON.parse(readFileSync(resolve(root, 'tokens.json'), 'utf8'));
  const name = process.env.WB_THEME || base.$theme;
  if (!name) throw new Error('Defina "$theme" no tokens.json (ex.: "petroleo").');
  if (!THEME_NAME.test(name)) throw new Error(`Nome de tema invalido: ${name} (use a-z, 0-9 e hifen).`);
  const file = resolve(root, 'theme', `${name}.json`);
  if (!existsSync(file)) throw new Error(`Tema inexistente: theme/${name}.json`);
  if (process.env.WB_THEME) console.warn(`Aviso: tema de previa "${name}" (WB_THEME). Nao commite saidas geradas assim.`);
  return deepMerge(base, JSON.parse(readFileSync(file, 'utf8')));
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

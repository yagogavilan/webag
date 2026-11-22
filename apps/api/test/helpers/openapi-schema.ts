import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

/**
 * Validador mínimo de JSON Schema (o subconjunto que o `openapi.yaml` usa) para provar que a resposta REAL da API cabe no schema do contrato.
 * `ajv` não é dependência de `apps/api` e instalar dependência estava fora do escopo desta entrega: trocar por Ajv montado a partir do mesmo YAML
 * quando for permitido (a interface `validateAgainst(name, value)` não muda). Palavra-chave desconhecida LANÇA erro (nunca passa em silêncio).
 */
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const contract = parse(readFileSync(resolve(import.meta.dirname, '../../../../docs/arquitetura/api/openapi.yaml'), 'utf8')) as Json;
const schemas = contract.components.schemas as Json;

const ANNOTATIONS = new Set(['description', 'example', 'examples', 'title', 'default', 'deprecated', 'readOnly', 'writeOnly', 'nullable', 'externalDocs']);
const KNOWN = new Set(['$ref', 'type', 'properties', 'required', 'additionalProperties', 'items', 'oneOf', 'anyOf', 'allOf', 'enum', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'format']);

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}
const FORMAT: Record<string, RegExp> = {
  'date-time': /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  uri: /^[a-z][a-z0-9+.-]*:/i,
  date: /^\d{4}-\d{2}-\d{2}$/,
};

export function validateValue(schema: Json, value: unknown, path = '$'): string[] {
  if (schema.$ref) {
    const name = String(schema.$ref).split('/').pop() as string;
    if (!schemas[name]) throw new Error(`$ref desconhecido: ${schema.$ref}`);
    return validateValue(schemas[name], value, path);
  }
  for (const key of Object.keys(schema)) if (!KNOWN.has(key) && !ANNOTATIONS.has(key) && !key.startsWith('x-')) throw new Error(`palavra-chave não suportada pelo validador de teste: ${key} (${path})`);
  const errors: string[] = [];
  if (schema.type !== undefined) {
    const types = (Array.isArray(schema.type) ? schema.type : [schema.type]) as string[];
    const actual = typeOf(value);
    if (!types.includes(actual) && !(actual === 'integer' && types.includes('number'))) return [`${path}: tipo ${actual}, esperado ${types.join('|')}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} fora de enum`);
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: não casa com ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: curto`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longo`);
    if (schema.format && FORMAT[schema.format] && !FORMAT[schema.format]!.test(value)) errors.push(`${path}: formato ${schema.format}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: abaixo do mínimo`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: acima do máximo`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: itens demais`);
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: itens de menos`);
    if (schema.items) value.forEach((v, i) => errors.push(...validateValue(schema.items, v, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const key of (schema.required ?? []) as string[]) if (!(key in obj)) errors.push(`${path}.${key}: obrigatório ausente`);
    const props = (schema.properties ?? {}) as Json;
    for (const [key, v] of Object.entries(obj)) {
      if (props[key]) errors.push(...validateValue(props[key], v, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: campo fora do contrato (additionalProperties: false)`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') errors.push(...validateValue(schema.additionalProperties, v, `${path}.${key}`));
    }
  }
  if (schema.allOf) for (const sub of schema.allOf as Json[]) errors.push(...validateValue(sub, value, path));
  if (schema.anyOf && !(schema.anyOf as Json[]).some((sub) => validateValue(sub, value, path).length === 0)) errors.push(`${path}: nenhum anyOf casa`);
  if (schema.oneOf) {
    const matches = (schema.oneOf as Json[]).filter((sub) => validateValue(sub, value, path).length === 0).length;
    if (matches !== 1) errors.push(`${path}: oneOf casou ${matches} vezes`);
  }
  return errors;
}

export const validateAgainst = (schemaName: string, value: unknown): string[] => validateValue({ $ref: `#/components/schemas/${schemaName}` }, value);

/** Schema do corpo 200 de uma operação (resolvendo `$ref` do topo). */
export function responseSchemaOf(operationId: string): Json {
  for (const item of Object.values(contract.paths as Json)) {
    for (const op of Object.values(item as Json)) {
      if ((op as Json)?.operationId === operationId) {
        const code = Object.keys((op as Json).responses).find((c) => c.startsWith('2'))!;
        return (op as Json).responses[code].content['application/json'].schema as Json;
      }
    }
  }
  throw new Error(`operação desconhecida: ${operationId}`);
}

export interface ViewAsContractOp { operationId: string; viewAsSchema: string | undefined; planned: boolean }
/** As operações `x-view-as: true` do YAML (VA-23). */
export function viewAsOperations(): ViewAsContractOp[] {
  const out: ViewAsContractOp[] = [];
  for (const item of Object.values(contract.paths as Json)) for (const op of Object.values(item as Json)) {
    const o = op as Json;
    if (o?.['x-view-as'] === true) out.push({ operationId: o.operationId as string, viewAsSchema: o['x-view-as-schema'] as string | undefined, planned: o['x-planned'] !== undefined });
  }
  return out;
}

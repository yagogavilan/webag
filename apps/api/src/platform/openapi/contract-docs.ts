import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { parse } from 'yaml';

/**
 * O contrato é escrito à mão (contract-first, ADR-007) e só servido aqui.
 * Nada de decorators do @nestjs/swagger gerando documento a partir do código.
 */
const CONTRACT_RELATIVE_PATH = join('docs', 'arquitetura', 'api', 'openapi.yaml');

export const DOCS_PATH = 'docs';

/** Procura o contrato subindo a partir de `startDir` (cwd = apps/api ou raiz do monorepo). */
export function findContractPath(startDir: string): string | undefined {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONTRACT_RELATIVE_PATH);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function isOpenApi3(value: unknown): value is OpenAPIObject {
  if (typeof value !== 'object' || value === null) return false;
  const version = (value as { openapi?: unknown }).openapi;
  return typeof version === 'string' && version.startsWith('3.') && 'info' in value;
}

export function loadContract(path: string): OpenAPIObject {
  const document: unknown = parse(readFileSync(path, 'utf8'));
  if (!isOpenApi3(document)) {
    throw new Error(`${path} não é um documento OpenAPI 3.x válido`);
  }
  return document;
}

/** UI em /docs, JSON em /docs/openapi.json e YAML em /docs/openapi.yaml. */
export function setupContractDocs(app: INestApplication, contract: OpenAPIObject): void {
  SwaggerModule.setup(DOCS_PATH, app, contract, {
    jsonDocumentUrl: `${DOCS_PATH}/openapi.json`,
    yamlDocumentUrl: `${DOCS_PATH}/openapi.yaml`,
    customSiteTitle: 'Webag API',
  });
}

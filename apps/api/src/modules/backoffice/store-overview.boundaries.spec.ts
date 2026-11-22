import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * DT-088 (ADR-018 D15): a ficha 360 pega indicadores de pedidos e de produtos pelas APIs públicas (`orders/index.ts`, `catalog/index.ts`).
 * Sem regra de lint para fronteira de módulo (ADR-007), este teste barra a volta da leitura direta da tabela alheia nesse arquivo.
 */
describe('store-overview.service: fronteiras de módulo (DT-088)', () => {
  const source = readFileSync(new URL('./store-overview.service.ts', import.meta.url), 'utf8');

  it('não importa o schema nem o repositório de orders nem de catalog', () => {
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports.filter((line) => /(orders|catalog)\/(db|domain)\//.test(line))).toEqual([]);
    expect(imports.some((line) => line.includes("'../orders/index.js'"))).toBe(true);
    expect(imports.some((line) => line.includes("'../catalog/index.js'"))).toBe(true);
  });
});

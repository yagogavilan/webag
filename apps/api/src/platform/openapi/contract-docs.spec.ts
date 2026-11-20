import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findContractPath, loadContract } from './contract-docs.js';

describe('contrato OpenAPI', () => {
  it('encontra o openapi.yaml do monorepo subindo a partir do pacote da API', () => {
    const path = findContractPath(process.cwd());

    expect(path).toMatch(/docs[\\/]arquitetura[\\/]api[\\/]openapi\.yaml$/);
  });

  it('carrega o contrato real e expõe /health', () => {
    const contract = loadContract(findContractPath(process.cwd()) ?? '');

    expect(contract.openapi).toMatch(/^3\./);
    expect(Object.keys(contract.paths ?? {})).toContain('/health');
  });

  it('recusa arquivo que não é OpenAPI 3', () => {
    const dir = mkdtempSync(join(tmpdir(), 'webag-contract-'));
    const file = join(dir, 'swagger.yaml');
    writeFileSync(file, 'swagger: "2.0"\ninfo: { title: x, version: "1" }\n');

    expect(() => loadContract(file)).toThrow(/OpenAPI 3/);
  });

  it('retorna undefined quando não há contrato acima do diretório', () => {
    expect(findContractPath(tmpdir())).toBeUndefined();
  });
});

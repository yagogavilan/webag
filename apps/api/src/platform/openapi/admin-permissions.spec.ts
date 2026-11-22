/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- o contrato é um documento YAML sem tipo: o teste o percorre como dado */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { ADMIN_PERMISSIONS, adminHasPermission, type AdminPermission } from '../auth/permissions.js';
import { findContractPath } from './contract-docs.js';

/**
 * WB-355 (C-ADM-01, C1 e C3): a matriz de permissões do admin é UMA tabela (`permissions.ts`) e o contrato declara a permissão de TODA
 * rota `/v1/admin/*` em `x-admin-permission`. Este teste é de contrato (sem banco). A prova contra as rotas reais do Nest e a matriz
 * perfil x rota por HTTP ficam em `test/admin-permission-matrix.e2e-spec.ts`.
 */
type Json = Record<string, any>;
const contract = parse(readFileSync(findContractPath(process.cwd()) ?? '', 'utf8')) as Json;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const adminOps = Object.entries(contract.paths as Json)
  .filter(([path]) => path.startsWith('/v1/admin/'))
  .flatMap(([path, item]) => METHODS.filter((m) => item[m]).map((m) => ({ key: `${m.toUpperCase()} ${path}`, op: item[m] as Json })));
/** Rotas do admin sobre o próprio TOTP: qualquer perfil de admin, nenhum dado de terceiros (o serviço checa `adminProfile`). */
const SELF = 'admin-self';

describe('permissões do admin x contrato (WB-355)', () => {
  it('há rotas de admin documentadas', () => {
    expect(adminOps.length).toBeGreaterThan(150);
  });

  it('C1: toda operação /v1/admin/* declara `x-admin-permission` e ela existe na tabela única (rota nova sem permissão falha aqui)', () => {
    const without = adminOps.filter((o) => typeof o.op['x-admin-permission'] !== 'string').map((o) => o.key);
    expect(without).toEqual([]);
    const unknown = adminOps.filter((o) => o.op['x-admin-permission'] !== SELF && !(o.op['x-admin-permission'] in ADMIN_PERMISSIONS)).map((o) => `${o.key} -> ${o.op['x-admin-permission']}`);
    expect(unknown).toEqual([]);
  });

  it('`admin-self` é só do TOTP do próprio admin', () => {
    expect(adminOps.filter((o) => o.op['x-admin-permission'] === SELF).map((o) => o.key).sort()).toEqual([
      'GET /v1/admin/totp/status', 'POST /v1/admin/totp/confirm', 'POST /v1/admin/totp/recovery-codes', 'POST /v1/admin/totp/setup',
    ]);
  });

  it('`x-admin-profiles`, quando declarado, é exatamente o da tabela (não há duas fontes divergentes)', () => {
    for (const { key, op } of adminOps) {
      if (!op['x-admin-profiles']) continue;
      expect([...op['x-admin-profiles']].sort(), key).toEqual([...ADMIN_PERMISSIONS[op['x-admin-permission'] as AdminPermission]].sort());
    }
  });

  it('C2: comissão só do financeiro e do super admin (operação e suporte não alteram)', () => {
    expect(ADMIN_PERMISSIONS['commissions:write']).toEqual(['super_admin', 'finance']);
    const commission = adminOps.filter((o) => /\/commission/.test(o.key) && !o.key.startsWith('GET'));
    expect(commission.length).toBeGreaterThan(0);
    for (const { key, op } of commission) expect(adminHasPermission('operations', op['x-admin-permission']), key).toBe(false);
  });

  it('C3: perfil novo (fora dos 4) não tem nenhuma permissão; permissão sem ninguém não existe', () => {
    for (const permission of Object.keys(ADMIN_PERMISSIONS) as AdminPermission[]) {
      expect(adminHasPermission('novo_perfil' as never, permission), permission).toBe(false);
      expect(ADMIN_PERMISSIONS[permission].length, permission).toBeGreaterThan(0);
    }
  });

  it('as escritas do catálogo e da edição de loja pelo admin exigem permissão de escrita (suporte e financeiro nunca escrevem)', () => {
    for (const { key, op } of adminOps) {
      if (key.startsWith('GET') || /\/(view-as|analytics)\b/.test(key)) continue;
      if (/stores\/\{storeId\}\/(profile|config|products)/.test(key)) {
        expect(adminHasPermission('support', op['x-admin-permission']), key).toBe(false);
        expect(adminHasPermission('finance', op['x-admin-permission']), key).toBe(false);
      }
    }
  });
});

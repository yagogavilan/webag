import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canEdit, canView, NAV_ITEMS } from './admin-access';
import { ADMIN_PERMISSIONS, SECTION_PERMISSIONS, can, type AdminPermission } from './admin-permissions';
import type { AdminProfile } from './session-types';

const PROFILES: AdminProfile[] = ['super_admin', 'operations', 'finance', 'support'];
const API_FILE = resolve(process.cwd(), '../api/src/platform/auth/permissions.ts');

/** Lê a tabela da API como texto (o web não importa código da API): `'chave': [SUPER, OPS],` por linha. */
function apiTable(): Record<string, AdminProfile[]> {
  const source = readFileSync(API_FILE, 'utf8');
  const block = /export const ADMIN_PERMISSIONS = \{([\s\S]*?)\n\} as const/.exec(source)?.[1] ?? '';
  const names: Record<string, AdminProfile> = { SUPER: 'super_admin', OPS: 'operations', FIN: 'finance', SUP: 'support' };
  const table: Record<string, AdminProfile[]> = {};
  for (const match of block.matchAll(/^\s*'([a-z:-]+)':\s*\[([^\]]*)\]/gm)) {
    table[match[1]!] = match[2]!.split(',').map((item) => names[item.trim()]!).filter(Boolean);
  }
  return table;
}

describe('WB-355: o espelho da matriz de permissões', () => {
  it('é idêntico à tabela da API (permissão nova ou alterada lá falha aqui)', () => {
    const api = apiTable();
    expect(Object.keys(api).length).toBeGreaterThan(50);
    const mirror = Object.fromEntries(Object.entries(ADMIN_PERMISSIONS).map(([key, profiles]) => [key, [...profiles].sort()]));
    const real = Object.fromEntries(Object.entries(api).map(([key, profiles]) => [key, [...profiles].sort()]));
    expect(mirror).toEqual(real);
  });

  it('nega perfil ausente e permissão desconhecida (C3)', () => {
    expect(can(null, 'stores:read')).toBe(false);
    expect(can('support', 'stores:write')).toBe(false);
    expect(can('operations', 'commissions:write')).toBe(false);
    expect(can('finance', 'commissions:write')).toBe(true);
    expect(can('super_admin', 'nao-existe' as AdminPermission)).toBe(false);
  });

  it('o menu nunca mostra nem libera edição que a API recusaria (item só some, nunca vira 403)', () => {
    const sections = NAV_ITEMS.map((item) => item.section);
    for (const section of sections) {
      const { read, write } = SECTION_PERMISSIONS[section];
      for (const profile of PROFILES) {
        if (canView(profile, section)) expect(can(profile, read), `${profile} vê ${section}`).toBe(true);
        if (canEdit(profile, section)) expect(write && can(profile, write), `${profile} edita ${section}`).toBe(true);
      }
    }
  });
});

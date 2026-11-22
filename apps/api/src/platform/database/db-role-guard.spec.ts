import { describe, expect, it } from 'vitest';
import { assertSafeDatabaseRole, isProductionForRoleCheck, roleViolations, UnsafeDatabaseRoleError, type DbRoleFacts } from './db-role-guard.js';

const safe: DbRoleFacts = { user: 'webag_app', isSuperuser: false, ownsAuditLog: false, isMigratorMember: false };
const poolOf = (facts: DbRoleFacts) => ({
  query: () => Promise.resolve({ rows: [{ usename: facts.user, rolsuper: facts.isSuperuser, owns_audit_log: facts.ownsAuditLog, migrator_member: facts.isMigratorMember }] }),
}) as never;

describe('D-06: falha segura do papel de banco (DB-01)', () => {
  it('o papel webag_app é seguro', () => {
    expect(roleViolations(safe)).toEqual([]);
  });

  it.each([
    ['superusuário', { isSuperuser: true }, ['superuser']],
    ['dono do audit_log', { ownsAuditLog: true }, ['owns_audit_log']],
    ['membro de webag_migrator', { isMigratorMember: true }, ['migrator_member']],
    ['o dono completo (as três)', { isSuperuser: true, ownsAuditLog: true, isMigratorMember: true }, ['superuser', 'owns_audit_log', 'migrator_member']],
  ] as const)('%s é violação', (_name, over, expected) => {
    expect(roleViolations({ ...safe, ...over })).toEqual(expected);
  });

  it('NODE_ENV ausente conta como produção; development e test não', () => {
    expect(isProductionForRoleCheck(undefined)).toBe(true);
    expect(isProductionForRoleCheck('production')).toBe(true);
    expect(isProductionForRoleCheck('development')).toBe(false);
    expect(isProductionForRoleCheck('test')).toBe(false);
  });

  it('em produção recusa subir com papel inseguro, dizendo qual e o que fazer', async () => {
    await expect(assertSafeDatabaseRole(poolOf({ ...safe, user: 'webag', isSuperuser: true }), 'production')).rejects.toThrow(UnsafeDatabaseRoleError);
    await expect(assertSafeDatabaseRole(poolOf({ ...safe, user: 'webag', isSuperuser: true }), undefined)).rejects.toThrow(/SUPERUSUÁRIO.*webag_app.*seção 15/s);
  });

  it('em produção o papel certo sobe; em desenvolvimento e teste só devolve o aviso', async () => {
    expect(await assertSafeDatabaseRole(poolOf(safe), 'production')).toMatchObject({ violations: [], enforced: true });
    expect(await assertSafeDatabaseRole(poolOf({ ...safe, user: 'webag', isSuperuser: true }), 'development')).toMatchObject({ violations: ['superuser'], enforced: false });
    expect(await assertSafeDatabaseRole(poolOf({ ...safe, user: 'webag', isSuperuser: true }), 'test')).toMatchObject({ enforced: false });
  });
});

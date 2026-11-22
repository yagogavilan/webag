import type pg from 'pg';

/**
 * D-06 (ADR-018 D19 item 1, threat model §14.10 e §15.3-4): falha segura no boot. Em PRODUÇÃO a API recusa subir se o papel do banco que ela usa
 * for superusuário, dono do `audit_log` ou membro de `webag_migrator`: qualquer um deles ignora a trava append-only (`ALTER TABLE ... DISABLE TRIGGER`,
 * `UPDATE audit_log`) e deixaria a D-06 só no papel se esquecessem de trocar o `DATABASE_URL`. Em desenvolvimento e teste só avisa.
 *
 * `NODE_ENV` ausente CONTA COMO PRODUÇÃO nesta checagem (§15.3-4): esquecer a variável não pode desligar a proteção. Quem desenvolve define
 * `NODE_ENV=development` (`infra/env.example`, `docker-compose.yml`).
 */
export interface DbRoleFacts {
  user: string;
  isSuperuser: boolean;
  ownsAuditLog: boolean;
  isMigratorMember: boolean;
}

export type RoleViolation = 'superuser' | 'owns_audit_log' | 'migrator_member';

/** Pura: o que há de errado com o papel (vazio = seguro). */
export function roleViolations(facts: DbRoleFacts): RoleViolation[] {
  const found: RoleViolation[] = [];
  if (facts.isSuperuser) found.push('superuser');
  if (facts.ownsAuditLog) found.push('owns_audit_log');
  if (facts.isMigratorMember) found.push('migrator_member');
  return found;
}

const EXPLAIN: Record<RoleViolation, string> = {
  superuser: 'é SUPERUSUÁRIO (ignora posse e gatilhos)',
  owns_audit_log: 'é DONO da tabela audit_log (pode desligar o gatilho append-only)',
  migrator_member: 'é membro de webag_migrator (o papel das migrações, com DDL)',
};

/**
 * `NODE_ENV` como estava quando este módulo foi carregado, ANTES de o `ConfigModule` do Nest gravar os valores validados (com o padrão `development`) de volta em
 * `process.env`: sem isto, "NODE_ENV ausente" viraria "development" e a proteção se desligaria sozinha (threat model §15.3-4).
 */
export const NODE_ENV_AT_LOAD: string | undefined = process.env.NODE_ENV;

/** Produção para esta checagem: `NODE_ENV=production` OU ausente. */
export const isProductionForRoleCheck = (nodeEnv: string | undefined): boolean => nodeEnv === undefined || nodeEnv === 'production';

export class UnsafeDatabaseRoleError extends Error {
  constructor(readonly violations: RoleViolation[], user: string) {
    super(
      `D-06: a API não pode rodar com o papel de banco "${user}": ${violations.map((v) => EXPLAIN[v]).join('; ')}. Use o papel webag_app em DATABASE_URL ` +
        '(e deixe MIGRATION_DATABASE_URL para o job migrate). Ver docs/deploy/guia-deploy.md, seção 15.',
    );
    this.name = 'UnsafeDatabaseRoleError';
  }
}

export async function readRoleFacts(pool: Pick<pg.Pool, 'query'>): Promise<DbRoleFacts> {
  const { rows } = await pool.query<{ usename: string; rolsuper: boolean; owns_audit_log: boolean | null; migrator_member: boolean | null }>(
    `select current_user as usename,
            (select rolsuper from pg_roles where rolname = current_user) as rolsuper,
            (select pg_get_userbyid(c.relowner) = current_user from pg_class c where c.relname = 'audit_log' and c.relnamespace = 'public'::regnamespace) as owns_audit_log,
            (select pg_has_role(current_user, 'webag_migrator', 'member') from pg_roles where rolname = 'webag_migrator') as migrator_member`,
  );
  const row = rows[0];
  if (!row) throw new Error('D-06: não foi possível ler o papel do banco');
  return { user: row.usename, isSuperuser: row.rolsuper === true, ownsAuditLog: row.owns_audit_log === true, isMigratorMember: row.migrator_member === true };
}

/** Lança `UnsafeDatabaseRoleError` em produção; fora dela devolve as violações para o chamador só avisar. */
export async function assertSafeDatabaseRole(pool: Pick<pg.Pool, 'query'>, nodeEnv: string | undefined): Promise<{ violations: RoleViolation[]; user: string; enforced: boolean }> {
  const facts = await readRoleFacts(pool);
  const violations = roleViolations(facts);
  const enforced = isProductionForRoleCheck(nodeEnv);
  if (enforced && violations.length > 0) throw new UnsafeDatabaseRoleError(violations, facts.user);
  return { violations, user: facts.user, enforced };
}

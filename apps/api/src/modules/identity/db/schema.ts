import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** ADR-003: papéis globais (customer, merchant) em `user_roles`; perfil de admin em `admin_profiles`. */
export const USER_STATUS = ['active', 'blocked', 'deleted'] as const;
export const USER_ROLES = ['customer', 'merchant'] as const;
export const ADMIN_PROFILES = ['super_admin', 'operations', 'finance', 'support'] as const;
/** SEC-002: finalidades do código de 6 dígitos. */
export const CODE_PURPOSES = [
  'verify_email',
  'reset_password',
  'change_email',
  'delete_web',
  /** SEC-180: step-up de quem já provou a senha ao desistir da exclusão (o orçamento de envio é próprio, fora do anônimo). */
  'delete_cancel',
  'login_stepup',
] as const;

export type UserStatus = (typeof USER_STATUS)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type AdminProfile = (typeof ADMIN_PROFILES)[number];
export type CodePurpose = (typeof CODE_PURPOSES)[number];

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** Sempre em minúsculas (normalizado na borda). */
    email: text().notNull(),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    /** Argon2id. Nulo para contas sociais futuras. */
    passwordHash: text(),
    name: text().notNull(),
    /** Só dígitos (DDD + número), ex.: 11999999999. */
    phone: text(),
    status: text({ enum: USER_STATUS }).notNull().default('active'),
    /** HIP-026: declaração de 18+ (não guardamos data de nascimento). */
    adultDeclaredAt: timestamp({ withTimezone: true }),
    passwordChangedAt: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_email_uq').on(t.email),
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
  ],
);

/** B4 / WB-102 C2: histórico de bloqueios e desbloqueios feitos pelo admin (motivo obrigatório). A auditoria guarda a mesma ação; aqui fica a leitura rápida do detalhe. */
export const userStatusHistory = pgTable(
  'user_status_history',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text({ enum: ['blocked', 'unblocked'] }).notNull(),
    reason: text().notNull(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Lojas suspensas junto com o bloqueio do lojista (WB-102 C5); vazio nos demais casos. */
    suspendedStoreIds: jsonb().$type<string[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('user_status_history_user_idx').on(t.userId, t.createdAt)],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text({ enum: USER_ROLES }).notNull(),
    grantedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const adminProfiles = pgTable('admin_profiles', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  profile: text({ enum: ADMIN_PROFILES }).notNull(),
  active: boolean().notNull().default(true),
  /** AES-256-GCM com a MFA_ENC_KEY (SEC-090). Nulo = TOTP ainda não configurado. */
  totpSecretEnc: text(),
  totpConfirmedAt: timestamp({ withTimezone: true }),
  /** Último passo de 30 s aceito: impede reuso do mesmo código (anti-replay). */
  totpLastStep: integer(),
  /** Segredo pendente vale 10 min e aceita no máximo 10 erros (SEC-090). */
  totpSetupStartedAt: timestamp({ withTimezone: true }),
  totpSetupAttempts: integer().notNull().default(0),
  /**
   * SEC-113: preenchido quando um código de recuperação foi usado. O segredo antigo morreu, mas os códigos restantes
   * continuam valendo e o login continua exigindo o 2º fator (nunca só a senha) até reconfigurar o TOTP.
   */
  totpReenrollRequiredAt: timestamp({ withTimezone: true }),
  /** SEC-113 (5): prazo para o PRIMEIRO enrolamento (convite/reativação). Vencido, a senha sozinha não abre sessão. */
  totpSetupDeadlineAt: timestamp({ withTimezone: true }).notNull().default(sql`now() + interval '48 hours'`),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const adminRecoveryCodes = pgTable(
  'admin_recovery_codes',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text().notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('admin_recovery_codes_user_idx').on(t.userId)],
);

/** Uma sessão = uma família de refresh tokens (RFC 9700). */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ip: text(),
    userAgent: text(),
    deviceId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    absoluteExpiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedReason: text(),
    /** Admin: segundo fator conferido nesta sessão (SEC-015). */
    mfaVerifiedAt: timestamp({ withTimezone: true }),
    /** Última reautenticação (SEC-016). */
    reauthAt: timestamp({ withTimezone: true }),
    /** SEC-113: como o 2º fator foi dado. `recovery` é a única sessão que pode reconfigurar o TOTP. */
    mfaFactor: text({ enum: ['totp', 'recovery'] }),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const VIEW_AS_REASON_CODES = ['merchant_support', 'investigate_issue', 'check_registration', 'other'] as const;
export const VIEW_AS_CLOSE_CAUSES = ['ended', 'expired', 'session_ended', 'replaced', 'permission_lost', 'abuse'] as const;

/**
 * v1.1 R1 (D8, threat model §14.5): credencial de "Ver como o lojista". Só o SHA-256 da credencial `vas_...` é guardado. Ligada à sessão do admin
 * e vence com ela (`expires_at = least(opened_at + 30 min, sessions.absolute_expires_at)`), sem renovação. NÃO é append-only (tem `closed_at`):
 * o histórico de abertura e encerramento vai ao `audit_log` (`view_as.open`, `view_as.close`).
 * `store_id` sem FK a `stores` (identity não importa o módulo de lojas; a loja é validada por quem abre a visão).
 */
export const adminViewSessions = pgTable(
  'admin_view_sessions',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    tokenHash: text().notNull(),
    adminUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adminSessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    storeId: uuid().notNull(),
    reasonCode: text({ enum: VIEW_AS_REASON_CODES }).notNull(),
    reasonNote: varchar({ length: 200 }),
    openedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    closedAt: timestamp({ withTimezone: true }),
    closeCause: text({ enum: VIEW_AS_CLOSE_CAUSES }),
  },
  (t) => [
    uniqueIndex('admin_view_sessions_token_hash_uq').on(t.tokenHash),
    // Uma visão ativa por admin: a corrida entre duas aberturas é decidida pelo banco (409 VIEW_AS_OPEN_CONFLICT).
    uniqueIndex('admin_view_sessions_one_open_per_admin_uq').on(t.adminUserId).where(sql`${t.closedAt} is null`),
    index('admin_view_sessions_open_expiry_idx').on(t.expiresAt).where(sql`${t.closedAt} is null`),
    index('admin_view_sessions_admin_idx').on(t.adminUserId, t.openedAt),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    /** SHA-256 em hex; o token em si nunca é guardado. */
    tokenHash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    /** Preenchido quando o token é trocado por um novo (rotação). */
    usedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash),
    index('refresh_tokens_session_idx').on(t.sessionId),
  ],
);

export const authCodes = pgTable(
  'auth_codes',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text({ enum: CODE_PURPOSES }).notNull(),
    /** HMAC-SHA256(CODE_HMAC_KEY, userId:purpose:code). */
    codeHash: text().notNull(),
    destinationEmail: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    attempts: integer().notNull().default(0),
    consumedAt: timestamp({ withTimezone: true }),
    invalidatedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_codes_user_purpose_idx').on(t.userId, t.purpose, t.createdAt)],
);

/**
 * Tickets de uso único de 256 bits (guardados como hash): `mfa_login` (SEC-090, 2º passo do login do admin),
 * `password_reset` (SEC-095: código do e-mail + 2º fator + nova senha) e `account_delete` (SEC-096).
 */
export const TICKET_KINDS = ['mfa_login', 'password_reset', 'account_delete'] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const authTickets = pgTable(
  'auth_tickets',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    kind: text({ enum: TICKET_KINDS }).notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    attempts: integer().notNull().default(0),
    /** password_reset: passo 1 concluído (código do e-mail aceito). */
    emailVerifiedAt: timestamp({ withTimezone: true }),
    /** password_reset: passo 2 concluído (TOTP ou código de recuperação). */
    mfaVerifiedAt: timestamp({ withTimezone: true }),
    mfaKind: text({ enum: ['totp', 'recovery'] }),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('auth_tickets_token_uq').on(t.tokenHash), index('auth_tickets_user_idx').on(t.userId, t.kind)],
);

export const INVITATION_KINDS = ['admin', 'store_staff'] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

/** SEC-017: convite de 256 bits, guardado como hash, uso único, ligado ao e-mail. */
export const invitations = pgTable(
  'invitations',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    kind: text({ enum: INVITATION_KINDS }).notNull(),
    email: text().notNull(),
    name: text().notNull(),
    tokenHash: text().notNull(),
    /** admin: { profile }; store_staff: { storeId, permissions }. */
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    invitedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invitations_token_uq').on(t.tokenHash), index('invitations_email_idx').on(t.email)],
);

export const STORE_ROLES = ['owner', 'staff'] as const;
export type StoreRole = (typeof STORE_ROLES)[number];

/**
 * RBAC por loja (ADR-003). `store_id` ainda não tem FK: a tabela `stores` nasce na Onda 2 (módulo stores),
 * que adiciona a restrição na migração dela.
 */
export const storeMembers = pgTable(
  'store_members',
  {
    storeId: uuid().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text({ enum: STORE_ROLES }).notNull(),
    permissions: text().array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.userId] }), index('store_members_user_idx').on(t.userId)],
);

/** SEC-075: registro de acesso (login, refresh) por 6 meses. Sem senha, token ou código. */
export const accessLog = pgTable(
  'access_log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    event: text().notNull(),
    ip: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('access_log_created_idx').on(t.createdAt)],
);

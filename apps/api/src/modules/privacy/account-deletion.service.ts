import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { StorefrontCacheService } from '../../platform/cache/storefront-cache.service.js';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { accountDeletedEmail, accountDeletionCancelledEmail, accountDeletionRequestedEmail } from '../../platform/mail/templates.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../platform/storage/object-storage.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { sha256Hex } from '../../platform/crypto/crypto.js';
import { AuditService, ParametersService } from '../admin/index.js';
import * as t from '../../platform/database/schema.js';
import { AuthService, CodeService, PasswordService, SessionService } from '../identity/index.js';
import { ACTIVE_STATUSES } from '../orders/domain/state.js';
import { OPEN_EXCHANGE_STATUSES } from '../exchanges/db/schema.js';
import { accountDeletions, dataExportLinks, dataExports, privacyRequestEvents, privacyRequests } from './db/schema.js';

export interface DeletionBlocker {
  kind: 'order' | 'exchange' | 'store_order' | 'store_exchange' | 'store_refund';
  id: string;
  /** Número legível (pedido ou troca); a tela monta "Pedido #4821 · saiu para entrega". */
  number: string | null;
  status: string;
}

/** Erro de uso da CLI `privacy:cancel-deletion` (mensagem para o operador, sem dado pessoal). */
export class DeletionOpsError extends Error {
  constructor(
    readonly code: 'CONFIRM_MISMATCH' | 'REASON_TOO_SHORT' | 'IDENTITY_PROOF_REQUIRED' | 'NO_PENDING_DELETION' | 'DELETION_DUE',
    message: string,
  ) {
    super(message);
    this.name = 'DeletionOpsError';
  }
}

export interface DeletionOutcome {
  status: 'completed' | 'pending';
  /** Quando a anonimização acontece (já passou quando `completed`). */
  effectiveAt: string;
  /** Até quando dá para se arrepender (nulo se não há período). */
  cancelableUntil: string | null;
}

const MAX_BLOCKERS = 20;
const FAILURES_BEFORE_ALERT = 3;
const OVERDUE_WARNING_DAYS = 2;
const SYSTEM_CTX: RequestContext = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };

/**
 * WB-213/214/215: exclusão de conta e anonimização (LGPD art. 16 e 18 VI; Apple 5.1.1(v)).
 *
 * Fluxo: 1) conferir bloqueios (pedido ou troca em aberto; dono de loja: pedidos, trocas e estornos da loja); 2) senha (SEC-096:
 * só a senha, nunca código); 3) fechar a conta NA HORA (status `deleted`, sessões e sockets revogados, aparelhos de push e sacola
 * apagados, loja do dono encerrada); 4) anonimizar quando `effective_at` chegar (imediato se `exclusao_arrependimento_horas` = 0).
 *
 * O que fica (obrigação legal, sem identificar a pessoa): pedidos, itens, valores, pagamentos e ledger (`retencao_fiscal_anos`),
 * endereço do pedido reduzido a cidade/UF, cadastro fiscal da loja do dono (CPF/CNPJ) e o registro de acesso de 6 meses
 * (Marco Civil, art. 15; some no expurgo, DT-021). A linha de `users` continua como "casca" anonimizada para as chaves
 * estrangeiras; nome, e-mail, celular e senha viram valores sem relação com a pessoa.
 */
@Injectable()
export class AccountDeletionService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AccountDeletionService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly limiter: RateLimitService,
    private readonly codes: CodeService,
    private readonly storefront: StorefrontCacheService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timers.push(setInterval(() => void this.processDue().catch((e: Error) => this.logger.error(e.message)), 60_000).unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  // ----------------------------------------------------------------- bloqueios

  /** HIP-024: o que impede a exclusão agora (lista curta, com os dados que a tela mostra). */
  async blockers(userId: string, executor: DbOrTx = this.db): Promise<DeletionBlocker[]> {
    const active = [...ACTIVE_STATUSES];
    const open = [...OPEN_EXCHANGE_STATUSES];
    const [orders, exchanges] = await Promise.all([
      executor.select({ id: t.orders.id, number: t.orders.number, status: t.orders.status }).from(t.orders).where(and(eq(t.orders.userId, userId), inArray(t.orders.status, active))).limit(MAX_BLOCKERS),
      executor.select({ id: t.exchangeRequests.id, number: t.exchangeRequests.number, status: t.exchangeRequests.status }).from(t.exchangeRequests).where(and(eq(t.exchangeRequests.userId, userId), inArray(t.exchangeRequests.status, open))).limit(MAX_BLOCKERS),
    ]);
    const out: DeletionBlocker[] = [
      ...orders.map((r) => ({ kind: 'order' as const, ...r })),
      ...exchanges.map((r) => ({ kind: 'exchange' as const, ...r })),
    ];

    // Dono de loja: pedidos em aberto, trocas e estornos pendentes da loja (WB-213 C8).
    const [store] = await executor.select({ id: t.stores.id }).from(t.stores).where(eq(t.stores.ownerUserId, userId));
    if (store) {
      const [storeOrders, storeExchanges, refunds] = await Promise.all([
        executor.select({ id: t.orders.id, number: t.orders.number, status: t.orders.status }).from(t.orders).where(and(eq(t.orders.storeId, store.id), inArray(t.orders.status, active))).limit(MAX_BLOCKERS),
        executor.select({ id: t.exchangeRequests.id, number: t.exchangeRequests.number, status: t.exchangeRequests.status }).from(t.exchangeRequests).where(and(eq(t.exchangeRequests.storeId, store.id), inArray(t.exchangeRequests.status, open))).limit(MAX_BLOCKERS),
        executor
          .select({ id: t.paymentRefundIntents.id, status: t.paymentRefundIntents.status })
          .from(t.paymentRefundIntents)
          .innerJoin(t.paymentAttempts, eq(t.paymentAttempts.id, t.paymentRefundIntents.attemptId))
          .where(and(eq(t.paymentAttempts.storeId, store.id), eq(t.paymentRefundIntents.status, 'pending')))
          .limit(MAX_BLOCKERS),
      ]);
      out.push(
        ...storeOrders.map((r) => ({ kind: 'store_order' as const, ...r })),
        ...storeExchanges.map((r) => ({ kind: 'store_exchange' as const, ...r })),
        ...refunds.map((r) => ({ kind: 'store_refund' as const, id: r.id, number: null, status: r.status })),
      );
    }
    return out.slice(0, MAX_BLOCKERS);
  }

  /** Resumo para a tela "Excluir minha conta": bloqueios e os prazos que o texto "O que acontece" cita (nunca fixos na tela). */
  async overview(principal: Principal) {
    const [blockers, anonymizationDays, fiscalYears, regretHours, [user], [store]] = await Promise.all([
      this.blockers(principal.userId),
      this.params.getNumber('exclusao_anonimizacao_dias'),
      this.params.getNumber('retencao_fiscal_anos'),
      this.params.getNumber('exclusao_arrependimento_horas'),
      this.db.select({ hasPassword: sql<boolean>`${t.users.passwordHash} is not null` }).from(t.users).where(eq(t.users.id, principal.userId)),
      this.db.select({ id: t.stores.id }).from(t.stores).where(eq(t.stores.ownerUserId, principal.userId)),
    ]);
    return {
      canDelete: principal.adminProfile === null && blockers.length === 0,
      blockers,
      hasPassword: user?.hasPassword ?? false,
      ownsStore: store !== undefined,
      anonymizationDays,
      fiscalRetentionYears: fiscalYears,
      regretHours: Math.min(regretHours, anonymizationDays * 24),
    };
  }

  // ------------------------------------------------------------------- pedido

  /** SEC-096 / DEC-015: só a senha. O limite de tentativas é o do login (WB-221 C6). */
  async request(principal: Principal, password: string, ctx: RequestContext, via: 'app' | 'web' = 'app'): Promise<DeletionOutcome> {
    // Conta admin é desativada pelo super admin (WB-101), nunca por aqui.
    if (principal.adminProfile !== null) throw errors.forbidden('ADMIN_ACCOUNT_NOT_DELETABLE', 'Contas de administração não são excluídas por aqui. Fale com o super admin.');
    await this.auth.confirmPassword(principal.userId, password, ctx, 'delete_account');
    return this.closeAccount(principal.userId, ctx, via);
  }

  /** Fecha a conta (na hora) e, se não há período de arrependimento, anonimiza em seguida. Os chamadores já provaram a identidade. */
  async closeAccount(userId: string, ctx: RequestContext, via: 'app' | 'web'): Promise<DeletionOutcome> {
    const [anonymizationDays, regretHours] = await Promise.all([this.params.getNumber('exclusao_anonimizacao_dias'), this.params.getNumber('exclusao_arrependimento_horas')]);
    const delayHours = Math.min(regretHours, anonymizationDays * 24);

    const result = await this.db.transaction(async (tx) => {
      const [user] = await tx.select().from(t.users).where(eq(t.users.id, userId)).for('update');
      // SEC-182: conta bloqueada também pode (e deve poder) pedir a exclusão (LGPD art. 18, VI); o status anterior fica gravado para o arrependimento.
      if (!user || (user.status !== 'active' && user.status !== 'blocked')) throw errors.notFound();
      const previousUserStatus = user.status;
      const [admin] = await tx.select({ id: t.adminProfiles.userId }).from(t.adminProfiles).where(eq(t.adminProfiles.userId, userId));
      if (admin) throw errors.forbidden('ADMIN_ACCOUNT_NOT_DELETABLE', 'Contas de administração não são excluídas por aqui. Fale com o super admin.');

      const blockers = await this.blockers(userId, tx);
      if (blockers.length > 0) {
        throw new AppError(409, 'DELETION_BLOCKED', 'Conclua antes de excluir', { detail: 'Você tem pedidos ou trocas em andamento.', extensions: { blockers } });
      }
      const now = new Date();
      const effectiveAt = new Date(now.getTime() + delayHours * 3_600_000);

      // Loja do dono sai do ar junto (encerrada); o estado anterior fica para o arrependimento.
      const [store] = await tx.select({ id: t.stores.id, status: t.stores.status }).from(t.stores).where(eq(t.stores.ownerUserId, userId)).for('update');
      if (store && store.status !== 'closed') {
        await tx.update(t.stores).set({ status: 'closed', updatedAt: now }).where(eq(t.stores.id, store.id));
        await tx.insert(t.storeStatusHistory).values({ storeId: store.id, fromStatus: store.status, toStatus: 'closed', actorId: userId, reason: 'Conta do dono excluída' });
      }

      const [deletion] = await tx
        .insert(accountDeletions)
        .values({ userId, via, effectiveAt, requestedAt: now, storeId: store?.id ?? null, storePreviousStatus: store && store.status !== 'closed' ? store.status : null, previousUserStatus })
        .returning();
      if (!deletion) throw new Error('Falha ao registrar a exclusão');

      await tx.update(t.users).set({ status: 'deleted', updatedAt: now }).where(eq(t.users.id, userId));
      // Efeito imediato (SEC-071): sessões e sockets, aparelhos de push, sacola e códigos/tickets abertos.
      await this.sessions.revokeSessions(tx, userId, 'account_deleted');
      await tx.delete(t.pushDevices).where(eq(t.pushDevices.userId, userId));
      await tx.delete(t.carts).where(eq(t.carts.userId, userId));
      await tx.delete(t.authCodes).where(eq(t.authCodes.userId, userId));
      await tx.delete(t.authTickets).where(eq(t.authTickets.userId, userId));
      // Sem dado pessoal na trilha: só a via, o prazo e o papel.
      await this.audit.record(tx, ctx, { action: 'account.deletion_requested', targetType: 'user', targetId: userId, after: { via, effectiveAt: effectiveAt.toISOString() }, actorId: userId, actorRole: 'customer' });
      return { deletion, email: user.email, effectiveAt };
    });

    if (result.deletion.storeId) await this.storefront.storeChanged(result.deletion.storeId); // DEC-113: a loja do dono sai do ar junto
    const immediate = result.effectiveAt.getTime() <= Date.now();
    if (immediate) {
      await this.anonymizeOne(result.deletion.id, result.email);
    } else {
      this.mail.enqueue({ to: result.email, ...accountDeletionRequestedEmail(result.effectiveAt) });
    }
    return { status: immediate ? 'completed' : 'pending', effectiveAt: result.effectiveAt.toISOString(), cancelableUntil: immediate ? null : result.effectiveAt.toISOString() };
  }

  /**
   * Arrependimento (WB-213, período configurável): e-mail e senha da conta fechada, antes de `effective_at`. A resposta de falha é a
   * mesma do login (não revela se a conta existe nem se está em exclusão).
   *
   * SEC-168/176: quem só sabe o e-mail NUNCA consegue bloquear o dono.
   * - Limite por IP + e-mail (5/h): 429 só para quem insiste do MESMO IP; outro IP não é afetado.
   * - Contador por e-mail (sem IP): conta as tentativas, mas acima de 10/h NÃO devolve 429. Ele liga o step-up: a senha certa passa a
   *   exigir também o código `delete_web` enviado ao e-mail (`403 LOGIN_CODE_REQUIRED`; reenviar e-mail, senha e `code`). Quem não tem a
   *   senha continua recebendo 401 genérico e nunca consome o limite de envio de códigos (o código só sai com a senha certa).
   * - O mesmo step-up vale com 5 falhas na conta (`lfa`, compartilhado com o login). E-mail não confirmado sob ataque: 401 genérico.
   */
  async cancel(email: string, password: string, ctx: RequestContext, code?: string): Promise<void> {
    const invalid = () => new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', { detail: 'E-mail ou senha incorretos.' });
    const ip = ctx.ip ?? 'unknown';
    const emailHash = sha256Hex(email);
    const key = `deletion-cancel:${emailHash}:${ip}`;
    const { count, ttlSeconds } = await this.limiter.hit(key, 3600);
    if (count > 5) throw errors.tooMany(ttlSeconds || 3600, 'Muitas tentativas. Tente novamente mais tarde.');
    // Conta antes, confere depois (SEC-117): requisições paralelas não furam o teto. Passar do limite liga o step-up, não o 429.
    const byEmail = await this.limiter.hit(`deletion-cancel:email:${emailHash}`, 3600);
    const emailUnderAttack = byEmail.count > 10;

    const [row] = await this.db
      .select({ user: t.users, deletion: accountDeletions })
      .from(t.users)
      .innerJoin(accountDeletions, and(eq(accountDeletions.userId, t.users.id), eq(accountDeletions.status, 'pending')))
      .where(eq(t.users.email, email));
    // SEC-180 (4): conta pendente com o limite de tentativas estourado (e-mail ou conta) = sinal de ataque à loja: UM alerta à operação por exclusão,
    // mesmo que as tentativas tenham errado a senha. O alerta não leva dado pessoal (só o id da exclusão e as contagens).
    const stepUpLimit = await this.params.getNumber('login_stepup_falhas_h');
    const accountFails = row ? await this.limiter.peek(`lfa:${row.user.id}`) : { count: 0 };
    const underAttack = emailUnderAttack || accountFails.count >= stepUpLimit;
    if (row && underAttack) await this.alertOnce('account_deletion_under_attack', row.deletion.id, { accountFails: accountFails.count, emailAttempts: byEmail.count });
    const passwordOk = await this.passwords.verify(row?.user.passwordHash ?? null, password);
    if (!row || !passwordOk || row.deletion.effectiveAt <= new Date() || row.user.status !== 'deleted') {
      // SEC-168: a falha soma no contador POR CONTA (o mesmo do login, `lfa`), de qualquer origem; o step-up do login passa a valer aqui.
      if (row) await this.limiter.hit(`lfa:${row.user.id}`, 3600);
      throw invalid();
    }
    // Conta sob ataque (step-up do login ativo ou muitas tentativas no e-mail) não reabre só com a senha. E-mail confirmado: exige o
    // código enviado ao e-mail; não confirmado: a mesma resposta genérica de senha errada (nunca revela o motivo).
    if (underAttack) {
      if (row.user.emailVerifiedAt === null) throw invalid();
      if (!code) {
        // SEC-180 (1)(2): a senha está CERTA. O envio usa o orçamento de quem provou a senha (chave por conta, finalidade `delete_cancel`),
        // que quem só sabe o e-mail nunca consome; e, se o código anterior ainda vale, não se emite outro (não invalida o que o dono já recebeu).
        if (!(await this.codes.hasLiveCode(row.user.id, 'delete_cancel'))) {
          await this.codes.enforceSendLimits(row.user.id, 'delete_cancel', email, ctx, 'proved');
          await this.codes.issue(row.user.id, 'delete_cancel', email);
        }
        throw errors.forbidden('LOGIN_CODE_REQUIRED', 'Para sua segurança, confirme com o código enviado ao seu e-mail.');
      }
      await this.codes.verify(row.user.id, 'delete_cancel', code); // 400 `CODE_INVALID`/`CODE_EXPIRED`; uso único
    }

    const restored = await this.db.transaction((tx) => this.restoreInTx(tx, row.deletion, row.user.id, ctx, { actorId: row.user.id, actorRole: 'customer', action: 'account.deletion_cancelled' }));
    if (!restored) throw invalid();
    if (row.deletion.storeId) await this.storefront.storeChanged(row.deletion.storeId);
    await this.limiter.reset(key);
    await this.limiter.reset(`deletion-cancel:email:${emailHash}`); // o dono provou quem é: o ruído de terceiros não pesa mais
    this.mail.enqueue({ to: row.user.email, ...accountDeletionCancelledEmail(row.deletion.previousUserStatus === 'blocked') });
  }

  /**
   * Reabre a conta de uma exclusão `pending` (e a loja do dono, se foi encerrada com ela). Usado pelo próprio dono (`cancel`) e pela operação
   * (`cancelByOperator`). Falso se a exclusão já não está `pending` ou o prazo de arrependimento acabou.
   */
  private async restoreInTx(
    tx: DbOrTx,
    deletion: typeof accountDeletions.$inferSelect,
    userId: string,
    ctx: RequestContext,
    audit: { actorId: string | null; actorRole: string; action: string; reason?: string; after?: Record<string, unknown> },
  ): Promise<boolean> {
    const [done] = await tx
      .update(accountDeletions)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(and(eq(accountDeletions.id, deletion.id), eq(accountDeletions.status, 'pending'), sql`${accountDeletions.effectiveAt} > now()`))
      .returning({ id: accountDeletions.id });
    if (!done) return false;
    // SEC-182: volta ao status de ANTES (bloqueada continua bloqueada): "excluir e desistir" não fura o bloqueio.
    await tx.update(t.users).set({ status: deletion.previousUserStatus, updatedAt: new Date() }).where(eq(t.users.id, userId));
    if (deletion.storeId && deletion.storePreviousStatus) {
      await tx.update(t.stores).set({ status: deletion.storePreviousStatus as 'approved', updatedAt: new Date() }).where(and(eq(t.stores.id, deletion.storeId), eq(t.stores.status, 'closed')));
      await tx.insert(t.storeStatusHistory).values({ storeId: deletion.storeId, fromStatus: 'closed', toStatus: deletion.storePreviousStatus as 'approved', actorId: audit.actorId, reason: 'Exclusão da conta cancelada' });
    }
    await this.audit.record(tx, ctx, { action: audit.action, targetType: 'user', targetId: userId, actorId: audit.actorId, actorRole: audit.actorRole, ...(audit.reason ? { reason: audit.reason } : {}), ...(audit.after ? { after: audit.after } : {}) });
    return true;
  }

  /**
   * SEC-180 (3): rede de segurança da operação (CLI `privacy:cancel-deletion`, nunca rota HTTP). Reabre a conta de uma exclusão `pending` a pedido do
   * dono, com a IDENTIDADE conferida fora do sistema (runbook-dsr.md, passo 5) e registrada: serve também para a conta com e-mail NÃO confirmado sob
   * ataque, que não tem caminho de volta pelo `cancel`. Zera os contadores de ataque da conta, avisa o dono por e-mail e audita (ator `cli`).
   */
  async cancelByOperator(input: { email: string; confirmEmail: string; reason: string; identityProof: string; dryRun?: boolean; osUser: string; host: string }): Promise<{ dryRun: boolean; email: string; userId: string; storeRestored: boolean }> {
    const email = input.email.trim().toLowerCase();
    if (input.confirmEmail.trim().toLowerCase() !== email) throw new DeletionOpsError('CONFIRM_MISMATCH', 'O e-mail de confirmação não confere.');
    if (input.reason.trim().length < 20) throw new DeletionOpsError('REASON_TOO_SHORT', 'O motivo precisa ter pelo menos 20 caracteres.');
    if (input.identityProof.trim().length < 10) throw new DeletionOpsError('IDENTITY_PROOF_REQUIRED', 'Descreva como a identidade foi conferida (protocolo do atendimento, runbook-dsr.md): pelo menos 10 caracteres.');
    const [row] = await this.db
      .select({ user: t.users, deletion: accountDeletions })
      .from(t.users)
      .innerJoin(accountDeletions, and(eq(accountDeletions.userId, t.users.id), eq(accountDeletions.status, 'pending')))
      .where(eq(t.users.email, email));
    if (!row || row.user.status !== 'deleted') throw new DeletionOpsError('NO_PENDING_DELETION', 'Não há exclusão pendente para este e-mail.');
    if (row.deletion.effectiveAt <= new Date()) throw new DeletionOpsError('DELETION_DUE', 'O prazo de arrependimento já acabou: a anonimização é irreversível.');
    const storeRestored = row.deletion.storeId !== null && row.deletion.storePreviousStatus !== null;
    if (input.dryRun) return { dryRun: true, email, userId: row.user.id, storeRestored };
    const ctx: RequestContext = { ip: null, userAgent: 'cli', requestId: null, deviceId: null, principal: null };
    this.logger.warn(`privacy:cancel-deletion executado (operador do SO ${input.osUser}@${input.host})`);
    const restored = await this.db.transaction((tx) =>
      this.restoreInTx(tx, row.deletion, row.user.id, ctx, {
        actorId: null,
        actorRole: 'cli',
        action: 'account.deletion_cancelled_by_operator',
        reason: input.reason.trim(),
        after: { identityProof: input.identityProof.trim().slice(0, 200), osUser: input.osUser, host: input.host },
      }),
    );
    if (!restored) throw new DeletionOpsError('DELETION_DUE', 'A exclusão mudou enquanto o comando rodava (cancelada ou anonimizada).');
    if (row.deletion.storeId) await this.storefront.storeChanged(row.deletion.storeId);
    await this.limiter.reset(`lfa:${row.user.id}`);
    await this.limiter.reset(`deletion-cancel:email:${sha256Hex(email)}`);
    this.mail.enqueue({ to: row.user.email, ...accountDeletionCancelledEmail(row.deletion.previousUserStatus === 'blocked') });
    return { dryRun: false, email, userId: row.user.id, storeRestored };
  }

  // ------------------------------------------------------------- anonimização

  /** Job (1 min): anonimiza as exclusões cujo prazo venceu; falha de uma não trava as outras (tenta de novo no ciclo seguinte). */
  async processDue(now = new Date()): Promise<{ completed: number; postponed: number; failed: number }> {
    const due = await this.db
      .select({ id: accountDeletions.id })
      .from(accountDeletions)
      .where(and(eq(accountDeletions.status, 'pending'), lte(accountDeletions.effectiveAt, now)))
      .limit(50);
    const totals = { completed: 0, postponed: 0, failed: 0 };
    for (const { id } of due) {
      try {
        const outcome = await this.anonymizeOne(id, null);
        totals[outcome] += 1;
      } catch (error) {
        totals.failed += 1;
        const message = safeErrorMessage(error).slice(0, 300);
        this.logger.error(`anonimização falhou (${id}): ${message}`);
        const [updated] = await this.db.update(accountDeletions).set({ lastError: message, failures: sql`${accountDeletions.failures} + 1` }).where(eq(accountDeletions.id, id)).returning({ failures: accountDeletions.failures });
        // SEC-160: falha repetida não fica em silêncio; o prazo da LGPD (`exclusao_anonimizacao_dias`) pode estourar sem ninguém saber.
        if ((updated?.failures ?? 0) >= FAILURES_BEFORE_ALERT) await this.alertOnce('account_deletion_failed', id, { failures: updated?.failures ?? 0 });
      }
    }
    await this.alertOverdue(now);
    return totals;
  }

  /**
   * SEC-160: exclusão ainda `pending` a 2 dias do teto de `exclusao_anonimizacao_dias` (bloqueada, adiada ou com falha) alerta o admin,
   * uma vez por exclusão. Sem dado pessoal no alerta: só o id da exclusão e os prazos.
   */
  async alertOverdue(now = new Date()): Promise<number> {
    const days = await this.params.getNumber('exclusao_anonimizacao_dias');
    const limitMs = Math.max(0, days - OVERDUE_WARNING_DAYS) * 86_400_000;
    const late = await this.db
      .select({ id: accountDeletions.id, requestedAt: accountDeletions.requestedAt })
      .from(accountDeletions)
      .where(and(eq(accountDeletions.status, 'pending'), lte(accountDeletions.requestedAt, new Date(now.getTime() - limitMs))))
      .limit(50);
    let raised = 0;
    for (const row of late) if (await this.alertOnce('account_deletion_overdue', row.id, { requestedAt: row.requestedAt.toISOString(), anonymizationDays: days })) raised += 1;
    return raised;
  }

  private async alertOnce(kind: string, deletionId: string, details: Record<string, unknown>): Promise<boolean> {
    const [open] = await this.db.select({ id: t.paymentAlerts.id }).from(t.paymentAlerts).where(and(eq(t.paymentAlerts.kind, kind), sql`${t.paymentAlerts.details}->>'deletionId' = ${deletionId}`));
    if (open) return false;
    await this.db.insert(t.paymentAlerts).values({ kind, details: { deletionId, ...details } });
    this.logger.warn(`alerta de privacidade: ${kind}`);
    return true;
  }

  /**
   * Apaga e anonimiza tudo de UMA conta, numa transação. Idempotente (a linha de `account_deletions` é travada e só vale `pending`).
   * Arquivos (fotos de troca, exportações) saem do storage ANTES da transação: apagar objeto já apagado é no-op, então a nova
   * tentativa depois de uma falha termina o serviço sem deixar arquivo órfão.
   */
  async anonymizeOne(deletionId: string, knownEmail: string | null): Promise<'completed' | 'postponed'> {
    const [deletion] = await this.db.select().from(accountDeletions).where(and(eq(accountDeletions.id, deletionId), eq(accountDeletions.status, 'pending')));
    if (!deletion) return 'completed';
    const userId = deletion.userId;

    // Corrida rara: um pedido nasceu entre o fechamento e agora. Não anonimiza endereço de entrega em uso: adia 1 h.
    const open = await this.blockers(userId);
    if (open.length > 0) {
      await this.db.update(accountDeletions).set({ effectiveAt: new Date(Date.now() + 3_600_000), lastError: 'blockers_open' }).where(eq(accountDeletions.id, deletionId));
      return 'postponed';
    }

    const [user] = await this.db.select({ email: t.users.email }).from(t.users).where(eq(t.users.id, userId));
    const originalEmail = knownEmail ?? user?.email ?? null;

    const photos = await this.db
      .select({ id: t.mediaAssets.id, objectKey: t.mediaAssets.objectKey, variants: t.mediaAssets.variants })
      .from(t.mediaAssets)
      .where(and(eq(t.mediaAssets.ownerUserId, userId), eq(t.mediaAssets.purpose, 'exchange_photo')));
    const exportFiles = await this.db.select({ id: dataExports.id, objectKey: dataExports.objectKey }).from(dataExports).where(eq(dataExports.userId, userId));
    for (const photo of photos) {
      await this.storage.deleteObject('private', photo.objectKey);
      for (const key of Object.values(photo.variants ?? {})) await this.storage.deleteObject('public', key);
    }
    // SEC-164: a chave é calculada pelo id (determinística), não só pelo `objectKey` gravado: o arquivo enviado antes de uma falha do banco também some.
    for (const file of exportFiles) {
      if (file.objectKey) await this.storage.deleteObject('private', file.objectKey);
      await this.storage.deleteObject('private', `exports/${userId}/${file.id}.json`).catch(() => undefined);
    }

    const summary: Record<string, number> = {};
    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select({ status: accountDeletions.status }).from(accountDeletions).where(eq(accountDeletions.id, deletionId)).for('update');
      if (locked?.status !== 'pending') return;
      const count = async (name: string, rows: Promise<unknown[]>): Promise<void> => {
        summary[name] = (await rows).length;
      };
      const now = new Date();

      await count('addresses', tx.delete(t.userAddresses).where(eq(t.userAddresses.userId, userId)).returning({ id: t.userAddresses.id }));
      await count('favorites', tx.delete(t.favorites).where(eq(t.favorites.userId, userId)).returning({ id: t.favorites.id }));
      await count('searchHistory', tx.delete(t.searchHistory).where(eq(t.searchHistory.userId, userId)).returning({ userId: t.searchHistory.userId }));
      await count('carts', tx.delete(t.carts).where(eq(t.carts.userId, userId)).returning({ id: t.carts.id }));
      await count('pushDevices', tx.delete(t.pushDevices).where(eq(t.pushDevices.userId, userId)).returning({ id: t.pushDevices.id }));
      await count('sessions', tx.delete(t.sessions).where(eq(t.sessions.userId, userId)).returning({ id: t.sessions.id }));
      await tx.delete(t.authCodes).where(eq(t.authCodes.userId, userId));
      await tx.delete(t.authTickets).where(eq(t.authTickets.userId, userId));
      await tx.delete(t.paymentOauthStates).where(eq(t.paymentOauthStates.userId, userId));
      await count('staffMemberships', tx.delete(t.storeMembers).where(and(eq(t.storeMembers.userId, userId), eq(t.storeMembers.role, 'staff'))).returning({ userId: t.storeMembers.userId }));
      if (originalEmail) await tx.delete(t.invitations).where(eq(t.invitations.email, originalEmail));

      // DEC-063 (a)/(b): cupom pessoal (compensação por atraso) NÃO usado é apagado, junto com os resgates já liberados dele; o USADO fica só
      // como registro de resgate do pedido (a casca anonimizada). `push_campaign_recipients`: as linhas por destinatário saem; os totais da
      // campanha (contadores em `push_campaigns`) ficam.
      const unusedPersonal = sql`select c.id from coupons c where c.owner_user_id = ${userId}::uuid and not exists (select 1 from coupon_redemptions r where r.coupon_id = c.id and r.released_at is null)`;
      await tx.execute(sql`delete from coupon_redemptions where coupon_id in (${unusedPersonal})`);
      summary.personalCouponsDeleted = (await tx.execute(sql`delete from coupons where id in (${unusedPersonal}) returning 1`)).rows.length;
      await count('pushCampaignRecipients', tx.delete(t.pushCampaignRecipients).where(eq(t.pushCampaignRecipients.userId, userId)).returning({ id: t.pushCampaignRecipients.id }));

      // Consentimento e aceite (`consents`, `terms_acceptances`) são PROVA append-only (trigger do banco; LGPD art. 7, I e 8, § 2): ficam
      // ligados à casca anonimizada do usuário e não identificam a pessoa sem os outros dados, que acabaram de sair. [validar com o jurídico]

      // Pedidos ficam (fiscal) sem identificar a pessoa: o endereço vira cidade/UF. Contato da corrida e nota do operador somem (DT-052).
      await count(
        'ordersAnonymized',
        tx
          .update(t.orders)
          .set({ address: sql`case when ${t.orders.address} is null then null else jsonb_strip_nulls(jsonb_build_object('city', ${t.orders.address}->'city', 'state', ${t.orders.address}->'state', 'cityId', ${t.orders.address}->'cityId')) end` })
          .where(eq(t.orders.userId, userId))
          .returning({ id: t.orders.id }),
      );
      await count(
        'deliveriesCleared',
        tx
          .update(t.deliveries)
          .set({ contact: null, note: null, piiClearedAt: now })
          .where(inArray(t.deliveries.orderId, tx.select({ id: t.orders.id }).from(t.orders).where(eq(t.orders.userId, userId))))
          .returning({ id: t.deliveries.id }),
      );
      await count('exchangesCleared', tx.update(t.exchangeRequests).set({ description: null, contestationText: null, photoIds: [] }).where(eq(t.exchangeRequests.userId, userId)).returning({ id: t.exchangeRequests.id }));
      if (photos.length > 0) await tx.delete(t.mediaAssets).where(inArray(t.mediaAssets.id, photos.map((p) => p.id)));
      summary.photos = photos.length;
      await count('reviewsCleared', tx.update(t.reviews).set({ comment: null }).where(eq(t.reviews.userId, userId)).returning({ id: t.reviews.id }));

      // SEC-158: texto livre do titular (e o que cita o titular) não fica ligado à casca. Motivos de cancelamento do cliente, texto da
      // denúncia, resposta da loja à avaliação dele, motivo de cancelamento da troca e as respostas dos pedidos de titular.
      const ownOrders = tx.select({ id: t.orders.id }).from(t.orders).where(eq(t.orders.userId, userId));
      await count('orderReasonsCleared', tx.update(t.orders).set({ cancelReason: null }).where(and(eq(t.orders.userId, userId), eq(t.orders.cancelledBy, 'customer'))).returning({ id: t.orders.id }));
      await count('orderEventReasonsCleared', tx.update(t.orderEvents).set({ reason: null }).where(and(inArray(t.orderEvents.orderId, ownOrders), sql`(${t.orderEvents.actor} = 'customer' or ${t.orderEvents.actorUserId} = ${userId}::uuid)`, sql`${t.orderEvents.reason} is not null`)).returning({ id: t.orderEvents.id }));
      await count('exchangeEventReasonsCleared', tx.update(t.exchangeEvents).set({ reason: null }).where(and(inArray(t.exchangeEvents.exchangeId, tx.select({ id: t.exchangeRequests.id }).from(t.exchangeRequests).where(eq(t.exchangeRequests.userId, userId))), sql`(${t.exchangeEvents.actor} = 'customer' or ${t.exchangeEvents.actorUserId} = ${userId}::uuid)`, sql`${t.exchangeEvents.reason} is not null`)).returning({ id: t.exchangeEvents.id }));
      await tx.update(t.orderCancelRequests).set({ reason: null, decisionNote: null }).where(inArray(t.orderCancelRequests.orderId, ownOrders));
      await count('reportsCleared', tx.update(t.contentReports).set({ text: null }).where(and(eq(t.contentReports.reporterId, userId), sql`${t.contentReports.text} is not null`)).returning({ id: t.contentReports.id }));
      await count('storeRepliesCleared', tx.update(t.reviews).set({ storeReply: null }).where(and(eq(t.reviews.userId, userId), sql`${t.reviews.storeReply} is not null`)).returning({ id: t.reviews.id }));
      await tx.update(privacyRequests).set({ answer: sql`case when ${privacyRequests.answer} is null then null else '[anonimizado]' end` }).where(eq(privacyRequests.userId, userId));
      await tx.update(privacyRequestEvents).set({ note: sql`case when ${privacyRequestEvents.note} is null then null else '[anonimizado]' end` }).where(inArray(privacyRequestEvents.requestId, tx.select({ id: privacyRequests.id }).from(privacyRequests).where(eq(privacyRequests.userId, userId))));

      // SEC-159 / DEC-050(b): o IP do aceite e do consentimento é truncado (IPv4 /24, IPv6 /48), não apagado: a prova do consentimento
      // fica (versão, data, plataforma) sem identificar a pessoa. As tabelas são append-only; o trigger só admite este truncamento.
      // SEC-173: no aceite, o user agent antigo (`platform`) é reduzido à família da plataforma NA MESMA atualização (o trigger exige as duas
      // mudanças juntas e só admite esta redução do próprio valor).
      const terms = await tx.execute(sql`update terms_acceptances set ip = webag_truncate_ip(ip), platform = webag_platform_family(platform) where user_id = ${userId}::uuid and ((ip is not null and ip is distinct from webag_truncate_ip(ip)) or (platform is not null and platform is distinct from webag_platform_family(platform))) returning 1`);
      summary.terms_acceptancesIpsTruncated = terms.rows.length;
      summary.termsAcceptancesPlatformReduced = terms.rows.length;
      const consentRows = await tx.execute(sql`update consents set ip = webag_truncate_ip(ip) where user_id = ${userId}::uuid and ip is not null and ip is distinct from webag_truncate_ip(ip) returning 1`);
      summary.consentsIpsTruncated = consentRows.rows.length;

      // Exportações e pedidos de titular da conta: o arquivo e os links somem; o protocolo fica sem o e-mail e a mensagem.
      await tx.delete(dataExportLinks).where(inArray(dataExportLinks.exportId, tx.select({ id: dataExports.id }).from(dataExports).where(eq(dataExports.userId, userId))));
      await tx.delete(dataExports).where(eq(dataExports.userId, userId));
      await tx.update(privacyRequests).set({ requesterEmail: '[anonimizado]', message: null }).where(eq(privacyRequests.userId, userId));

      // Loja do dono encerrada: contato público e endereço saem; CPF/CNPJ, razão social e documentos ficam pelo prazo fiscal.
      if (deletion.storeId) {
        await tx.update(t.stores).set({ phone: null, whatsapp: null, addressCep: null, addressStreet: null, addressNumber: null, addressComplement: null, lat: null, lng: null, description: null, updatedAt: now }).where(eq(t.stores.id, deletion.storeId));
      }

      const tombstone = `deleted-${userId}@anon.webag.invalid`;
      await tx
        .update(t.users)
        .set({ email: tombstone, name: 'Conta excluída', phone: null, passwordHash: null, emailVerifiedAt: null, adultDeclaredAt: null, lastLoginAt: null, status: 'deleted', updatedAt: now })
        .where(eq(t.users.id, userId));
      await tx.update(accountDeletions).set({ status: 'completed', completedAt: now, summary, lastError: null }).where(eq(accountDeletions.id, deletionId));
      await this.audit.record(tx, SYSTEM_CTX, { action: 'account.anonymized', targetType: 'user', targetId: userId, after: summary, actorId: null, actorRole: 'system' });
    });

    if (originalEmail) this.mail.enqueue({ to: originalEmail, ...accountDeletedEmail() });
    return 'completed';
  }
}

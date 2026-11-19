import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import * as t from '../../platform/database/schema.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { ParametersService } from '../admin/index.js';
import { CodeService, PasswordService, TicketService } from '../identity/index.js';
import { AccountDeletionService, type DeletionOutcome } from './account-deletion.service.js';

export const DELETE_TICKET_TTL_SECONDS = 600;
const TICKET_MAX_ATTEMPTS = 10;

const INVALID = () => new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', { detail: 'E-mail ou senha incorretos.' });
const TICKET_GONE = () => errors.gone('DELETE_TICKET_INVALID', 'Pedido vencido ou já usado', 'Comece de novo pela página de exclusão de conta.');

/**
 * WB-214 / SEC-096: exclusão de conta pela web (exigência do Google Play), sem sessão. Duas vias que terminam em um `delete_ticket`
 * (256 bits, 10 min, uso único, ligado à conta) que só abre os passos de revisão e confirmação:
 *  A) código `delete_web` enviado SÓ se a conta existe e o e-mail está confirmado;
 *  B) e-mail + senha (única via com e-mail não confirmado).
 * O passo 1 responde igual para conta inexistente, não confirmada ou confirmada. Admin nunca é excluído por aqui. Nenhuma sessão nem
 * access token é emitido. Limite de 5 por hora por IP e por e-mail (WB-214 C5).
 */
@Injectable()
export class WebAccountDeletionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly codes: CodeService,
    private readonly tickets: TicketService,
    private readonly passwords: PasswordService,
    private readonly params: ParametersService,
    private readonly limiter: RateLimitService,
    private readonly deletion: AccountDeletionService,
  ) {}

  private async find(email: string) {
    const [user] = await this.db.select().from(t.users).where(eq(t.users.email, email));
    if (!user) return null;
    const [admin] = await this.db.select({ id: t.adminProfiles.userId }).from(t.adminProfiles).where(eq(t.adminProfiles.userId, user.id));
    return { user, isAdmin: admin !== undefined };
  }

  private async limits(email: string, ctx: RequestContext): Promise<void> {
    await this.limiter.enforce(`delweb:ip:${ctx.ip ?? 'unknown'}`, 5, 3600);
    await this.limiter.enforce(`delweb:email:${sha256Hex(email)}`, 5, 3600);
  }

  /** Passo 1 da via A: pede o código. Resposta sempre igual. */
  async requestCode(email: string, ctx: RequestContext): Promise<void> {
    await this.limits(email, ctx);
    // SEC-152: os limites de envio rodam ANTES de achar a conta, para TODO e-mail. Senão o 2º pedido em 60 s daria 429 só para
    // conta confirmada e 200 para e-mail inexistente (enumeração de clientes e lojistas).
    await this.codes.enforceSendLimits(sha256Hex(email), 'delete_web', email, ctx);
    const found = await this.find(email);
    if (!found || found.isAdmin || found.user.status !== 'active' || found.user.emailVerifiedAt === null) return; // SEC-096: nada é enviado
    await this.codes.issue(found.user.id, 'delete_web', email);
  }

  /** Passo 2 da via A: o código vira um `delete_ticket`. Qualquer falha: 400 `CODE_INVALID` (igual para conta inexistente). */
  async verifyCode(email: string, code: string, ctx: RequestContext): Promise<{ deleteTicket: string; expiresIn: number }> {
    await this.limiter.enforce(`delweb:verify:${ctx.ip ?? 'unknown'}`, 20, 3600);
    const found = await this.find(email);
    if (!found || found.isAdmin || found.user.status !== 'active' || found.user.emailVerifiedAt === null) {
      throw new AppError(400, 'CODE_INVALID', 'Código incorreto', { detail: 'Confira o código ou peça um novo.' });
    }
    await this.codes.verify(found.user.id, 'delete_web', code);
    return { deleteTicket: await this.tickets.issue('account_delete', found.user.id, DELETE_TICKET_TTL_SECONDS, { emailVerified: true }), expiresIn: DELETE_TICKET_TTL_SECONDS };
  }

  /** Via B: e-mail + senha. Erro de senha e e-mail inexistente dão a mesma resposta; as falhas contam no limite do login. */
  async withPassword(email: string, password: string, ctx: RequestContext): Promise<{ deleteTicket: string; expiresIn: number }> {
    await this.limits(email, ctx);
    const maxFails = await this.params.getNumber('login_falhas');
    const waitSeconds = (await this.params.getNumber('login_espera_min')) * 60;
    const key = `lf:${sha256Hex(email)}:${ctx.ip ?? 'unknown'}`;
    const attempt = await this.limiter.hit(key, waitSeconds);
    if (attempt.count > maxFails) throw errors.tooMany(attempt.ttlSeconds || waitSeconds, 'Muitas tentativas. Tente novamente mais tarde.');

    const found = await this.find(email);
    const ok = await this.passwords.verify(found?.user.passwordHash ?? null, password);
    // Admin, conta que não está ativa ou sem senha: a mesma resposta de senha errada (nunca revela o motivo).
    if (!found || !ok || found.isAdmin || found.user.status !== 'active') {
      if (attempt.count >= maxFails) await this.limiter.setWindow(key, waitSeconds);
      // SEC-153: a falha soma no contador POR CONTA (o mesmo do login), de qualquer origem, para o step-up proteger também a exclusão.
      if (found && !found.isAdmin) await this.limiter.hit(`lfa:${found.user.id}`, 3600);
      throw INVALID();
    }
    // SEC-153: conta sob ataque (step-up ativo) não é excluída só com a senha. Com e-mail confirmado, vale a via A (código); sem
    // e-mail confirmado, a mesma resposta genérica de senha errada.
    const accountFails = await this.limiter.peek(`lfa:${found.user.id}`);
    if (accountFails.count >= (await this.params.getNumber('login_stepup_falhas_h'))) {
      if (found.user.emailVerifiedAt === null) throw INVALID();
      throw errors.forbidden('LOGIN_CODE_REQUIRED', 'Para sua segurança, confirme a exclusão pelo código enviado ao seu e-mail.');
    }
    await this.limiter.release(key);
    return { deleteTicket: await this.tickets.issue('account_delete', found.user.id, DELETE_TICKET_TTL_SECONDS), expiresIn: DELETE_TICKET_TTL_SECONDS };
  }

  /** Passo 3: o que será apagado e o que bloqueia (a pessoa provou ser a dona, então já pode ver os bloqueios). */
  async review(rawTicket: string) {
    const ticket = await this.tickets.attempt('account_delete', rawTicket, TICKET_MAX_ATTEMPTS);
    if (!ticket) throw TICKET_GONE();
    const [blockers, anonymizationDays, fiscalYears, regretHours, [store]] = await Promise.all([
      this.deletion.blockers(ticket.userId),
      this.params.getNumber('exclusao_anonimizacao_dias'),
      this.params.getNumber('retencao_fiscal_anos'),
      this.params.getNumber('exclusao_arrependimento_horas'),
      this.db.select({ id: t.stores.id }).from(t.stores).where(eq(t.stores.ownerUserId, ticket.userId)),
    ]);
    return { canDelete: blockers.length === 0, blockers, hasPassword: true, ownsStore: store !== undefined, anonymizationDays, fiscalRetentionYears: fiscalYears, regretHours: Math.min(regretHours, anonymizationDays * 24) };
  }

  /** Passo final: consome o ticket (uso único) e fecha a conta como no app. Nenhuma sessão é emitida. */
  async confirm(rawTicket: string, ctx: RequestContext): Promise<DeletionOutcome> {
    const ticket = await this.tickets.attempt('account_delete', rawTicket, TICKET_MAX_ATTEMPTS);
    if (!ticket) throw TICKET_GONE();
    const blockers = await this.deletion.blockers(ticket.userId);
    if (blockers.length > 0) {
      // Bloqueado: o ticket continua valendo (a pessoa pode concluir os pedidos e voltar dentro dos 10 min).
      throw new AppError(409, 'DELETION_BLOCKED', 'Conclua antes de excluir', { detail: 'Você tem pedidos ou trocas em andamento.', extensions: { blockers } });
    }
    if (!(await this.tickets.consume(ticket.id))) throw TICKET_GONE();
    return this.deletion.closeAccount(ticket.userId, ctx, 'web');
  }
}


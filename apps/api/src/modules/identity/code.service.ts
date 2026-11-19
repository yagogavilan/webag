import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { hmacHex, safeEqual, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { codeEmail } from '../../platform/mail/templates.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { ParametersService } from '../admin/index.js';
import { authCodes, type CodePurpose } from './db/schema.js';

/**
 * Códigos de 6 dígitos por e-mail (SEC-002, SEC-003, HIP-022).
 * `randomInt` (CSPRNG), guardado como HMAC com chave do servidor, ligado a (usuário, finalidade),
 * 10 min, uso único, 5 tentativas; um novo código invalida o anterior.
 */
@Injectable()
export class CodeService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
    private readonly params: ParametersService,
    private readonly limiter: RateLimitService,
    private readonly mail: MailService,
  ) {}

  private hash(userId: string, purpose: CodePurpose, code: string): string {
    return hmacHex(this.config.get('CODE_HMAC_KEY', { infer: true }), `code:${userId}:${purpose}:${code}`);
  }

  /**
   * Aplica os limites de envio (SEC-003, SEC-180). Três orçamentos, que NUNCA se consomem entre si:
   *  - `session` (padrão): quem já está logado (confirmar e-mail, trocar e-mail). `ownerKey` = userId.
   *  - `anonymous`: fluxos sem login ("esqueci a senha", via A da exclusão). `ownerKey` = hash do e-mail, que existindo ou não a conta não muda a
   *    resposta. Os limites são por IP + e-mail: quem só sabe o e-mail esgota o orçamento do PRÓPRIO IP, nunca o de outro IP nem o de quem provou a senha.
   *  - `proved`: quem acabou de provar a senha certa (desistir da exclusão, step-up do login). `ownerKey` = userId; as chaves (e o limite por IP)
   *    são próprias, então nenhum terceiro que só sabe o e-mail consegue consumir isto e travar o dono (SEC-180).
   * O 429 de IP (`code:ip:*`) continua protegendo contra o volume de um mesmo IP.
   */
  async enforceSendLimits(ownerKey: string, purpose: CodePurpose, destinationEmail: string, ctx: RequestContext, mode: 'session' | 'anonymous' | 'proved' = 'session'): Promise<void> {
    const ip = ctx.ip ?? 'unknown';
    const scope = mode === 'proved' ? `proved:${ownerKey}` : mode === 'anonymous' ? `anon:${ownerKey}:${ip}` : ownerKey;
    const interval = await this.params.getNumber('otp_reenvio_s');
    const wait = await this.limiter.hit(`code:int:${scope}:${purpose}`, interval);
    if (wait.count > 1) throw errors.tooMany(wait.ttlSeconds, 'Aguarde um pouco antes de pedir outro código.');
    await this.limiter.enforce(`code:h:${scope}:${purpose}`, 5, 3600);
    await this.limiter.enforce(`code:ip:${mode === 'proved' ? 'proved:' : ''}${ip}`, 30, 3600);
    const destination = sha256Hex(destinationEmail);
    await this.limiter.enforce(`code:dest:${mode === 'proved' ? `proved:${ownerKey}` : mode === 'anonymous' ? `anon:${destination}:${ip}` : destination}`, 10, 86_400);
  }

  /**
   * SEC-180 (2): há um código desta finalidade ainda válido (não usado, não vencido, com tentativas)? Quem chama NÃO emite outro: emitir
   * invalidaria o que o dono acabou de receber (um terceiro com a senha vazada não pode ficar "trocando" o código debaixo dele).
   */
  async hasLiveCode(userId: string, purpose: CodePurpose): Promise<boolean> {
    const maxAttempts = await this.params.getNumber('otp_tentativas');
    const [row] = await this.db
      .select({ id: authCodes.id })
      .from(authCodes)
      .where(and(eq(authCodes.userId, userId), eq(authCodes.purpose, purpose), isNull(authCodes.consumedAt), isNull(authCodes.invalidatedAt), gt(authCodes.expiresAt, new Date()), lt(authCodes.attempts, maxAttempts)))
      .limit(1);
    return row !== undefined;
  }

  /** Gera, grava (invalidando os anteriores) e envia. Não aplica limites: chame `enforceSendLimits` antes. */
  async issue(userId: string, purpose: CodePurpose, email: string): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const [validity] = await Promise.all([this.params.getNumber('otp_validade_min')]);
    await this.db.transaction(async (tx) => {
      await tx
        .update(authCodes)
        .set({ invalidatedAt: new Date() })
        .where(and(eq(authCodes.userId, userId), eq(authCodes.purpose, purpose), isNull(authCodes.consumedAt), isNull(authCodes.invalidatedAt)));
      await tx.insert(authCodes).values({
        userId,
        purpose,
        codeHash: this.hash(userId, purpose, code),
        destinationEmail: email,
        expiresAt: new Date(Date.now() + validity * 60_000),
      });
    });
    this.mail.enqueue({ to: email, ...codeEmail(code, validity) });
  }

  /** Invalida códigos ativos de uma finalidade (ex.: e-mail corrigido, WB-224 C4). */
  async invalidateActive(userId: string, purpose: CodePurpose): Promise<void> {
    await this.db
      .update(authCodes)
      .set({ invalidatedAt: new Date() })
      .where(and(eq(authCodes.userId, userId), eq(authCodes.purpose, purpose), isNull(authCodes.consumedAt), isNull(authCodes.invalidatedAt)));
  }

  /**
   * Confere e consome o código. Erros: 400 CODE_INVALID (errado, usado, invalidado, finalidade errada) ou
   * CODE_EXPIRED (vencido). A tentativa errada é gravada mesmo quando o erro é lançado.
   */
  async verify(userId: string, purpose: CodePurpose, code: string): Promise<void> {
    const maxAttempts = await this.params.getNumber('otp_tentativas');
    type Result = 'ok' | 'invalid' | 'expired';
    const result: Result = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(authCodes)
        .where(and(eq(authCodes.userId, userId), eq(authCodes.purpose, purpose), isNull(authCodes.consumedAt), isNull(authCodes.invalidatedAt)))
        .orderBy(desc(authCodes.createdAt))
        .limit(1)
        .for('update');
      if (!row) return 'invalid';
      if (row.expiresAt <= new Date()) return 'expired';
      if (row.attempts >= maxAttempts) return 'invalid';
      if (safeEqual(row.codeHash, this.hash(userId, purpose, code))) {
        await tx.update(authCodes).set({ consumedAt: new Date() }).where(eq(authCodes.id, row.id));
        return 'ok';
      }
      const attempts = row.attempts + 1;
      await tx
        .update(authCodes)
        .set({ attempts, ...(attempts >= maxAttempts ? { invalidatedAt: new Date() } : {}) })
        .where(eq(authCodes.id, row.id));
      return 'invalid';
    });
    if (result === 'expired') throw new AppError(400, 'CODE_EXPIRED', 'Código vencido', { detail: 'Peça um novo código.' });
    if (result === 'invalid') throw new AppError(400, 'CODE_INVALID', 'Código incorreto', { detail: 'Confira o código ou peça um novo.' });
  }
}

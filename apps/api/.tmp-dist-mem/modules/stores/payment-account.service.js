var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PaymentAccountService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { and, desc, eq, isNull, ne, gt, sql } from 'drizzle-orm';
import { MercadoPagoConfig, OAuth, User } from 'mercadopago';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { paymentAccountChangedEmail, paymentAccountUnderReviewEmail } from '../../platform/mail/templates.js';
import { AuditService } from '../admin/index.js';
import { isUniqueViolation } from '../admin/util.js';
import { adminProfiles, users } from '../identity/db/schema.js';
import { PaymentsService, SellerCredentialsRegistry } from '../payments/index.js';
import { paymentAccounts, paymentOauthStates } from './db/schema.js';
import { maskDocument, normalizeDocument } from './domain/document.js';
export const OAUTH_STATE_TTL_MS = 10 * 60_000;
const KEY_VERSION = 'k1';
export const PAYMENT_OAUTH_PROVIDER = Symbol('PAYMENT_OAUTH_PROVIDER');
/**
 * Provedor `fake` (WB-053 C5): o `code` escolhe o resultado.
 *   fake-ok                  conecta com titular = documento da loja
 *   fake-ok:<contaId>        idem, com um ID de conta específico (testa "1 conta = 1 loja")
 *   fake-holder:<documento>  titular com documento DIFERENTE do da loja (fica "em análise", SEC-047)
 *   fake-denied              o usuário negou a autorização
 */
let FakePaymentOAuthProvider = class FakePaymentOAuthProvider {
    config;
    name = 'fake';
    constructor(config) {
        this.config = config;
    }
    authorizationUrl(state, codeChallenge) {
        return `${this.config.get('API_PUBLIC_URL', { infer: true })}/fake-oauth/authorize?state=${encodeURIComponent(state)}${codeChallenge ? `&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256` : ''}`;
    }
    exchange(code, context) {
        if (code === 'fake-denied')
            throw new AppError(422, 'OAUTH_DENIED', 'Autorização negada', { detail: 'Você não autorizou a conexão. Tente de novo quando quiser.' });
        const [kind, arg] = code.split(/:(.*)/s);
        if (kind !== 'fake-ok' && kind !== 'fake-holder')
            throw new AppError(400, 'OAUTH_CODE_INVALID', 'Código de autorização inválido');
        return Promise.resolve({
            providerAccountId: kind === 'fake-ok' && arg ? arg : `fake-seller-${context.storeId}`,
            holderDocument: kind === 'fake-holder' && arg ? normalizeDocument(arg) : context.storeDocument,
            accessToken: `fake-access-${randomToken(12)}`,
            refreshToken: `fake-refresh-${randomToken(12)}`,
            expiresAt: new Date(Date.now() + 180 * 86_400_000),
        });
    }
    refresh() {
        return Promise.resolve({ accessToken: `fake-access-${randomToken(12)}`, refreshToken: `fake-refresh-${randomToken(12)}`, expiresAt: new Date(Date.now() + 180 * 86_400_000) });
    }
};
FakePaymentOAuthProvider = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ConfigService])
], FakePaymentOAuthProvider);
export { FakePaymentOAuthProvider };
/**
 * OAuth do Mercado Pago (split, ADR-002 §1) com o SDK oficial. `redirect_uri` vem do ambiente, nunca da requisição
 * (SEC-045). O titular da conta vem de `GET /users/me` com o token do lojista [confirmar no sandbox: campo `identification`].
 */
let MercadoPagoOAuthProvider = class MercadoPagoOAuthProvider {
    config;
    name = 'mercadopago';
    constructor(config) {
        this.config = config;
    }
    creds() {
        const clientId = this.config.get('MP_CLIENT_ID', { infer: true });
        const clientSecret = this.config.get('MP_CLIENT_SECRET', { infer: true });
        const redirectUri = this.config.get('MP_OAUTH_REDIRECT_URI', { infer: true });
        const platformToken = this.config.get('MP_ACCESS_TOKEN', { infer: true });
        if (!clientId || !clientSecret || !redirectUri || !platformToken)
            throw new AppError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Conexão com o Mercado Pago não configurada');
        return { clientId, clientSecret, redirectUri, platformToken };
    }
    authorizationUrl(state, codeChallenge) {
        const { clientId, redirectUri, platformToken } = this.creds();
        const url = new OAuth(new MercadoPagoConfig({ accessToken: platformToken })).getAuthorizationURL({ options: { client_id: clientId, redirect_uri: redirectUri, state } });
        // SEC-140: o SDK 3.6 não expõe PKCE; o desafio S256 entra na URL montada por ele.
        return codeChallenge ? `${url}${url.includes('?') ? '&' : '?'}code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256` : url;
    }
    async exchange(code, _context, codeVerifier) {
        const { clientId, clientSecret, redirectUri, platformToken } = this.creds();
        try {
            const tokens = await new OAuth(new MercadoPagoConfig({ accessToken: platformToken, options: { timeout: 8_000, maxRetries: 0 } })).create({ body: { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, ...(codeVerifier ? { code_verifier: codeVerifier } : {}) } });
            if (!tokens.access_token || !tokens.refresh_token || tokens.user_id === undefined)
                throw new Error('resposta de OAuth incompleta');
            const me = await new User(new MercadoPagoConfig({ accessToken: tokens.access_token, options: { timeout: 8_000, maxRetries: 1 } })).get();
            const holder = me.identification?.number ?? '';
            return {
                providerAccountId: String(tokens.user_id),
                holderDocument: holder,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiresAt: new Date(Date.now() + (tokens.expires_in ?? 15_552_000) * 1000),
            };
        }
        catch (error) {
            if (error instanceof AppError)
                throw error;
            const status = error.status;
            if (status !== undefined && status >= 400 && status < 500)
                throw new AppError(400, 'OAUTH_CODE_INVALID', 'Código de autorização inválido', { detail: 'O código expirou ou já foi usado. Conecte de novo.' });
            throw new AppError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Mercado Pago indisponível', { detail: 'Tente conectar de novo em instantes.', retryAfterSeconds: 10 });
        }
    }
    async refresh(refreshToken) {
        const { clientId, clientSecret, platformToken } = this.creds();
        const tokens = await new OAuth(new MercadoPagoConfig({ accessToken: platformToken, options: { timeout: 8_000, maxRetries: 0 } })).refresh({ body: { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken } });
        if (!tokens.access_token || !tokens.refresh_token)
            throw new Error('resposta de renovação incompleta');
        return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + (tokens.expires_in ?? 15_552_000) * 1000) };
    }
};
MercadoPagoOAuthProvider = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ConfigService])
], MercadoPagoOAuthProvider);
export { MercadoPagoOAuthProvider };
/** Conta de recebimento (WB-053, SEC-045..048). */
let PaymentAccountService = PaymentAccountService_1 = class PaymentAccountService {
    db;
    provider;
    config;
    audit;
    mail;
    payments;
    sellers;
    logger = new Logger(PaymentAccountService_1.name);
    constructor(db, provider, config, audit, mail, payments, sellers) {
        this.db = db;
        this.provider = provider;
        this.config = config;
        this.audit = audit;
        this.mail = mail;
        this.payments = payments;
        this.sellers = sellers;
    }
    onModuleInit() {
        this.sellers.register((storeId, accountId) => this.credentialsFor(storeId, accountId));
    }
    /**
     * Token do lojista para cobrar/estornar/consultar (só `active`). Renova sozinho quando faltam menos de 30 dias (DT-034):
     * lock por loja e gravação do par novo na mesma transação, porque o `refresh_token` antigo morre ao renovar.
     */
    async credentialsFor(storeId, accountId) {
        // SEC-130: com `accountId` (estorno/re-consulta de pagamento antigo) vale a conta que recebeu, mesmo `disconnected`
        // (o status desconectado bloqueia só cobrança nova); a mais recente das que têm esse ID, sempre da MESMA loja.
        const where = accountId
            ? and(eq(paymentAccounts.storeId, storeId), eq(paymentAccounts.providerAccountId, accountId), eq(paymentAccounts.provider, this.provider.name))
            : and(eq(paymentAccounts.storeId, storeId), eq(paymentAccounts.status, 'active'), eq(paymentAccounts.provider, this.provider.name));
        const [row] = await this.db.select().from(paymentAccounts).where(where).orderBy(desc(paymentAccounts.connectedAt)).limit(1);
        if (!row)
            return null;
        let tokens = this.openTokens(storeId, row.tokensEnc);
        if (row.tokensExpireAt && row.tokensExpireAt.getTime() - Date.now() < 30 * 86_400_000) {
            try {
                tokens = await this.db.transaction(async (tx) => {
                    await tx.execute(sql `select pg_advisory_xact_lock(hashtext(${`payment-token-refresh:${storeId}`}))`);
                    const [fresh] = await tx.select().from(paymentAccounts).where(eq(paymentAccounts.id, row.id));
                    if (!fresh)
                        return tokens;
                    if (fresh.tokensExpireAt && fresh.tokensExpireAt.getTime() - Date.now() >= 30 * 86_400_000)
                        return this.openTokens(storeId, fresh.tokensEnc); // outra instância já renovou
                    const renewed = await this.provider.refresh(this.openTokens(storeId, fresh.tokensEnc).refreshToken);
                    await tx.update(paymentAccounts).set({ tokensEnc: this.sealTokens(storeId, renewed), tokensExpireAt: renewed.expiresAt }).where(eq(paymentAccounts.id, row.id));
                    return renewed;
                });
            }
            catch (error) {
                // Ainda dentro da validade: segue com o token atual e alerta. Vencido: a cobrança falha e a loja precisa reconectar.
                this.logger.error(`renovação do token da loja ${storeId} falhou: ${safeErrorMessage(error)}`);
                await this.payments.raiseAlert(null, 'payment_token_refresh_failed', { storeId }).catch(() => undefined);
                if (row.tokensExpireAt && row.tokensExpireAt.getTime() <= Date.now())
                    return null;
            }
        }
        return { accessToken: tokens.accessToken, providerAccountId: row.providerAccountId };
    }
    get encKey() {
        return this.config.get('PAYMENT_TOKEN_ENC_KEY', { infer: true });
    }
    /** SEC-046: AES-256-GCM, AAD = loja + versão da chave. Trocar o texto entre lojas falha na decifragem. */
    sealTokens(storeId, tokens) {
        return encryptSecret(JSON.stringify(tokens), this.encKey, 'payment-oauth', `store:${storeId}:${KEY_VERSION}`);
    }
    openTokens(storeId, sealed) {
        return JSON.parse(decryptSecret(sealed, this.encKey, 'payment-oauth', `store:${storeId}:${KEY_VERSION}`));
    }
    /** Só 1 `state` ativo por loja: gerar um novo invalida o anterior (duplo toque, R-37b). */
    async startConnect(store, principal) {
        const state = randomToken(32);
        const stateHash = sha256Hex(state);
        // SEC-140: PKCE (S256). O verifier fica cifrado no banco até o callback; sem ele um `code` injetado não troca por token.
        const pkce = this.config.get('MP_OAUTH_PKCE', { infer: true }) !== false;
        const verifier = pkce ? randomToken(32) : null;
        const challenge = verifier ? createHash('sha256').update(verifier).digest('base64url') : undefined;
        await this.db.transaction(async (tx) => {
            await tx
                .update(paymentOauthStates)
                .set({ usedAt: new Date() })
                .where(and(eq(paymentOauthStates.storeId, store.id), isNull(paymentOauthStates.usedAt)));
            await tx.insert(paymentOauthStates).values({
                stateHash,
                storeId: store.id,
                userId: principal.userId,
                sessionId: principal.sessionId,
                codeVerifierEnc: verifier ? encryptSecret(verifier, this.encKey, 'payment-oauth-pkce', `state:${stateHash}`) : null,
                expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
            });
        });
        return { authorizationUrl: this.provider.authorizationUrl(state, challenge), state, expiresInSeconds: OAUTH_STATE_TTL_MS / 1000 };
    }
    /** O `state` precisa ser desta sessão E desta loja, de uso único e dentro de 10 min; senão nada é vinculado (SEC-045). */
    async completeConnect(store, principal, input, ctx) {
        const invalid = () => new AppError(400, 'OAUTH_STATE_INVALID', 'Link expirado', { detail: 'Link expirado. Conecte de novo.' });
        const consumed = await this.db
            .update(paymentOauthStates)
            .set({ usedAt: new Date() })
            .where(and(eq(paymentOauthStates.stateHash, sha256Hex(input.state)), eq(paymentOauthStates.storeId, store.id), eq(paymentOauthStates.userId, principal.userId), eq(paymentOauthStates.sessionId, principal.sessionId), isNull(paymentOauthStates.usedAt), gt(paymentOauthStates.expiresAt, new Date())))
            .returning({ id: paymentOauthStates.id, codeVerifierEnc: paymentOauthStates.codeVerifierEnc });
        if (consumed.length === 0)
            throw invalid();
        const verifier = consumed[0]?.codeVerifierEnc ? decryptSecret(consumed[0].codeVerifierEnc, this.encKey, 'payment-oauth-pkce', `state:${sha256Hex(input.state)}`) : undefined;
        const account = await this.provider.exchange(input.code, { storeId: store.id, storeDocument: store.documentNumber }, verifier);
        const matches = normalizeDocument(account.holderDocument) === store.documentNumber;
        try {
            await this.db.transaction(async (tx) => {
                // Reconectar substitui a conta anterior (a antiga fica `disconnected`).
                await tx.update(paymentAccounts).set({ status: 'disconnected', disconnectedAt: new Date() }).where(and(eq(paymentAccounts.storeId, store.id), ne(paymentAccounts.status, 'disconnected')));
                await tx.insert(paymentAccounts).values({
                    storeId: store.id,
                    provider: this.provider.name,
                    providerAccountId: account.providerAccountId,
                    status: matches ? 'active' : 'under_review',
                    holderDocumentMasked: maskDocument(account.holderDocument),
                    holderMatchesStore: matches,
                    tokensEnc: this.sealTokens(store.id, account),
                    tokensExpireAt: account.expiresAt,
                    connectedBy: principal.userId,
                });
                await this.audit.record(tx, ctx, { action: 'store.payment_account_connect', targetType: 'store', targetId: store.id, after: { provider: this.provider.name, holderMatchesStore: matches } });
            });
        }
        catch (error) {
            if (isUniqueViolation(error))
                throw errors.conflict('PAYMENT_ACCOUNT_IN_USE', 'Essa conta já está em uso por outra loja', 'Essa conta já está em uso por outra loja. Fale com o suporte.');
            throw error;
        }
        if (!matches)
            await this.alertTeam(store, 'payment_account_holder_mismatch');
        if (!matches)
            this.mail.enqueue({ to: principal.email, ...paymentAccountUnderReviewEmail() });
        return this.view(store.id);
    }
    /** Dados mascarados, só para o dono (SEC-048). Nunca devolve token nem o ID completo do titular. */
    async view(storeId) {
        const [row] = await this.db.select().from(paymentAccounts).where(and(eq(paymentAccounts.storeId, storeId), ne(paymentAccounts.status, 'disconnected')));
        if (!row)
            return { connected: false };
        return {
            connected: true,
            provider: row.provider,
            status: row.status,
            holderDocumentMasked: row.holderDocumentMasked,
            holderMatchesStore: row.holderMatchesStore,
            connectedAt: row.connectedAt.toISOString(),
        };
    }
    /** Trocar ou desconectar: senha <= 5 min (feito no controller), e-mail ao dono, auditoria e alerta ao admin (SEC-048). */
    async disconnect(store, principal, ctx) {
        const changed = await this.db.transaction(async (tx) => {
            const rows = await tx
                .update(paymentAccounts)
                .set({ status: 'disconnected', disconnectedAt: new Date() })
                .where(and(eq(paymentAccounts.storeId, store.id), ne(paymentAccounts.status, 'disconnected')))
                .returning({ id: paymentAccounts.id });
            if (rows.length === 0)
                return false;
            await this.audit.record(tx, ctx, { action: 'store.payment_account_disconnect', targetType: 'store', targetId: store.id });
            return true;
        });
        if (!changed)
            throw errors.notFound('Nenhuma conta conectada.');
        this.mail.enqueue({ to: principal.email, ...paymentAccountChangedEmail() });
        await this.alertTeam(store, 'payment_account_changed');
    }
    /** WB-103 C7: o admin libera (ou mantém bloqueada) uma conta "em análise" por titular divergente. */
    async release(storeId, adminUserId, reason, ctx) {
        await this.db.transaction(async (tx) => {
            const [row] = await tx.select().from(paymentAccounts).where(and(eq(paymentAccounts.storeId, storeId), eq(paymentAccounts.status, 'under_review'))).for('update');
            if (!row)
                throw errors.conflict('NO_ACCOUNT_UNDER_REVIEW', 'Não há conta em análise');
            await tx.update(paymentAccounts).set({ status: 'active', releasedBy: adminUserId, releaseReason: reason }).where(eq(paymentAccounts.id, row.id));
            await this.audit.record(tx, ctx, { action: 'store.payment_account_release', targetType: 'store', targetId: storeId, reason, after: { holderDocumentMasked: row.holderDocumentMasked } });
        });
    }
    /** SEC-047/048: alerta para financeiro/super admin (painel de alertas) e e-mail aos super admins, em até 1 min. */
    async alertTeam(store, kind) {
        await this.payments.raiseAlert(null, kind, { storeId: store.id }).catch(() => undefined);
        const rows = await this.db
            .select({ email: users.email })
            .from(adminProfiles)
            .innerJoin(users, eq(users.id, adminProfiles.userId))
            .where(and(eq(adminProfiles.profile, 'super_admin'), eq(adminProfiles.active, true)));
        for (const row of rows)
            this.mail.enqueue({ to: row.email, ...paymentAccountChangedEmail(store.name ?? store.id, true) });
    }
};
PaymentAccountService = PaymentAccountService_1 = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __param(1, Inject(PAYMENT_OAUTH_PROVIDER)),
    __metadata("design:paramtypes", [Object, Object, ConfigService,
        AuditService,
        MailService,
        PaymentsService,
        SellerCredentialsRegistry])
], PaymentAccountService);
export { PaymentAccountService };
//# sourceMappingURL=payment-account.service.js.map
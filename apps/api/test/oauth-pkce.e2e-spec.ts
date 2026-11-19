import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { PAYMENT_OAUTH_PROVIDER, type PaymentOAuthProvider } from '../src/modules/stores/payment-account.service.js';
import { paymentOauthStates } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs, reauth } from './helpers/fixtures.js';
import { shopWith } from './helpers/orders.js';

/** SEC-140: OAuth do lojista com PKCE (S256). */
describe('OAuth da conta de recebimento com PKCE (SEC-140)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });

  it('a URL leva só o desafio S256; o verifier fica cifrado no banco e vai ao provedor na troca do code', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 1_000, stock: 1 }]);
    const owner = shop.store.owner;
    const provider = ctx.app.get<PaymentOAuthProvider>(PAYMENT_OAUTH_PROVIDER);
    const exchange = vi.spyOn(provider, 'exchange');
    await reauth(ctx, owner);
    const start = await ctx.http.post(`/v1/stores/${shop.store.id}/payment-account/connect`).set(bearer(owner.accessToken)).send({}).expect(200);
    const url = new URL(start.body.authorizationUrl as string);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const challenge = url.searchParams.get('code_challenge')!;
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const [row] = await ctx.db.select().from(paymentOauthStates).where(eq(paymentOauthStates.storeId, shop.store.id));
    expect(row?.codeVerifierEnc).toMatch(/^v1\./); // cifrado, nunca em claro
    expect(JSON.stringify(start.body)).not.toContain('code_verifier');

    await ctx.http.post(`/v1/stores/${shop.store.id}/payment-account/callback`).set(bearer(owner.accessToken)).send({ code: 'fake-ok', state: start.body.state }).expect(200);
    const verifier = exchange.mock.calls[0]?.[2];
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createHash('sha256').update(verifier!).digest('base64url')).toBe(challenge); // o provedor confere o par
    // o state é de uso único: repetir o callback não troca de novo
    await ctx.http.post(`/v1/stores/${shop.store.id}/payment-account/callback`).set(bearer(owner.accessToken)).send({ code: 'fake-ok', state: start.body.state }).expect(400);
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});

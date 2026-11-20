import { eq } from 'drizzle-orm';
import { LEGAL_DOCS, legalText, seedOnda1 } from '../seed/onda1.js';
import { termsAcceptances } from '../src/modules/users/db/schema.js';
import { legalDocuments } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, uniqueEmail, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, registerUser, type TestAdmin } from './helpers/fixtures.js';

/** DEC-080/081: textos legais completos (proposta) e política de trocas (`exchange_policy`) como documento versionado e público. */
describe('Textos legais do v1.0: seed, política de trocas pública e aceite versionado', () => {
  let ctx: TestContext;
  let admin: TestAdmin;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await seedOnda1(ctx.db);
    admin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('os 4 textos do seed são o trecho público do PO: títulos, seções, variáveis e nenhum marcador de revisão nem minuta antiga', () => {
    expect(LEGAL_DOCS.map((d) => d.type)).toEqual(['customer_terms', 'merchant_terms', 'privacy', 'exchange_policy']);
    for (const { type } of LEGAL_DOCS) {
      const text = legalText(type);
      expect(text.startsWith('## 1. ')).toBe(true);
      expect(text).not.toMatch(/REVISAR|Minuta técnica|TEXTO-PUBLICO/);
      expect(text).not.toMatch(/\b2 ?h\b/);
      expect(text).toMatch(/\{\{VIGENCIA\}\}/);
      expect(text.length).toBeLessThan(200_000); // limite do admin ao publicar
    }
    expect(legalText('privacy')).toContain('{{DPO_EMAIL}}');
    expect(legalText('merchant_terms')).toContain('{{FORO_COMARCA}}');
  });

  it('GET /v1/legal/exchange_policy é público, vem do seed e não pede autenticação', async () => {
    const res = await ctx.http.get('/v1/legal/exchange_policy').expect(200);
    expect(res.body).toMatchObject({ type: 'exchange_policy', title: 'Política de Trocas e Reembolsos', version: expect.any(Number) });
    expect(res.body.content).toContain('## 3. Arrependimento (7 dias)');
    expect(res.headers['cache-control']).toContain('public');
  });

  it('rodar o seed de novo não cria outra versão da política de trocas', async () => {
    const count = async () => (await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.type, 'exchange_policy'))).length;
    const before = await count();
    await seedOnda1(ctx.db);
    expect(await count()).toBe(before);
  });

  it('tipo desconhecido segue 404; o admin publica nova versão da política de trocas e a vigente muda', async () => {
    await ctx.http.get('/v1/legal/refund_policy').expect(404);
    const before = (await ctx.http.get('/v1/legal/exchange_policy').expect(200)).body.version as number;
    await ctx.http
      .post('/v1/admin/legal/exchange_policy')
      .set(bearer(admin.accessToken))
      .send({ title: 'Política de Trocas e Reembolsos', content: legalText('exchange_policy'), effectiveAt: new Date(Date.now() - 1000).toISOString(), relevantChange: false, changeSummary: 'Correção de texto' })
      .expect(201);
    expect((await ctx.http.get('/v1/legal/exchange_policy').expect(200)).body.version).toBe(before + 1);
    await ctx.http.post('/v1/admin/legal/exchange_policy').send({}).expect(401);
  });

  it('cadastro aceita a NOVA versão do texto completo dos termos e grava o aceite na versão certa; política de trocas não é exigida', async () => {
    const oldVersion = (await ctx.http.get('/v1/legal/customer_terms').expect(200)).body.version as number;
    const published = await ctx.http
      .post('/v1/admin/legal/customer_terms')
      .set(bearer(admin.accessToken))
      .send({ title: 'Termos de Uso', content: legalText('customer_terms'), effectiveAt: new Date(Date.now() - 1000).toISOString(), relevantChange: true, changeSummary: 'Texto completo proposto' })
      .expect(201);
    const newVersion = published.body.version as number;
    expect(newVersion).toBe(oldVersion + 1);
    const privacy = (await ctx.http.get('/v1/legal/privacy').expect(200)).body.version as number;
    const body = { name: 'Nova Pessoa', phone: '11977776666', password: 'cavalo-bateria-grampo-9', adultDeclaration: true };

    // versão antiga: recusada, o app recarrega o texto
    await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', randomIp())
      .send({ ...body, email: uniqueEmail(), acceptedDocuments: [{ type: 'customer_terms', version: oldVersion }, { type: 'privacy', version: privacy }] })
      .expect(409);
    // versão nova, sem a política de trocas: cadastro feito
    const email = uniqueEmail();
    const ok = await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', randomIp())
      .send({ ...body, email, acceptedDocuments: [{ type: 'customer_terms', version: newVersion }, { type: 'privacy', version: privacy }] })
      .expect(201);
    const accepted = await ctx.db
      .select({ type: legalDocuments.type, version: legalDocuments.version, content: legalDocuments.content })
      .from(termsAcceptances)
      .innerJoin(legalDocuments, eq(legalDocuments.id, termsAcceptances.documentId))
      .where(eq(termsAcceptances.userId, ok.body.user.id));
    expect(accepted.map((a) => `${a.type}:${a.version}`).sort()).toEqual([`customer_terms:${newVersion}`, `privacy:${privacy}`].sort());
    expect(accepted.find((a) => a.type === 'customer_terms')?.content).toBe(legalText('customer_terms'));

    // a política de trocas é só informativa: nunca aparece como pendência de aceite
    const user = await registerUser(ctx);
    const me = await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200);
    expect((me.body.pendingTerms as { type: string }[]).map((p) => p.type)).not.toContain('exchange_policy');
  });
});

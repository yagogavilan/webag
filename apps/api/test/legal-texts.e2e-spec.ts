import { createHash } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { LEGAL_DOCS, legalText, seedOnda1 } from '../seed/onda1.js';
import { fillCompanyVariables, resolveCompanyValues } from '../src/modules/admin/legal-variables.js';
import { termsAcceptances } from '../src/modules/users/db/schema.js';
import { auditLog, legalDocuments } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, uniqueEmail, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, registerUser, type TestAdmin } from './helpers/fixtures.js';

/** DEC-080/081: textos legais completos (proposta) e política de trocas (`exchange_policy`) como documento versionado e público. */
/** Valores de empresa do "ambiente" dos testes (SEC-187: escritos no texto ao gravar a versão). */
const ENV = {
  COMPANY_NAME: 'Webag Exemplo Ltda',
  COMPANY_CNPJ: '00.000.000/0001-00',
  COMPANY_ADDRESS: 'Rua Exemplo, 100, Francisco Morato, SP',
  FORO_COMARCA: 'Comarca de Franco da Rocha',
  DPO_NAME: 'Fulana Encarregada',
  DPO_EMAIL: 'dpo@webag.example',
  SUPPORT_EMAIL: 'ajuda@webag.example',
  SUPPORT_WHATSAPP: '5511999990000',
  HOSTING_PROVIDER: 'Hospedagem Exemplo',
  EMAIL_PROVIDER: 'E-mail Exemplo',
  MP_LEGAL_NAME: 'Mercado Pago Exemplo',
  AVISO_MUDANCA_DIAS: '15',
};
/** Texto do seed com os valores de empresa já escritos: é o que o admin publica (só SITE_URL, VERSAO e VIGENCIA ficam como variável). */
const filled = (type: string, env: Record<string, string | undefined> = ENV): string => fillCompanyVariables(legalText(type), resolveCompanyValues(env).values);
const COMPANY_TOKEN = /\{\{\s*(?!SITE_URL|VERSAO|VIGENCIA)[A-Z_]+\s*\}\}/;

describe('Textos legais do v1.0: seed, política de trocas pública e aceite versionado', () => {
  let ctx: TestContext;
  let admin: TestAdmin;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await seedOnda1(ctx.db, { env: {} });
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
    await seedOnda1(ctx.db, { env: ENV });
    expect(await count()).toBe(before);
  });

  it('tipo desconhecido segue 404; o admin publica nova versão da política de trocas e a vigente muda', async () => {
    await ctx.http.get('/v1/legal/refund_policy').expect(404);
    const before = (await ctx.http.get('/v1/legal/exchange_policy').expect(200)).body.version as number;
    await ctx.http
      .post('/v1/admin/legal/exchange_policy')
      .set(bearer(admin.accessToken))
      .send({ title: 'Política de Trocas e Reembolsos', content: filled('exchange_policy'), effectiveAt: new Date(Date.now() - 1000).toISOString(), relevantChange: false, changeSummary: 'Correção de texto' })
      .expect(201);
    expect((await ctx.http.get('/v1/legal/exchange_policy').expect(200)).body.version).toBe(before + 1);
    await ctx.http.post('/v1/admin/legal/exchange_policy').send({}).expect(401);
  });

  it('cadastro aceita a NOVA versão do texto completo dos termos e grava o aceite na versão certa; política de trocas não é exigida', async () => {
    const oldVersion = (await ctx.http.get('/v1/legal/customer_terms').expect(200)).body.version as number;
    const published = await ctx.http
      .post('/v1/admin/legal/customer_terms')
      .set(bearer(admin.accessToken))
      .send({ title: 'Termos de Uso', content: filled('customer_terms'), effectiveAt: new Date(Date.now() - 1000).toISOString(), relevantChange: true, changeSummary: 'Texto completo proposto' })
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
    expect(accepted.find((a) => a.type === 'customer_terms')?.content).toBe(filled('customer_terms'));

    // a política de trocas é só informativa: nunca aparece como pendência de aceite
    const user = await registerUser(ctx);
    const me = await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200);
    expect((me.body.pendingTerms as { type: string }[]).map((p) => p.type)).not.toContain('exchange_policy');
  });

  describe('SEC-187: versão publicada imutável (fatos contratuais escritos no texto)', () => {
    const publish = (type: string, content: string, extra: Record<string, unknown> = {}) =>
      ctx.http.post(`/v1/admin/legal/${type}`).set(bearer(admin.accessToken)).send({ title: 'Termos de Uso', content, effectiveAt: new Date(Date.now() - 1000).toISOString(), relevantChange: false, ...extra });
    const versions = async (type: 'customer_terms' | 'privacy') => (await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.type, type))).length;

    it('publicar com variável fora de SITE_URL, VERSAO e VIGENCIA é 422 e nada é gravado (admin)', async () => {
      const before = await versions('customer_terms');
      const base = 'Texto de teste dos termos com mais de vinte caracteres. ';
      for (const bad of ['{{FORO_COMARCA}}', '{{ DPO_EMAIL }}', '{{COMPANY_CNPJ}}', '{{INVENTADA}}', '{{site_url}}', '{{SITE_URL}', '{{', '}}', '{{SITE_URL {{VERSAO}}']) {
        const res = await publish('customer_terms', `${base}Foro: ${bad}. Link: {{SITE_URL}}`).expect(422);
        expect(res.body.code).toBe('LEGAL_VARIABLE_NOT_ALLOWED');
        expect(res.body.errors[0].field).toBe('content');
      }
      // o texto cru do seed (com variáveis de empresa) também é recusado
      expect((await publish('privacy', legalText('privacy')).expect(422)).body.errors.length).toBeGreaterThan(1);
      expect(await versions('customer_terms')).toBe(before);
    });

    it('as três variáveis de exibição, com ou sem espaços, são aceitas e gravadas exatamente como enviadas', async () => {
      const content = `${'Texto de teste dos termos com mais de vinte caracteres.'} Versão {{VERSAO}}. Em vigor desde {{ VIGENCIA }}. [{{SITE_URL}}/termos]({{SITE_URL}}/termos). Foro: Comarca de Franco da Rocha.`;
      const res = await publish('customer_terms', content).expect(201);
      expect(res.body.content).toBe(content);
      const [row] = await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.id, res.body.id));
      expect(row?.content).toBe(content);
      // a auditoria guarda o hash do texto publicado
      const [audit] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, res.body.id), eq(auditLog.action, 'legal.publish')));
      expect(audit?.after).toMatchObject({ version: res.body.version, contentSha256: createHash('sha256').update(content).digest('hex') });
    });

    it('o texto exibido (GET público, com a vigência) é igual ao texto aceito no cadastro, e mudar o ambiente não altera a versão', async () => {
      const text = filled('customer_terms');
      expect(text).not.toMatch(COMPANY_TOKEN);
      const doc = (await publish('customer_terms', text, { relevantChange: true, changeSummary: 'Valores de empresa escritos no texto' }).expect(201)).body;
      const privacy = (await ctx.http.get('/v1/legal/privacy').expect(200)).body.version as number;
      const email = uniqueEmail();
      const reg = await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', randomIp())
        .send({ name: 'Pessoa Teste', phone: '11966665555', email, password: 'cavalo-bateria-grampo-9', adultDeclaration: true, acceptedDocuments: [{ type: 'customer_terms', version: doc.version }, { type: 'privacy', version: privacy }] })
        .expect(201);
      const [accepted] = await ctx.db
        .select({ content: legalDocuments.content })
        .from(termsAcceptances)
        .innerJoin(legalDocuments, eq(legalDocuments.id, termsAcceptances.documentId))
        .where(and(eq(termsAcceptances.userId, reg.body.user.id), eq(legalDocuments.type, 'customer_terms')));

      const shown = (await ctx.http.get('/v1/legal/customer_terms').expect(200)).body;
      expect(shown).toMatchObject({ version: doc.version, content: accepted?.content, effectiveAt: doc.effectiveAt });
      expect(shown.content).toContain(ENV.COMPANY_NAME);
      expect(shown.content).toContain(ENV.DPO_EMAIL);

      // trocar o ambiente (o `.env` do insider ou do deploy) e rodar o seed NÃO muda o que foi publicado nem cria versão
      const before = await versions('customer_terms');
      await seedOnda1(ctx.db, { env: { ...ENV, FORO_COMARCA: 'Comarca Trocada', DPO_EMAIL: 'outro@webag.example' } });
      const again = (await ctx.http.get('/v1/legal/customer_terms').expect(200)).body;
      expect(again.content).toBe(shown.content);
      expect(await versions('customer_terms')).toBe(before);
    });

    it('seed: versão antiga com variável de empresa ganha versão nova com os valores escritos e trilha; trocar o ambiente depois não muda nada', async () => {
      const [latest] = await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.type, 'exchange_policy')).orderBy(desc(legalDocuments.version)).limit(1);
      // estado herdado de um seed anterior ao SEC-187: texto com variável de empresa e sem valor escrito
      await ctx.db.insert(legalDocuments).values({ type: 'exchange_policy', title: 'Política de Trocas e Reembolsos', content: legalText('exchange_policy'), version: (latest?.version ?? 0) + 1, effectiveAt: new Date(), relevantChange: false });
      await seedOnda1(ctx.db, { env: { ...ENV, SUPPORT_WHATSAPP: undefined, SUPPORT_EMAIL: '**ruim**@x' } });
      const [fresh] = await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.type, 'exchange_policy')).orderBy(desc(legalDocuments.version)).limit(1);
      expect(fresh?.version).toBe((latest?.version ?? 0) + 2);
      expect(fresh?.content).not.toMatch(COMPANY_TOKEN);
      expect(fresh?.content).toContain('{{SITE_URL}}');
      expect(fresh?.content).toContain('{{VIGENCIA}}');
      // valor ausente ou inválido: marcação visível "a definir", nunca um chute
      expect(fresh?.content).toContain('WhatsApp a definir');
      expect(fresh?.content).toMatch(/escreva para a definir ou/);
      const [audit] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, fresh!.id), eq(auditLog.action, 'legal.publish')));
      expect(audit?.actorRole).toBe('system');
      expect(audit?.after).toMatchObject({ source: 'seed', version: fresh!.version, pending: ['SUPPORT_EMAIL', 'SUPPORT_WHATSAPP'], companyValues: { FORO_COMARCA: ENV.FORO_COMARCA, SUPPORT_EMAIL: 'a definir' }, contentSha256: createHash('sha256').update(fresh!.content).digest('hex') });

      const count = async () => (await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.type, 'exchange_policy'))).length;
      const total = await count();
      await seedOnda1(ctx.db, { env: { ...ENV, SUPPORT_EMAIL: 'agora@webag.example' } });
      expect(await count()).toBe(total);
      const [same] = await ctx.db.select().from(legalDocuments).where(eq(legalDocuments.id, fresh!.id));
      expect(same?.content).toBe(fresh?.content);
    });

    it('perfis sem legal:write continuam 403 (a validação não vaza para quem não publica) e sem token 401', async () => {
      const support = await createAdmin(ctx, 'support');
      await ctx.http.post('/v1/admin/legal/customer_terms').set(bearer(support.accessToken)).send({ title: 'Termos', content: '{{FORO_COMARCA}} com mais de vinte caracteres', effectiveAt: new Date().toISOString() }).expect(403);
      await ctx.http.post('/v1/admin/legal/customer_terms').send({}).expect(401);
    });
  });
});

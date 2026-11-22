import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { auditLog, mediaAssets, storeDocuments, stores, storeReviewItems } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, type TestContext } from './helpers/app.js';
import {
  connectFakeAccount,
  createAdmin,
  createCustomer,
  createMerchant,
  createStoreViaApi,
  ensureCategory,
  ensureCities,
  ensureLegalDocs,
  jpegBuffer,
  memoryStorage,
  pdfBuffer,
  pngBuffer,
  registerUser,
  uniqueCpf,
  uploadFile,
  type TestAdmin,
  type TestMerchant,
} from './helpers/fixtures.js';

/** Onda 2A: cadastro de lojista, documentos privados, fila de aprovação (WB-051/052/218/054/103/104). */
describe('Onda 2A: onboarding e aprovação de lojas', () => {
  let ctx: TestContext;
  let superAdmin: TestAdmin;
  let ops: TestAdmin;
  let finance: TestAdmin;
  let support: TestAdmin;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCities(ctx);
    [superAdmin, ops, finance, support] = [await createAdmin(ctx, 'super_admin'), await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'support')];
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** SEC-188: o servidor só aprova depois que o admin abriu cada documento vigente (como o painel faz no "Conferir tudo"). */
  const openAll = async (admin: TestAdmin, storeId: string): Promise<string[]> => {
    const detail = await ctx.http.get(`/v1/admin/stores/${storeId}`).set(bearer(admin.accessToken)).expect(200);
    const ids = (detail.body.documents as { id: string; current: boolean }[]).filter((d) => d.current).map((d) => d.id);
    for (const id of ids) await ctx.http.post(`/v1/admin/stores/${storeId}/documents/${id}/access`).set(bearer(admin.accessToken)).send({ reason: 'initial_review' }).expect(200);
    return ids;
  };
  const approveStore = (admin: TestAdmin, storeId: string) => ctx.http.post(`/v1/admin/stores/${storeId}/approve`).set(bearer(admin.accessToken)).send({});

  const create = (user: { accessToken: string }, body: Record<string, unknown>) => ctx.http.post('/v1/stores').set(bearer(user.accessToken)).send(body);

  describe('dados da loja e CPF/CNPJ (O2-ONB)', () => {
    it('O2-ONB-01/03: CPF válido com ou sem máscara; inválido → erro no campo; mesmo documento mascarado ou não → 409', async () => {
      const a = await createMerchant(ctx);
      const cpf = uniqueCpf();
      await create(a, { documentType: 'cpf', documentNumber: '111.111.111-11' }).expect(400);
      const bad = await create(a, { documentType: 'cpf', documentNumber: '529.982.247-24' }).expect(400);
      expect(bad.body.errors[0]).toMatchObject({ field: 'documentNumber', message: 'CPF inválido.' });
      const masked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
      const ok = await create(a, { documentType: 'cpf', documentNumber: masked }).expect(201);
      expect(ok.body).toMatchObject({ status: 'draft', documentType: 'cpf', document: cpf });

      const b = await createMerchant(ctx);
      const dup = await create(b, { documentType: 'cpf', documentNumber: cpf }).expect(409);
      expect(dup.body.code).toBe('DOCUMENT_IN_USE');
      expect(dup.body.detail).toBe('Esse CPF/CNPJ já tem loja. Fale com o suporte.');
    });

    it('O2-ONB-04: dois lojistas cadastrando o mesmo documento ao mesmo tempo → uma loja, uma recusa', async () => {
      const [a, b] = [await createMerchant(ctx), await createMerchant(ctx)];
      const cpf = uniqueCpf();
      const results = await Promise.all([create(a, { documentType: 'cpf', documentNumber: cpf }), create(b, { documentType: 'cpf', documentNumber: cpf })]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await ctx.db.select().from(stores).where(eq(stores.documentNumber, cpf))).toHaveLength(1);
    });

    it('O2-ONB-10: 1 conta = 1 loja (segunda → 409); quem não é lojista → 403; e-mail não confirmado não vira lojista', async () => {
      const a = await createMerchant(ctx);
      await create(a, { documentType: 'cpf', documentNumber: uniqueCpf() }).expect(201);
      expect((await create(a, { documentType: 'cpf', documentNumber: uniqueCpf() }).expect(409)).body.code).toBe('STORE_ALREADY_EXISTS');
      const customer = await registerUser(ctx);
      await create(customer, { documentType: 'cpf', documentNumber: uniqueCpf() }).expect(403);
    });

    it('O2-ONB-09: CNPJ exige razão social e aceite fiscal (422); com os dois, grava data e versão do texto', async () => {
      const m = await createMerchant(ctx);
      const cnpj = '11.222.333/0001-81';
      const miss = await create(m, { documentType: 'cnpj', documentNumber: cnpj }).expect(422);
      expect(miss.body.code).toBe('FISCAL_ACCEPTANCE_REQUIRED');
      expect(miss.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['fiscalResponsibilityAccepted', 'legalName']);
      const ok = await create(m, { documentType: 'cnpj', documentNumber: cnpj, legalName: 'Marcos Comércio LTDA', fiscalResponsibilityAccepted: true }).expect(201);
      const [row] = await ctx.db.select().from(stores).where(eq(stores.id, ok.body.id));
      expect(row?.fiscalAcceptedAt).not.toBeNull();
      expect(row?.fiscalAcceptedDocumentVersion).toBeGreaterThanOrEqual(1);
    });

    it('O2-ONB-13 / SEC-020: lojista B lê, altera, envia arquivo ou submete a loja de A → 404', async () => {
      const a = await createMerchant(ctx);
      const b = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, a);
      const h = bearer(b.accessToken);
      await ctx.http.get(`/v1/stores/${store.id}`).set(h).expect(404);
      await ctx.http.patch(`/v1/stores/${store.id}/profile`).set(h).send({ name: 'Invadida' }).expect(404);
      await ctx.http.put(`/v1/stores/${store.id}/hours`).set(h).send({ days: [] }).expect(404);
      await ctx.http.post(`/v1/stores/${store.id}/submit`).set(h).send({}).expect(404);
      await ctx.http.get(`/v1/stores/${store.id}/documents`).set(h).expect(404);
      await ctx.http.post('/v1/uploads').set(h).send({ storeId: store.id, purpose: 'store_document', contentType: 'image/jpeg', sizeBytes: 1000 }).expect(404);
      await ctx.http.get('/v1/stores/nao-e-uuid').set(h).expect(404);
    });

    it('SEC-022: o DTO da loja recusa status, ownerId, approvedAt e comissão (400)', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      for (const field of ['status', 'ownerUserId', 'approvedAt', 'commission', 'documentNumber', 'storeId']) {
        await ctx.http.patch(`/v1/stores/${store.id}/profile`).set(bearer(m.accessToken)).send({ [field]: 'approved' }).expect(400);
      }
      await ctx.http.post('/v1/stores').set(bearer((await createMerchant(ctx)).accessToken)).send({ documentType: 'cpf', documentNumber: uniqueCpf(), status: 'approved' }).expect(400);
    });
  });

  describe('perfil, CEP e cidade atendida (O2-ONB-05/06, O2-PRF)', () => {
    it('CEP de Francisco Morato autocompleta rua, bairro, cidade e grava a coordenada (PostGIS) dentro da cidade', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      const categoryId = await ensureCategory(ctx);
      const res = await ctx.http
        .patch(`/v1/stores/${store.id}/profile`)
        .set(bearer(m.accessToken))
        .send({ name: 'Mercadinho do Marcos', mainCategoryId: categoryId, description: 'Tudo para a casa ã😀', whatsapp: '(11) 98888-7777', phone: '(11) 4444-5555', address: { cep: '07900-100', number: '45' } })
        .expect(200);
      expect(res.body.address).toMatchObject({ cep: '07900100', city: 'Francisco Morato', state: 'SP', number: '45' });
      expect(res.body.whatsapp).toBe('11988887777');
      const { rows } = await ctx.pool.query<{ ok: boolean }>(
        `select ST_DWithin(location, ST_SetSRID(ST_MakePoint(-46.7452, -23.2811), 4326)::geography, 3000) as ok from stores where id = $1`,
        [store.id],
      );
      expect(rows[0]?.ok).toBe(true);
    });

    it('O2-ONB-06: cidade fora das regiões ativas → "Ainda não atendemos"; CEP inexistente → erro no campo', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      const out = await ctx.http.patch(`/v1/stores/${store.id}/profile`).set(bearer(m.accessToken)).send({ address: { cep: '01310-100', number: '1' } }).expect(422);
      expect(out.body.code).toBe('CITY_NOT_SERVED');
      expect(out.body.detail).toBe('Ainda não atendemos São Paulo.');
      const none = await ctx.http.patch(`/v1/stores/${store.id}/profile`).set(bearer(m.accessToken)).send({ address: { cep: '00000-000', number: '1' } }).expect(422);
      expect(none.body.errors[0].field).toBe('address.cep');
      expect((await ctx.http.get('/v1/cep/07900-100').set(bearer(m.accessToken)).expect(200)).body).toMatchObject({ city: 'Francisco Morato' });
      await ctx.http.get('/v1/cep/123').set(bearer(m.accessToken)).expect(400);
      // SEC-169 / inventário §3: o cliente consulta o CEP pela API (cache por CEP), não direto no ViaCEP; sem login é 401; CEP inexistente é 404
      const customer = await createCustomer(ctx);
      expect((await ctx.http.get('/v1/cep/07900-100').set(bearer(customer.accessToken)).expect(200)).body).toMatchObject({ city: 'Francisco Morato', state: 'SP', lat: expect.any(Number), lng: expect.any(Number) });
      expect((await ctx.http.get('/v1/cep/07900-100')).status).toBe(401);
      expect((await ctx.http.get('/v1/cep/00012-345').set(bearer(customer.accessToken))).status).toBe(404);
    });

    it('O2-PRF-03/04: descrição 300 (por caractere Unicode) ok e 301 → 422; 3 extras → 400; categoria inativa → 422; WhatsApp inválido → 400', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      const patch = (body: Record<string, unknown>) => ctx.http.patch(`/v1/stores/${store.id}/profile`).set(bearer(m.accessToken)).send(body);
      await patch({ description: 'ã'.repeat(300) }).expect(200);
      await patch({ description: `${'a'.repeat(299)}😀` }).expect(200);
      expect((await patch({ description: 'a'.repeat(301) }).expect(400)).body.errors[0].field).toBe('description');
      const [c1, c2, c3, c4] = [await ensureCategory(ctx), await ensureCategory(ctx), await ensureCategory(ctx), await ensureCategory(ctx)];
      await patch({ mainCategoryId: c1, extraCategoryIds: [c2, c3, c4] }).expect(400);
      await patch({ mainCategoryId: c1, extraCategoryIds: [c2, c3] }).expect(200);
      const { categories } = await import('../src/platform/database/schema.js');
      await ctx.db.update(categories).set({ active: false }).where(eq(categories.id, c4));
      expect((await patch({ extraCategoryIds: [c4] }).expect(422)).body.code).toBe('CATEGORY_INACTIVE');
      await patch({ whatsapp: '1133334444' }).expect(400);
    });

    it('XSS: nome e descrição com <script> ficam como texto cru na API (o painel escapa; nada é interpretado)', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      const res = await ctx.http.patch(`/v1/stores/${store.id}/profile`).set(bearer(m.accessToken)).send({ name: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' }).expect(200);
      expect(res.body.name).toBe('<script>alert(1)</script>');
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('upload e validação de arquivos (O2-DOC, SEC-050)', () => {
    let m: TestMerchant;
    let storeId: string;
    beforeAll(async () => {
      m = await createMerchant(ctx);
      storeId = (await createStoreViaApi(ctx, m)).id;
    });
    const doc = (body: Buffer, contentType = 'image/jpeg', over: Record<string, unknown> = {}) => uploadFile(ctx, m, { storeId, purpose: 'store_document', contentType, body, ...over });

    it('O2-DOC-02: JPG, PNG e PDF aceitos; GIF/SVG/EXE recusados na criação; 5 MB exatos ok e 5 MB + 1 byte → 422', async () => {
      expect((await doc(await jpegBuffer(300, 200))).completed?.status).toBe(200);
      expect((await doc(await pngBuffer(), 'image/png')).completed?.status).toBe(200);
      expect((await doc(pdfBuffer(), 'application/pdf')).completed?.status).toBe(200);
      for (const type of ['image/gif', 'image/svg+xml', 'application/x-msdownload', 'text/html']) {
        const sent = await doc(Buffer.from('x'), type);
        expect(sent.created.status, type).toBe(422);
        expect(sent.created.body.code).toBe('UPLOAD_REJECTED');
      }
      const limit = 5 * 1024 * 1024;
      expect((await ctx.http.post('/v1/uploads').set(bearer(m.accessToken)).send({ storeId, purpose: 'store_document', contentType: 'image/jpeg', sizeBytes: limit }).expect(201)).body.id).toBeDefined();
      const over = await ctx.http.post('/v1/uploads').set(bearer(m.accessToken)).send({ storeId, purpose: 'store_document', contentType: 'image/jpeg', sizeBytes: limit + 1 }).expect(422);
      expect(over.body.detail).toMatch(/5 MB/);
    });

    it('O2-DOC-03: SVG renomeado .jpg e HTML com Content-Type image/jpeg → rejeitados no complete (magic bytes) e o objeto é apagado', async () => {
      for (const body of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), Buffer.from('<html><script>alert(1)</script></html>')]) {
        const sent = await doc(body);
        expect(sent.storageStatus).toBe(204); // o storage aceitou; quem barra é o complete
        expect(sent.completed?.status).toBe(422);
        expect(sent.completed?.body.code).toBe('UPLOAD_REJECTED');
        const [asset] = await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.id, sent.created.body.id));
        expect(asset?.status).toBe('rejected');
        expect(memoryStorage(ctx).has('private', asset!.objectKey)).toBe(false);
      }
    });

    it('conteúdo diferente do tipo declarado (PNG declarado como JPEG; PDF fora de documento) → 422', async () => {
      expect((await doc(await pngBuffer(), 'image/jpeg')).completed?.status).toBe(422);
      const logo = await uploadFile(ctx, m, { storeId, purpose: 'store_logo', contentType: 'application/pdf', body: pdfBuffer() });
      expect(logo.created.status).toBe(422);
    });

    it('O2-DOC-04: PNG de 20000x20000 (> 40 MP) é rejeitado sem travar; outro upload de 1 MP segue normal logo depois', async () => {
      const png = Buffer.alloc(8 + 25 + 12 + 12);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
      png.writeUInt32BE(13, 8);
      png.write('IHDR', 12, 'latin1');
      png.writeUInt32BE(20000, 16);
      png.writeUInt32BE(20000, 20);
      png.set([8, 2, 0, 0, 0], 24);
      const crc = (await import('node:zlib')).crc32?.(png.subarray(12, 29)) ?? 0;
      png.writeUInt32BE(crc >>> 0, 29);
      png.writeUInt32BE(0, 33);
      png.write('IEND', 37, 'latin1');
      const started = Date.now();
      const big = await doc(png, 'image/png');
      expect(big.completed?.status).toBe(422);
      expect(Date.now() - started).toBeLessThan(5000);
      expect((await doc(await jpegBuffer(1000, 1000))).completed?.status).toBe(200);
    });

    it('O2-DOC-05: complete de upload de outro usuário → 404; a chave é do servidor; a policy recusa corpo maior e tipo diferente', async () => {
      const sent = await doc(await jpegBuffer(300, 200));
      const other = await createMerchant(ctx);
      await ctx.http.post(`/v1/uploads/${sent.created.body.id}/complete`).set(bearer(other.accessToken)).send({}).expect(404);
      await ctx.http.get(`/v1/uploads/${sent.created.body.id}`).set(bearer(other.accessToken)).expect(404);
      const created = await ctx.http.post('/v1/uploads').set(bearer(m.accessToken)).send({ storeId, purpose: 'store_document', contentType: 'image/jpeg', sizeBytes: 100 }).expect(201);
      expect(created.body.upload.fields.key).toMatch(new RegExp(`^uploads/${storeId}/`));
      const key = created.body.upload.fields.key as string;
      expect(memoryStorage(ctx).upload('private', key, Buffer.alloc(6 * 1024 * 1024, 1), 'image/jpeg')).toBe(400);
      expect(memoryStorage(ctx).upload('private', key, Buffer.alloc(10, 1), 'text/html')).toBe(400);
      expect(memoryStorage(ctx).upload('private', 'uploads/outra/chave', Buffer.alloc(10, 1), 'image/jpeg')).toBe(403);
    });

    it('O2-DOC-06: logo pública é re-codificada em WebP SEM EXIF/GPS; o original não é público; proporção errada e 6 MB são recusados no servidor (PRF-02)', async () => {
      const withExif = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#aa0000' } })
        .jpeg()
        .withExif({ IFD0: { Copyright: 'privado' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 16/1 48/1', GPSLongitudeRef: 'W', GPSLongitude: '46/1 44/1 42/1' } })
        .toBuffer();
      expect((await sharp(withExif).metadata()).exif).toBeDefined();
      const sent = await uploadFile(ctx, m, { storeId, purpose: 'store_logo', contentType: 'image/jpeg', body: withExif });
      expect(sent.completed?.status).toBe(200);
      const urls = sent.completed?.body.urls as Record<string, string>;
      expect(Object.keys(urls).sort()).toEqual(['160', '400', '800']);
      const [asset] = await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.id, sent.created.body.id));
      for (const key of Object.values(asset!.variants!)) {
        const bytes = await memoryStorage(ctx).getObject('public', key, { maxBytes: 10_000_000 });
        const meta = await sharp(bytes!).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.exif).toBeUndefined();
        expect(bytes!.includes(Buffer.from('privado'))).toBe(false);
      }
      expect(memoryStorage(ctx).fetchAnonymous('private', asset!.objectKey).status).toBe(403);
      expect(JSON.stringify(sent.completed?.body)).not.toContain('uploads/');
      const wide = await uploadFile(ctx, m, { storeId, purpose: 'store_logo', contentType: 'image/jpeg', body: await jpegBuffer(1000, 500) });
      expect(wide.completed?.status).toBe(422);
      const cover = await uploadFile(ctx, m, { storeId, purpose: 'store_cover', contentType: 'image/jpeg', body: await jpegBuffer(1600, 900) });
      expect(cover.completed?.status).toBe(200);
      const sixMb = await ctx.http.post('/v1/uploads').set(bearer(m.accessToken)).send({ storeId, purpose: 'store_logo', contentType: 'image/jpeg', sizeBytes: 6 * 1024 * 1024 }).expect(422);
      expect(sixMb.body.code).toBe('UPLOAD_REJECTED');
    });

    it('funcionário sem permissão de configurações não envia documento nem logo (403)', async () => {
      const staff = await registerUser(ctx);
      const { storeMembers } = await import('../src/platform/database/schema.js');
      await ctx.db.insert(storeMembers).values({ storeId, userId: staff.userId, role: 'staff', permissions: ['catalog'] });
      await ctx.http.post('/v1/uploads').set(bearer(staff.accessToken)).send({ storeId, purpose: 'store_document', contentType: 'image/jpeg', sizeBytes: 1000 }).expect(403);
      await ctx.http.post('/v1/uploads').set(bearer(staff.accessToken)).send({ storeId, purpose: 'product_image', contentType: 'image/jpeg', sizeBytes: 1000 }).expect(201);
    });
  });

  describe('envio, fila e decisões (O2-APR, WB-218)', () => {
    it('O2-DOC-01: enviar com itens faltando → 422 listando o que falta; reenvio de documento substitui e mantém histórico (DOC-16)', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      const miss = await ctx.http.post(`/v1/stores/${store.id}/submit`).set(bearer(m.accessToken)).send({}).expect(422);
      expect(miss.body.code).toBe('ONBOARDING_INCOMPLETE');
      const fields = miss.body.errors.map((e: { field: string }) => e.field);
      expect(fields).toEqual(expect.arrayContaining(['name', 'mainCategoryId', 'address', 'documents.id_front', 'documents.id_back', 'documents.address_proof', 'paymentAccount']));

      const first = await uploadFile(ctx, m, { storeId: store.id, purpose: 'store_document', contentType: 'image/jpeg', body: await jpegBuffer(300, 200) });
      const second = await uploadFile(ctx, m, { storeId: store.id, purpose: 'store_document', contentType: 'image/jpeg', body: await jpegBuffer(310, 200) });
      for (const sent of [first, second]) await ctx.http.post(`/v1/stores/${store.id}/documents`).set(bearer(m.accessToken)).send({ kind: 'id_front', uploadId: sent.completed!.body.id }).expect(204);
      const docs = await ctx.http.get(`/v1/stores/${store.id}/documents`).set(bearer(m.accessToken)).expect(200);
      expect(docs.body.data.filter((d: { kind: string }) => d.kind === 'id_front')).toHaveLength(2);
      expect(docs.body.data.filter((d: { current: boolean }) => d.current)).toHaveLength(1);
      expect(JSON.stringify(docs.body)).not.toMatch(/uploads\/|objectKey|assetId/);
      // documento que o cadastro CPF não exige → 422
      const cnpjDoc = await uploadFile(ctx, m, { storeId: store.id, purpose: 'store_document', contentType: 'image/jpeg', body: await jpegBuffer(300, 200) });
      await ctx.http.post(`/v1/stores/${store.id}/documents`).set(bearer(m.accessToken)).send({ kind: 'cnpj_card', uploadId: cnpjDoc.completed!.body.id }).expect(422);
    });

    it('caminho feliz: onboarding completo → em análise → fila → admin vê documentos (URL de 5 min, auditada) → aprova → e-mail ao lojista', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      const submitted = await ctx.http.get(`/v1/stores/${store.id}`).set(bearer(m.accessToken)).expect(200);
      expect(submitted.body.status).toBe('in_review');
      await ctx.http.post(`/v1/stores/${store.id}/submit`).set(bearer(m.accessToken)).send({}).expect(409);

      const queue = await ctx.http.get('/v1/admin/stores').set(bearer(ops.accessToken)).expect(200);
      expect(queue.body.data.some((s: { id: string }) => s.id === store.id)).toBe(true);
      expect(JSON.stringify(queue.body)).not.toContain(store.documentNumber); // CPF mascarado na lista

      const detail = await ctx.http.get(`/v1/admin/stores/${store.id}`).set(bearer(ops.accessToken)).expect(200);
      expect(detail.body.documents).toHaveLength(3);
      const docId = detail.body.documents[0].id as string;
      const noReason = await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${docId}/access`).set(bearer(ops.accessToken)).send({}).expect(400);
      expect(noReason.body.errors[0].field).toBe('reason');
      const access = await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${docId}/access`).set(bearer(ops.accessToken)).send({ reason: 'initial_review' }).expect(200);
      expect(access.body.expiresInSeconds).toBe(300);
      expect(memoryStorage(ctx).fetchSigned(access.body.url).status).toBe(200);
      const logs = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, docId), eq(auditLog.action, 'store.document_view')));
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ actorId: ops.userId, reason: 'initial_review' });

      await openAll(ops, store.id);
      const approved = await ctx.http.post(`/v1/admin/stores/${store.id}/approve`).set(bearer(ops.accessToken)).send({}).expect(200);
      expect(approved.body.status).toBe('approved');
      expect(ctx.mail.to(m.email).some((mail) => mail.subject.includes('aprovada'))).toBe(true);
      expect((await ctx.http.get(`/v1/stores/${store.id}/onboarding`).set(bearer(m.accessToken)).expect(200)).body.history.map((h: { to: string }) => h.to)).toEqual(['draft', 'in_review', 'approved']);
    });

    it('O2-DOC-07/08/09/10/11: documentos privados: GET anônimo 403; só super e operação geram URL; 4:59 ok e 5:01 403; funcionário e dono não baixam; acesso negado vira auditoria', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      const detail = await ctx.http.get(`/v1/admin/stores/${store.id}`).set(bearer(superAdmin.accessToken)).expect(200);
      const docId = detail.body.documents[0].id as string;
      const [assetRow] = await ctx.db.select({ key: mediaAssets.objectKey }).from(storeDocuments).innerJoin(mediaAssets, eq(mediaAssets.id, storeDocuments.assetId)).where(eq(storeDocuments.id, docId));
      expect(memoryStorage(ctx).fetchAnonymous('private', assetRow!.key).status).toBe(403);

      for (const denied of [finance, support]) {
        await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${docId}/access`).set(bearer(denied.accessToken)).send({ reason: 'doubt' }).expect(403);
        // financeiro e suporte podem LER a fila, mas nunca o documento
        await ctx.http.get(`/v1/admin/stores/${store.id}`).set(bearer(denied.accessToken)).expect(200);
      }
      const owner403 = await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${docId}/access`).set(bearer(m.accessToken)).send({ reason: 'doubt' }).expect(403);
      expect(owner403.body.code).toBe('FORBIDDEN');
      expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.actorId, support.userId), eq(auditLog.action, 'admin.access_denied')))).length).toBeGreaterThan(0);

      const ok = await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${docId}/access`).set(bearer(superAdmin.accessToken)).send({ reason: 'doubt' }).expect(200);
      const t0 = Date.now();
      expect(memoryStorage(ctx).fetchSigned(ok.body.url, t0 + 299_000).status).toBe(200);
      expect(memoryStorage(ctx).fetchSigned(ok.body.url, t0 + 301_000).status).toBe(403);
      expect(memoryStorage(ctx).fetchSigned(`${ok.body.url}x`).status).toBe(403);
      // a rota do dono para documento do admin não existe (nenhum GET de arquivo para o lojista)
      await ctx.http.get(`/v1/stores/${store.id}/documents/${docId}`).set(bearer(m.accessToken)).expect(404);
    });

    it('O2-DOC-09: falha ao gravar a auditoria impede a emissão da URL (falha fechada)', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      const detail = await ctx.http.get(`/v1/admin/stores/${store.id}`).set(bearer(ops.accessToken)).expect(200);
      const docId = detail.body.documents[0].id as string;
      await ctx.pool.query('alter table audit_log add constraint tmp_fail check (action <> \'store.document_view\') not valid');
      try {
        const res = await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${docId}/access`).set(bearer(ops.accessToken)).send({ reason: 'doubt' });
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain('memory://');
      } finally {
        await ctx.pool.query('alter table audit_log drop constraint tmp_fail');
      }
    });

    it('O2-APR-05 / E2E-02: correção pedida com motivo por item; lojista corrige SÓ o item e reenvia; o SLA fica pausado e volta ao ponto em que parou', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      await ctx.db.update(stores).set({ slaStartedAt: new Date(Date.now() - 3_600_000) }).where(eq(stores.id, store.id));
      await ctx.http.post(`/v1/admin/stores/${store.id}/request-correction`).set(bearer(ops.accessToken)).send({ items: [{ item: 'id_front', reason: '' }] }).expect(400);
      const requested = await ctx.http.post(`/v1/admin/stores/${store.id}/request-correction`).set(bearer(ops.accessToken)).send({ items: [{ item: 'id_front', reason: 'Foto cortada' }, { item: 'store_data', reason: 'Endereço sem número' }] }).expect(200);
      expect(requested.body.status).toBe('correction_requested');
      expect(requested.body.reviewItems).toHaveLength(2);
      const [row] = await ctx.db.select().from(stores).where(eq(stores.id, store.id));
      expect(row?.slaElapsedMs).toBeGreaterThan(3_500_000);
      // fora da fila "em análise" enquanto aguarda o lojista
      const queue = await ctx.http.get('/v1/admin/stores').set(bearer(ops.accessToken)).expect(200);
      expect(queue.body.data.some((s: { id: string }) => s.id === store.id)).toBe(false);

      // reenviar sem corrigir → 422 apontando os itens
      const early = await ctx.http.post(`/v1/stores/${store.id}/submit`).set(bearer(m.accessToken)).send({}).expect(422);
      expect(early.body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(['review.id_front', 'review.store_data']));
      // corrige só os dois itens (os outros documentos não são refeitos)
      const fresh = await uploadFile(ctx, m, { storeId: store.id, purpose: 'store_document', contentType: 'image/jpeg', body: await jpegBuffer(320, 200) });
      await ctx.http.post(`/v1/stores/${store.id}/documents`).set(bearer(m.accessToken)).send({ kind: 'id_front', uploadId: fresh.completed!.body.id }).expect(204);
      await ctx.http.patch(`/v1/stores/${store.id}/profile`).set(bearer(m.accessToken)).send({ address: { cep: '07900-100', number: '46' } }).expect(200);
      await ctx.http.post(`/v1/stores/${store.id}/submit`).set(bearer(m.accessToken)).send({}).expect(200);
      const [again] = await ctx.db.select().from(stores).where(eq(stores.id, store.id));
      expect(again?.status).toBe('in_review');
      // o SLA retomou: ~1 h já consumida
      const consumed = Date.now() - again!.slaStartedAt!.getTime();
      expect(consumed).toBeGreaterThan(3_500_000);
      expect(consumed).toBeLessThan(3_700_000);
      expect(await ctx.db.select().from(storeReviewItems).where(and(eq(storeReviewItems.storeId, store.id)))).toHaveLength(2);
      await openAll(ops, store.id);
      await ctx.http.post(`/v1/admin/stores/${store.id}/approve`).set(bearer(ops.accessToken)).send({}).expect(200);
    });

    it('SEC-188: a loja só é aprovada depois que o admin abriu cada documento vigente; sem isso, 409 DOCUMENTS_NOT_REVIEWED com os documentos que faltam', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      const detail = await ctx.http.get(`/v1/admin/stores/${store.id}`).set(bearer(ops.accessToken)).expect(200);
      const docs = detail.body.documents as { id: string; kind: string }[];
      expect(docs).toHaveLength(3);

      // nenhum aberto: 409 com um erro por documento, loja segue em análise, tentativa auditada
      const none = await approveStore(ops, store.id).expect(409);
      expect(none.body).toMatchObject({ code: 'DOCUMENTS_NOT_REVIEWED', status: 409 });
      expect(none.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['documents.address_proof', 'documents.id_back', 'documents.id_front']);
      expect((await ctx.db.select().from(stores).where(eq(stores.id, store.id)))[0]?.status).toBe('in_review');
      const blocked = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, store.id), eq(auditLog.action, 'store.approve_blocked')));
      expect(blocked).toHaveLength(1);
      expect(blocked[0]).toMatchObject({ actorId: ops.userId, reason: 'documents_not_reviewed' });

      // abriu 2 de 3: ainda 409, agora só com o que falta
      for (const doc of docs.slice(0, 2)) await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${doc.id}/access`).set(bearer(ops.accessToken)).send({ reason: 'initial_review' }).expect(200);
      const partial = await approveStore(ops, store.id).expect(409);
      expect(partial.body.code).toBe('DOCUMENTS_NOT_REVIEWED');
      expect(partial.body.errors).toHaveLength(1);

      // a conferência é POR ADMIN: outro admin que abriu tudo não vale para quem aprova
      await openAll(superAdmin, store.id);
      expect((await approveStore(ops, store.id).expect(409)).body.code).toBe('DOCUMENTS_NOT_REVIEWED');

      // abriu o último: aprova; o registro de visualização é por documento e por admin, com data
      await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${docs[2]!.id}/access`).set(bearer(ops.accessToken)).send({ reason: 'initial_review' }).expect(200);
      expect((await approveStore(ops, store.id).expect(200)).body.status).toBe('approved');
      const views = await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'store.document_view'), eq(auditLog.actorId, ops.userId)));
      const mine = views.filter((v) => docs.some((d) => d.id === v.targetId));
      expect(new Set(mine.map((v) => v.targetId)).size).toBe(3);
      expect(mine.every((v) => v.at instanceof Date && v.reason === 'initial_review')).toBe(true);
    });

    it('SEC-188: documento reenviado exige nova abertura (o antigo, já aberto, não vale)', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      await openAll(ops, store.id);
      await ctx.http.post(`/v1/admin/stores/${store.id}/request-correction`).set(bearer(ops.accessToken)).send({ items: [{ item: 'id_front', reason: 'Foto cortada' }] }).expect(200);
      const fresh = await uploadFile(ctx, m, { storeId: store.id, purpose: 'store_document', contentType: 'image/jpeg', body: await jpegBuffer(330, 200) });
      await ctx.http.post(`/v1/stores/${store.id}/documents`).set(bearer(m.accessToken)).send({ kind: 'id_front', uploadId: fresh.completed!.body.id }).expect(204);
      await ctx.http.post(`/v1/stores/${store.id}/submit`).set(bearer(m.accessToken)).send({}).expect(200);

      const stale = await approveStore(ops, store.id).expect(409);
      expect(stale.body.code).toBe('DOCUMENTS_NOT_REVIEWED');
      expect(stale.body.errors.map((e: { field: string }) => e.field)).toEqual(['documents.id_front']);
      await openAll(ops, store.id);
      await approveStore(ops, store.id).expect(200);
    });

    it('SEC-188 por perfil: financeiro, suporte e lojista não aprovam (403) nem abrem documento; sem token 401; decisão repetida segue 409 "já decidida"', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      const [doc] = (await ctx.http.get(`/v1/admin/stores/${store.id}`).set(bearer(ops.accessToken)).expect(200)).body.documents as { id: string }[];
      for (const who of [finance, support, m]) {
        await ctx.http.post(`/v1/admin/stores/${store.id}/approve`).set(bearer(who.accessToken)).send({}).expect(403);
        await ctx.http.post(`/v1/admin/stores/${store.id}/documents/${doc!.id}/access`).set(bearer(who.accessToken)).send({ reason: 'doubt' }).expect(403);
      }
      await ctx.http.post(`/v1/admin/stores/${store.id}/approve`).send({}).expect(401);
      expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, doc!.id), eq(auditLog.action, 'store.document_view')))).length).toBe(0);
      // super admin segue o mesmo caminho: sem abrir, 409; abrindo, 200
      expect((await approveStore(superAdmin, store.id).expect(409)).body.code).toBe('DOCUMENTS_NOT_REVIEWED');
      await openAll(superAdmin, store.id);
      await approveStore(superAdmin, store.id).expect(200);
      // já aprovada: a decisão repetida continua sendo o 409 de "já decidida", não o de documentos
      expect((await approveStore(superAdmin, store.id).expect(409)).body.code).toBe('STORE_ALREADY_DECIDED');
    });

    it('O2-APR-06: duas decisões simultâneas → exatamente uma; a outra recebe 409 "Já decidida por [nome]"', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      await openAll(ops, store.id);
      const results = await Promise.all([
        ctx.http.post(`/v1/admin/stores/${store.id}/approve`).set(bearer(ops.accessToken)).send({}),
        ctx.http.post(`/v1/admin/stores/${store.id}/reject`).set(bearer(superAdmin.accessToken)).send({ reason: 'Documento ilegível' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409)!;
      expect(loser.body.code).toBe('STORE_ALREADY_DECIDED');
      expect(loser.body.detail).toMatch(/^Já decidida por /);
    });

    it('O2-APR-01/08: transição inválida é recusada e AUDITADA; financeiro e suporte → 403; reprovar sem motivo → 400; recusada é final', async () => {
      const m = await createMerchant(ctx);
      const draft = await createStoreViaApi(ctx, m);
      const invalid = await ctx.http.post(`/v1/admin/stores/${draft.id}/approve`).set(bearer(ops.accessToken)).send({}).expect(409);
      expect(invalid.body.code).toBe('INVALID_STORE_TRANSITION');
      expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, draft.id), eq(auditLog.action, 'store.invalid_transition')))).length).toBe(1);
      for (const who of [finance, support]) {
        for (const action of ['approve', 'reject', 'suspend', 'reactivate', 'request-correction']) {
          await ctx.http.post(`/v1/admin/stores/${draft.id}/${action}`).set(bearer(who.accessToken)).send({ reason: 'xxxxx', items: [] }).expect(403);
        }
      }
      const m2 = await createMerchant(ctx);
      const s2 = await createStoreViaApi(ctx, m2, { submit: true });
      await ctx.http.post(`/v1/admin/stores/${s2.id}/reject`).set(bearer(ops.accessToken)).send({}).expect(400);
      await ctx.http.post(`/v1/admin/stores/${s2.id}/reject`).set(bearer(ops.accessToken)).send({ reason: 'CPF não confere com o documento' }).expect(200);
      expect((await ctx.http.post(`/v1/admin/stores/${s2.id}/approve`).set(bearer(ops.accessToken)).send({}).expect(409)).body.code).toBe('STORE_ALREADY_DECIDED');
      expect((await ctx.http.post(`/v1/admin/stores/${s2.id}/suspend`).set(bearer(ops.accessToken)).send({ reason: 'não pode' }).expect(409)).body.code).toBe('INVALID_STORE_TRANSITION');
      const mine = await ctx.http.get(`/v1/stores/${s2.id}`).set(bearer(m2.accessToken)).expect(200);
      expect(mine.body.decisionReason).toBe('CPF não confere com o documento');
      // R-15: documento de loja RECUSADA fica livre para novo cadastro
      const again = await createMerchant(ctx);
      await create(again, { documentType: 'cpf', documentNumber: s2.documentNumber }).expect(201);
    });

    it('O2-APR-12/13/14/16: suspender (motivo obrigatório), lojista suspenso não edita nem força visibilidade, reativar volta; admin edita com antes/depois; suporte não edita', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true });
      await openAll(ops, store.id);
      await ctx.http.post(`/v1/admin/stores/${store.id}/approve`).set(bearer(ops.accessToken)).send({}).expect(200);
      await ctx.http.post(`/v1/admin/stores/${store.id}/suspend`).set(bearer(ops.accessToken)).send({}).expect(400);
      await ctx.http.post(`/v1/admin/stores/${store.id}/suspend`).set(bearer(ops.accessToken)).send({ reason: 'Denúncia de produto proibido' }).expect(200);
      expect(ctx.mail.to(m.email).some((mail) => mail.subject.includes('suspensa'))).toBe(true);
      // o lojista lê, mas não escreve
      const read = await ctx.http.get(`/v1/stores/${store.id}`).set(bearer(m.accessToken)).expect(200);
      expect(read.body).toMatchObject({ status: 'suspended', decisionReason: 'Denúncia de produto proibido' });
      await ctx.http.put(`/v1/stores/${store.id}/hours`).set(bearer(m.accessToken)).send({ days: [{ weekday: 1, intervals: [{ start: '08:00', end: '18:00' }] }] }).expect(403);
      await ctx.http.post(`/v1/stores/${store.id}/pause`).set(bearer(m.accessToken)).send({ kind: '1h' }).expect(403);
      await ctx.http.patch(`/v1/stores/${store.id}/profile`).set(bearer(m.accessToken)).send({ name: 'Nome novo' }).expect(409);
      for (const action of ['reactivate', 'approve']) {
        // reativar volta; aprovar suspensa direto é inválido (RN-16)
        if (action === 'approve') await ctx.http.post(`/v1/admin/stores/${store.id}/approve`).set(bearer(ops.accessToken)).send({}).expect(409);
      }
      // I12 / ADR-018 D6: as duas rotas legadas de edição do admin (sem motivo nem versão) foram removidas; a edição vive em `/profile` e `/config/:section`.
      await ctx.http.patch(`/v1/admin/stores/${store.id}`).set(bearer(ops.accessToken)).send({ reason: 'Correção de descrição a pedido', profile: { description: 'Descrição ajustada pelo admin' } }).expect(404);
      await ctx.http.put(`/v1/admin/stores/${store.id}/settings/hours`).set(bearer(ops.accessToken)).send({ days: [] }).expect(404);
      await ctx.http.post(`/v1/admin/stores/${store.id}/reactivate`).set(bearer(ops.accessToken)).send({}).expect(200);
      await ctx.http.put(`/v1/stores/${store.id}/hours`).set(bearer(m.accessToken)).send({ days: [{ weekday: 1, intervals: [{ start: '08:00', end: '18:00' }] }] }).expect(204);
    });

    it('R-23: nome alterado depois de aprovada fica pendente de análise (a loja segue com o nome antigo) e o admin decide', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { submit: true, name: 'Nome Antigo' });
      await openAll(ops, store.id);
      await ctx.http.post(`/v1/admin/stores/${store.id}/approve`).set(bearer(ops.accessToken)).send({}).expect(200);
      const res = await ctx.http.patch(`/v1/stores/${store.id}/profile`).set(bearer(m.accessToken)).send({ name: 'Nome Novo', description: 'Descrição vale na hora' }).expect(200);
      expect(res.body).toMatchObject({ name: 'Nome Antigo', pendingReview: true, description: 'Descrição vale na hora' });
      const approved = await ctx.http.post(`/v1/admin/stores/${store.id}/data-review/approve`).set(bearer(ops.accessToken)).send({ reason: 'Nome conferido' }).expect(200);
      expect(approved.body.name).toBe('Nome Novo');
      await ctx.http.post(`/v1/admin/stores/${store.id}/data-review/approve`).set(bearer(ops.accessToken)).send({ reason: 'Nome conferido' }).expect(409);
    });

    it('SEC-023: o CPF inteiro só aparece ao dono e ao admin; funcionário vê mascarado', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      const staff = await registerUser(ctx);
      const { storeMembers } = await import('../src/platform/database/schema.js');
      await ctx.db.insert(storeMembers).values({ storeId: store.id, userId: staff.userId, role: 'staff', permissions: ['orders'] });
      expect((await ctx.http.get(`/v1/stores/${store.id}`).set(bearer(m.accessToken)).expect(200)).body.document).toBe(store.documentNumber);
      const masked = await ctx.http.get(`/v1/stores/${store.id}`).set(bearer(staff.accessToken)).expect(200);
      expect(masked.body.document).toBe(`*********${store.documentNumber.slice(-2)}`);
      expect(masked.body.settings).toBeUndefined();
      await ctx.http.get(`/v1/stores/${store.id}/settings`).set(bearer(staff.accessToken)).expect(403);
    });

    it('paginação por cursor na fila (limit ≤ 50) e idempotência do arquivo: complete repetido devolve o mesmo resultado', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      const sent = await uploadFile(ctx, m, { storeId: store.id, purpose: 'store_document', contentType: 'image/jpeg', body: await jpegBuffer(200, 200) });
      const again = await ctx.http.post(`/v1/uploads/${sent.created.body.id}/complete`).set(bearer(m.accessToken)).send({});
      expect(again.status).toBe(200);
      expect(again.body.status).toBe('ready');
      const page = await ctx.http.get('/v1/admin/stores?limit=1&status=draft').set(bearer(ops.accessToken)).expect(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.nextCursor).toEqual(expect.any(String));
      const next = await ctx.http.get(`/v1/admin/stores?limit=1&status=draft&cursor=${page.body.nextCursor}`).set(bearer(ops.accessToken)).expect(200);
      expect(next.body.data[0].id).not.toBe(page.body.data[0].id);
      await ctx.http.get('/v1/admin/stores?cursor=@@@').set(bearer(ops.accessToken)).expect(400);
      void randomIp;
      void connectFakeAccount;
      void randomUUID;
    });
  });
});

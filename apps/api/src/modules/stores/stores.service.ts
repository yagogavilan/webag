import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService, LegalService, ParametersService } from '../admin/index.js';
import { isUniqueViolation } from '../admin/util.js';
import { categories, cities } from '../admin/db/schema.js';
import { storeMembers, users } from '../identity/db/schema.js';
import { MediaService } from '../media/index.js';
import {
  paymentAccounts,
  storeDocuments,
  storeActivity,
  storeExtraCategories,
  storeReviewItems,
  storeSettings,
  storeStatusHistory,
  stores,
  STORE_DOCUMENT_KINDS,
  type StoreDocumentKind,
} from './db/schema.js';
import { isValidDocument, maskDocument, normalizeDocument } from './domain/document.js';
import { canTransitionStore, isEditableByMerchant, type StoreActor } from './domain/state.js';
import { GEOCODING_PROVIDER, type GeocodingProvider } from './geocoding.js';
import type { ProfileInput } from './stores.schemas.js';

export type Store = typeof stores.$inferSelect;

const norm = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Documentos exigidos por tipo (WB-052 C1). */
export const REQUIRED_DOCUMENTS: Record<'cpf' | 'cnpj', readonly StoreDocumentKind[]> = {
  cpf: ['id_front', 'id_back', 'address_proof'],
  cnpj: ['cnpj_card', 'responsible_id'],
};

@Injectable()
export class StoresService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    private readonly legal: LegalService,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  // ----------------------------------------------------------------- leitura

  async getStore(storeId: string, executor: DbOrTx = this.db): Promise<Store> {
    const [store] = await executor.select().from(stores).where(eq(stores.id, storeId));
    if (!store) throw errors.notFound('Loja não encontrada.');
    return store;
  }

  /** Lojas em que o usuário é membro (1 por conta na 1.0). */
  async listMine(userId: string): Promise<(Store & { role: string })[]> {
    const rows = await this.db
      .select({ store: stores, role: storeMembers.role })
      .from(storeMembers)
      .innerJoin(stores, eq(stores.id, storeMembers.storeId))
      .where(eq(storeMembers.userId, userId));
    return rows.map((r) => ({ ...r.store, role: r.role }));
  }

  async getSettings(storeId: string) {
    const [settings] = await this.db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
    if (!settings) throw errors.notFound('Loja não encontrada.');
    return settings;
  }

  async extraCategoryIds(storeId: string): Promise<string[]> {
    const rows = await this.db.select({ id: storeExtraCategories.categoryId }).from(storeExtraCategories).where(eq(storeExtraCategories.storeId, storeId));
    return rows.map((r) => r.id);
  }

  async paymentAccountStatus(storeId: string): Promise<'active' | 'under_review' | null> {
    const [row] = await this.db
      .select({ status: paymentAccounts.status })
      .from(paymentAccounts)
      .where(and(eq(paymentAccounts.storeId, storeId), inArray(paymentAccounts.status, ['active', 'under_review'])));
    return row ? (row.status as 'active' | 'under_review') : null;
  }

  // ------------------------------------------------------------------ criação

  /** WB-051 C1/C2/C5: documento válido e único; 1 conta = 1 loja; CNPJ pede razão social e aceite fiscal. */
  async create(
    principal: Principal,
    input: { documentType: 'cpf' | 'cnpj'; documentNumber: string; legalName?: string; fiscalResponsibilityAccepted?: boolean },
  ): Promise<Store> {
    if (!principal.emailVerified) throw errors.forbidden('EMAIL_VERIFICATION_REQUIRED', 'Confirme seu e-mail para cadastrar a loja.');
    const documentNumber = normalizeDocument(input.documentNumber);
    if (!isValidDocument(input.documentType, documentNumber)) {
      throw errors.validation([{ field: 'documentNumber', message: input.documentType === 'cpf' ? 'CPF inválido.' : 'CNPJ inválido.' }]);
    }
    let fiscalVersion: number | null = null;
    if (input.documentType === 'cnpj') {
      const issues = [];
      if (!input.legalName) issues.push({ field: 'legalName', message: 'Informe a razão social.' });
      if (input.fiscalResponsibilityAccepted !== true) issues.push({ field: 'fiscalResponsibilityAccepted', message: 'Confirme a responsabilidade fiscal da loja.' });
      if (issues.length > 0) throw errors.unprocessable('FISCAL_ACCEPTANCE_REQUIRED', 'Dados do CNPJ incompletos', { errors: issues });
      fiscalVersion = (await this.legal.current('merchant_terms'))?.version ?? null;
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [store] = await tx
          .insert(stores)
          .values({
            ownerUserId: principal.userId,
            documentType: input.documentType,
            documentNumber,
            legalName: input.documentType === 'cnpj' ? (input.legalName ?? null) : null,
            fiscalAcceptedAt: input.documentType === 'cnpj' ? new Date() : null,
            fiscalAcceptedDocumentVersion: fiscalVersion,
          })
          .returning();
        if (!store) throw new Error('Falha ao criar a loja');
        await tx.insert(storeSettings).values({ storeId: store.id });
        await tx.insert(storeMembers).values({ storeId: store.id, userId: principal.userId, role: 'owner', permissions: [] });
        await tx.insert(storeStatusHistory).values({ storeId: store.id, fromStatus: null, toStatus: 'draft', actorId: principal.userId });
        return store;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [mine] = await this.db.select({ id: stores.id }).from(stores).where(eq(stores.ownerUserId, principal.userId));
        if (mine) throw errors.conflict('STORE_ALREADY_EXISTS', 'Você já tem uma loja', 'Cada conta tem uma loja.');
        throw errors.conflict('DOCUMENT_IN_USE', 'Esse CPF/CNPJ já tem loja', 'Esse CPF/CNPJ já tem loja. Fale com o suporte.');
      }
      throw error;
    }
  }

  // ------------------------------------------------------------------- perfil

  /** Resolve a cidade atendida; cidade fora das regiões ativas é 422 "Ainda não atendemos [cidade]" (RN-03). */
  private async resolveCity(name: string, state: string): Promise<{ id: string; name: string }> {
    const rows = await this.db.select().from(cities).where(eq(cities.state, state.toUpperCase()));
    const found = rows.find((c) => norm(c.name) === norm(name));
    if (!found || !found.active) {
      throw errors.unprocessable('CITY_NOT_SERVED', `Ainda não atendemos ${name}`, { detail: `Ainda não atendemos ${name}.`, errors: [{ field: 'address.cep', message: `Ainda não atendemos ${name}.` }] });
    }
    return { id: found.id, name: found.name };
  }

  /** O lojista edita dados enquanto rascunho, em correção ou aprovada; em análise, recusada ou suspensa não. */
  assertProfileEditable(store: Store): void {
    if (isEditableByMerchant(store.status) || store.status === 'approved') return;
    throw errors.conflict('STORE_NOT_EDITABLE', 'A loja não pode ser editada agora', store.status === 'in_review' ? 'Ela está em análise.' : store.status === 'suspended' ? 'Loja suspensa. Fale com o suporte.' : 'Loja recusada. Fale com o suporte.');
  }

  async updateProfile(
    store: Store,
    input: ProfileInput,
    actor: { userId: string; kind: StoreActor },
    ctx: RequestContext,
  ): Promise<{ store: Store; pendingReview: boolean }> {
    if (actor.kind === 'merchant') this.assertProfileEditable(store);
    const patch: Partial<typeof stores.$inferInsert> = {};
    const pending: Record<string, string> = {};

    if (input.name !== undefined) {
      if (store.status === 'approved' && actor.kind === 'merchant' && input.name !== store.name) pending.name = input.name;
      else patch.name = input.name;
    }
    if (input.legalName !== undefined) {
      if (store.documentType !== 'cnpj') throw errors.validation([{ field: 'legalName', message: 'Razão social só para CNPJ.' }]);
      patch.legalName = input.legalName;
    }
    if (input.description !== undefined) patch.description = input.description;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp;

    if (input.mainCategoryId !== undefined || input.extraCategoryIds !== undefined) {
      const wanted = [...(input.mainCategoryId ? [input.mainCategoryId] : []), ...(input.extraCategoryIds ?? [])];
      if (input.mainCategoryId && (input.extraCategoryIds ?? []).includes(input.mainCategoryId)) {
        throw errors.validation([{ field: 'extraCategoryIds', message: 'A categoria principal não pode repetir nas extras.' }]);
      }
      const found = await this.db.select({ id: categories.id, active: categories.active }).from(categories).where(inArray(categories.id, wanted.length > 0 ? wanted : ['00000000-0000-0000-0000-000000000000']));
      for (const id of wanted) {
        const category = found.find((c) => c.id === id);
        if (!category?.active) throw errors.unprocessable('CATEGORY_INACTIVE', 'Categoria indisponível', { errors: [{ field: input.mainCategoryId === id ? 'mainCategoryId' : 'extraCategoryIds', message: 'Escolha uma categoria ativa.' }] });
      }
      if (input.mainCategoryId) patch.mainCategoryId = input.mainCategoryId;
    }

    if (input.address) {
      const address = input.address;
      const cep = address.cep.replace('-', '');
      let looked = null;
      try {
        looked = await this.geocoding.lookup(cep);
      } catch {
        looked = null; // serviço fora do ar: aceita preenchimento manual (WB-051 O2-ONB-05)
      }
      const city = looked?.city ?? address.city;
      const state = looked?.state ?? address.state ?? 'SP';
      const street = address.street ?? looked?.street;
      const lat = address.lat ?? looked?.lat;
      const lng = address.lng ?? looked?.lng;
      if (!city || !street || lat === undefined || lng === undefined) {
        if (!looked && !address.city) throw errors.unprocessable('CEP_NOT_FOUND', 'CEP não encontrado', { errors: [{ field: 'address.cep', message: 'Não encontramos esse CEP. Confira ou preencha o endereço à mão.' }] });
        throw errors.unprocessable('CEP_LOOKUP_INCOMPLETE', 'Complete o endereço', { errors: [{ field: 'address.street', message: 'Informe rua, cidade e ajuste o pino no mapa.' }] });
      }
      const cityRow = await this.resolveCity(city, state);
      Object.assign(patch, {
        addressCep: cep,
        addressStreet: street,
        addressNumber: address.number,
        addressComplement: address.complement ?? null,
        addressNeighborhood: address.neighborhood ?? looked?.neighborhood ?? null,
        addressCityId: cityRow.id,
        addressCityName: cityRow.name,
        addressState: state.toUpperCase(),
        lat,
        lng,
      });
    }
    for (const [field, assetId, purpose] of [
      ['logoAssetId', input.logoAssetId, 'store_logo'],
      ['coverAssetId', input.coverAssetId, 'store_cover'],
    ] as const) {
      if (assetId === undefined) continue;
      if (assetId !== null) await this.media.requireReady(assetId, { storeId: store.id, purposes: [purpose] });
      patch[field] = assetId;
    }

    const updated = await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(stores).where(eq(stores.id, store.id)).for('update');
      if (!before) throw errors.notFound('Loja não encontrada.');
      const [row] = await tx
        .update(stores)
        .set({ ...patch, ...(Object.keys(pending).length > 0 ? { pendingChanges: { ...(before.pendingChanges ?? {}), ...pending } } : {}), updatedAt: new Date() })
        .where(eq(stores.id, store.id))
        .returning();
      if (!row) throw new Error('Falha ao atualizar a loja');
      if (input.extraCategoryIds !== undefined) {
        await tx.delete(storeExtraCategories).where(eq(storeExtraCategories.storeId, store.id));
        if (input.extraCategoryIds.length > 0) await tx.insert(storeExtraCategories).values(input.extraCategoryIds.map((categoryId) => ({ storeId: store.id, categoryId })));
      }
      // Em correção, mexer nos dados resolve o item "dados da loja" (WB-054 C3).
      if (store.status === 'correction_requested') {
        await tx
          .update(storeReviewItems)
          .set({ resolvedAt: new Date() })
          .where(and(eq(storeReviewItems.storeId, store.id), eq(storeReviewItems.item, 'store_data'), isNull(storeReviewItems.resolvedAt)));
      }
      if (actor.kind === 'admin') {
        await this.audit.record(tx, ctx, { action: 'store.update', targetType: 'store', targetId: store.id, before: this.auditView(before), after: this.auditView(row) });
      }
      return row;
    });
    return { store: updated, pendingReview: Object.keys(pending).length > 0 };
  }

  /** O que vai à auditoria: sem dado sensível além do necessário (documento mascarado). */
  auditView(store: Store): Record<string, unknown> {
    return {
      status: store.status,
      name: store.name,
      description: store.description,
      phone: store.phone,
      whatsapp: store.whatsapp,
      mainCategoryId: store.mainCategoryId,
      addressCep: store.addressCep,
      addressNumber: store.addressNumber,
      addressCityName: store.addressCityName,
      document: maskDocument(store.documentNumber),
    };
  }

  // -------------------------------------------------------------- documentos

  /** Anexa um upload concluído como documento; o reenvio substitui o anterior e mantém o histórico (R-28d). */
  async attachDocument(store: Store, kind: StoreDocumentKind, uploadId: string, principal: Principal): Promise<void> {
    this.assertProfileEditable(store);
    if (store.status === 'approved') throw errors.conflict('STORE_NOT_EDITABLE', 'Documentos só mudam durante o cadastro ou a correção');
    if (!REQUIRED_DOCUMENTS[store.documentType].includes(kind)) {
      throw errors.unprocessable('DOCUMENT_KIND_NOT_REQUIRED', 'Documento não exigido para este cadastro', { errors: [{ field: 'kind', message: 'Esse documento não é exigido para o seu tipo de cadastro.' }] });
    }
    const asset = await this.media.requireReady(uploadId, { storeId: store.id, purposes: ['store_document'] });
    await this.db.transaction(async (tx) => {
      await tx
        .update(storeDocuments)
        .set({ supersededAt: new Date() })
        .where(and(eq(storeDocuments.storeId, store.id), eq(storeDocuments.kind, kind), isNull(storeDocuments.supersededAt)));
      await tx.insert(storeDocuments).values({ storeId: store.id, kind, assetId: asset.id, uploadedBy: principal.userId });
      await tx
        .update(storeReviewItems)
        .set({ resolvedAt: new Date() })
        .where(and(eq(storeReviewItems.storeId, store.id), eq(storeReviewItems.item, kind), isNull(storeReviewItems.resolvedAt)));
    });
  }

  /** O dono vê o que enviou (tipo, data), nunca baixa (R-28b). Nenhum campo de chave de objeto sai daqui. */
  async listDocuments(storeId: string) {
    const rows = await this.db.select().from(storeDocuments).where(eq(storeDocuments.storeId, storeId)).orderBy(storeDocuments.createdAt);
    return rows.map((row) => ({ id: row.id, kind: row.kind, uploadedAt: row.createdAt.toISOString(), current: row.supersededAt === null }));
  }

  // ----------------------------------------------------------------- envio

  /** O que falta para enviar à análise (WB-051/052/053): lista com o campo e a mensagem. */
  async missingForSubmit(store: Store): Promise<{ field: string; message: string }[]> {
    const missing: { field: string; message: string }[] = [];
    if (!store.name) missing.push({ field: 'name', message: 'Informe o nome da loja.' });
    if (!store.mainCategoryId) missing.push({ field: 'mainCategoryId', message: 'Escolha a categoria principal.' });
    if (!store.whatsapp && !store.phone) missing.push({ field: 'whatsapp', message: 'Informe o WhatsApp ou o telefone.' });
    if (!store.addressCep || store.lat === null || store.lng === null) missing.push({ field: 'address', message: 'Informe o endereço da loja.' });
    if (store.documentType === 'cnpj' && (!store.legalName || !store.fiscalAcceptedAt)) missing.push({ field: 'legalName', message: 'Informe a razão social e aceite a responsabilidade fiscal.' });
    const docs = await this.db
      .select({ kind: storeDocuments.kind })
      .from(storeDocuments)
      .where(and(eq(storeDocuments.storeId, store.id), isNull(storeDocuments.supersededAt)));
    const have = new Set(docs.map((d) => d.kind));
    for (const kind of REQUIRED_DOCUMENTS[store.documentType]) {
      if (!have.has(kind)) missing.push({ field: `documents.${kind}`, message: `Falta o documento: ${DOCUMENT_LABELS[kind]}.` });
    }
    if (!(await this.paymentAccountStatus(store.id))) missing.push({ field: 'paymentAccount', message: 'Conecte a conta de recebimento.' });
    const open = await this.db.select().from(storeReviewItems).where(and(eq(storeReviewItems.storeId, store.id), isNull(storeReviewItems.resolvedAt)));
    for (const item of open) missing.push({ field: `review.${item.item}`, message: `Corrija o item reprovado: ${item.item === 'store_data' ? 'dados da loja' : (DOCUMENT_LABELS[item.item as StoreDocumentKind] ?? item.item)}.` });
    return missing;
  }

  async submit(store: Store, actorId: string): Promise<Store> {
    const missing = await this.missingForSubmit(store);
    if (missing.length > 0) throw errors.unprocessable('ONBOARDING_INCOMPLETE', 'Faltam itens para enviar a loja', { errors: missing, detail: 'Complete o que falta e envie de novo.' });
    return this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(stores).where(eq(stores.id, store.id)).for('update');
      if (!locked) throw errors.notFound('Loja não encontrada.');
      if (!canTransitionStore(locked.status, 'in_review', 'merchant')) {
        throw errors.conflict('INVALID_STORE_TRANSITION', 'A loja não pode ser enviada agora', `Status atual: ${locked.status}.`);
      }
      const now = new Date();
      // Reenvio: o SLA volta a contar do ponto em que parou (RN-16).
      const slaStartedAt = locked.status === 'correction_requested' ? new Date(now.getTime() - (locked.slaElapsedMs ?? 0)) : now;
      const [row] = await tx
        .update(stores)
        .set({ status: 'in_review', submittedAt: locked.submittedAt ?? now, slaStartedAt, updatedAt: now })
        .where(eq(stores.id, store.id))
        .returning();
      if (!row) throw new Error('Falha ao enviar a loja');
      await tx.insert(storeStatusHistory).values({ storeId: store.id, fromStatus: locked.status, toStatus: 'in_review', actorId });
      return row;
    });
  }

  async statusHistory(storeId: string) {
    return this.db.select().from(storeStatusHistory).where(eq(storeStatusHistory.storeId, storeId)).orderBy(storeStatusHistory.createdAt);
  }

  async openReviewItems(storeId: string) {
    return this.db.select().from(storeReviewItems).where(and(eq(storeReviewItems.storeId, storeId), isNull(storeReviewItems.resolvedAt)));
  }

  async ownerEmail(store: Store): Promise<{ email: string; name: string }> {
    const [row] = await this.db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, store.ownerUserId));
    return row ?? { email: '', name: '' };
  }

  /** Registro de atividade da loja (quem fez o quê), usado pelo catálogo. Sem dado do cliente. */
  async logActivity(executor: DbOrTx, storeId: string, actorId: string | null, action: string, details: Record<string, unknown>): Promise<void> {
    await executor.insert(storeActivity).values({ storeId, actorId, action, details });
  }

  /** WB-107 C4: sinaliza a loja para análise de suspensão (idempotente; a decisão é do admin). */
  async flagSuspensionReview(storeId: string): Promise<boolean> {
    const rows = await this.db
      .update(stores)
      .set({ suspensionReviewFlaggedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(stores.id, storeId), isNull(stores.suspensionReviewFlaggedAt)))
      .returning({ id: stores.id });
    return rows.length > 0;
  }

  /** Dias úteis do SLA de aprovação (parâmetro). */
  slaDays(): Promise<number> {
    return this.params.getNumber('aprovacao_loja_sla_dias_uteis');
  }

  /** Soma um valor por SQL cru para quem precisa de expressões PostGIS (distância entre a loja e um ponto), em metros. */
  async distanceMeters(storeId: string, point: { lat: number; lng: number }): Promise<number | null> {
    const result = await this.db.execute(
      sql`select ST_Distance(location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography) as d from stores where id = ${storeId} and location is not null`,
    );
    const row = result.rows[0] as { d: number | string } | undefined;
    return row ? Number(row.d) : null;
  }
}

export const DOCUMENT_LABELS: Record<StoreDocumentKind, string> = {
  id_front: 'RG ou CNH (frente)',
  id_back: 'RG ou CNH (verso)',
  address_proof: 'comprovante de endereço da loja',
  cnpj_card: 'cartão CNPJ',
  responsible_id: 'documento do responsável',
};
export { STORE_DOCUMENT_KINDS };

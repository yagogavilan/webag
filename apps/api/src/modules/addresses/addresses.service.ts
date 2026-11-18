import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ParametersService, RegionsService } from '../admin/index.js';
import { GEOCODING_PROVIDER, type GeocodingProvider } from '../stores/index.js';
import type { CreateAddressInput, UpdateAddressInput } from './addresses.schemas.js';
import { userAddresses } from './db/schema.js';
import { users } from '../identity/db/schema.js';

export type Address = typeof userAddresses.$inferSelect;

export const presentAddress = (a: Address) => ({
  id: a.id,
  label: a.label,
  cep: a.cep,
  street: a.street,
  number: a.number,
  complement: a.complement,
  neighborhood: a.neighborhood,
  city: a.cityName,
  state: a.state,
  cityId: a.cityId,
  lat: a.lat,
  lng: a.lng,
  isDefault: a.isDefault,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

/** Endereços salvos (WB-003, DEC-028). Toda leitura e escrita filtra por `user_id` do token: BOLA vira 404 (SEC-020). */
@Injectable()
export class AddressesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(GEOCODING_PROVIDER) private readonly geocoding: GeocodingProvider,
    private readonly regions: RegionsService,
    private readonly parameters: ParametersService,
  ) {}

  async list(userId: string): Promise<Address[]> {
    return this.db.select().from(userAddresses).where(eq(userAddresses.userId, userId)).orderBy(desc(userAddresses.isDefault), asc(userAddresses.createdAt));
  }

  /** Endereço do usuário ou 404 (também para o de outra conta, sem revelar existência). */
  async get(userId: string, id: string): Promise<Address> {
    const [row] = await this.db.select().from(userAddresses).where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)));
    if (!row) throw errors.notFound('Endereço não encontrado.');
    return row;
  }

  /** Ponto: o do GPS do aparelho, ou o do CEP. Sem nenhum dos dois, 422 e o app pede a posição (WB-002 C3). */
  private async point(cep: string, given: { lat?: number | undefined; lng?: number | undefined }): Promise<{ lat: number; lng: number }> {
    if (given.lat !== undefined && given.lng !== undefined) return { lat: given.lat, lng: given.lng };
    const found = await this.geocoding.lookup(cep).catch(() => null);
    if (!found) throw errors.unprocessable('ADDRESS_GEOCODING_FAILED', 'Não conseguimos localizar o endereço', { detail: 'Confirme a posição para continuar.' });
    return { lat: found.lat, lng: found.lng };
  }

  private async served(city: string, state: string, neighborhood: string): Promise<{ cityId: string; neighborhoodId: string | null }> {
    const region = await this.regions.resolveServed(city, state, neighborhood);
    if (!region) throw errors.unprocessable('REGION_NOT_SERVED', 'Ainda não entregamos aqui', { detail: `Ainda não chegamos em ${neighborhood || city}.` });
    return region;
  }

  async create(userId: string, input: CreateAddressInput): Promise<{ address: Address; created: boolean }> {
    const region = await this.served(input.city, input.state, input.neighborhood);
    const existing = await this.findDuplicate(userId, input.cep, input.number, input.complement ?? null);
    if (existing) return { address: existing, created: false };
    const point = await this.point(input.cep, input);
    const max = await this.parameters.getNumber('enderecos_max');
    const address = await this.db.transaction(async (tx) => {
      // Trava o usuário: duas criações simultâneas não passam do limite nem criam dois padrões.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
      const [{ count } = { count: 0 }] = await tx.select({ count: sql<number>`count(*)::int` }).from(userAddresses).where(eq(userAddresses.userId, userId));
      if (count >= max) throw errors.unprocessable('ADDRESS_LIMIT_REACHED', `Limite de ${max} endereços`, { detail: `Limite de ${max} endereços. Apague um para adicionar.` });
      const makeDefault = input.isDefault === true || count === 0;
      if (makeDefault) await tx.update(userAddresses).set({ isDefault: false }).where(eq(userAddresses.userId, userId));
      const [row] = await tx
        .insert(userAddresses)
        .values({
          userId,
          label: input.label ?? null,
          cep: input.cep,
          street: input.street,
          number: input.number,
          complement: input.complement ?? null,
          neighborhood: input.neighborhood,
          cityName: input.city,
          state: input.state.toUpperCase(),
          cityId: region.cityId,
          neighborhoodId: region.neighborhoodId,
          lat: point.lat,
          lng: point.lng,
          isDefault: makeDefault,
        })
        .returning();
      if (!row) throw new Error('Endereço não criado');
      return row;
    });
    return { address, created: true };
  }

  private async findDuplicate(userId: string, cep: string, number: string, complement: string | null, exceptId?: string): Promise<Address | undefined> {
    const [row] = await this.db
      .select()
      .from(userAddresses)
      .where(
        and(
          eq(userAddresses.userId, userId),
          eq(userAddresses.cep, cep),
          sql`lower(${userAddresses.number}) = lower(${number})`,
          sql`lower(coalesce(${userAddresses.complement}, '')) = lower(${complement ?? ''})`,
          exceptId ? ne(userAddresses.id, exceptId) : undefined,
        ),
      );
    return row;
  }

  async update(userId: string, id: string, input: UpdateAddressInput): Promise<Address> {
    const current = await this.get(userId, id);
    const next = {
      cep: input.cep ?? current.cep,
      number: input.number ?? current.number,
      complement: input.complement === undefined ? current.complement : input.complement,
      city: input.city ?? current.cityName,
      state: (input.state ?? current.state).toUpperCase(),
      neighborhood: input.neighborhood ?? current.neighborhood,
    };
    const placeChanged = input.cep !== undefined || input.city !== undefined || input.state !== undefined || input.neighborhood !== undefined;
    const region = placeChanged ? await this.served(next.city, next.state, next.neighborhood) : { cityId: current.cityId, neighborhoodId: current.neighborhoodId };
    if (await this.findDuplicate(userId, next.cep, next.number, next.complement, id)) throw errors.conflict('ADDRESS_DUPLICATE', 'Endereço repetido', 'Você já tem esse endereço salvo.');
    const point = input.lat !== undefined || input.cep !== undefined ? await this.point(next.cep, input) : { lat: current.lat, lng: current.lng };
    return this.db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
      if (input.isDefault) await tx.update(userAddresses).set({ isDefault: false }).where(and(eq(userAddresses.userId, userId), ne(userAddresses.id, id)));
      const [row] = await tx
        .update(userAddresses)
        .set({
          label: input.label === undefined ? current.label : input.label,
          cep: next.cep,
          street: input.street ?? current.street,
          number: next.number,
          complement: next.complement,
          neighborhood: next.neighborhood,
          cityName: next.city,
          state: next.state,
          cityId: region.cityId,
          neighborhoodId: region.neighborhoodId,
          lat: point.lat,
          lng: point.lng,
          isDefault: input.isDefault ? true : current.isDefault,
          updatedAt: new Date(),
        })
        .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
        .returning();
      if (!row) throw errors.notFound('Endereço não encontrado.');
      return row;
    });
  }

  /** Apagar o padrão promove o mais antigo restante (sempre há um padrão se houver endereço). */
  async remove(userId: string, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
      const [gone] = await tx.delete(userAddresses).where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId))).returning();
      if (!gone) throw errors.notFound('Endereço não encontrado.');
      if (!gone.isDefault) return;
      const [next] = await tx.select().from(userAddresses).where(eq(userAddresses.userId, userId)).orderBy(asc(userAddresses.createdAt)).limit(1);
      if (next) await tx.update(userAddresses).set({ isDefault: true }).where(eq(userAddresses.id, next.id));
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { CacheService } from '../../platform/cache/cache.service.js';
import { StorefrontCacheService } from '../../platform/cache/storefront-cache.service.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { cities, neighborhoods } from './db/schema.js';
import { isUniqueViolation, slugify } from './util.js';

export type City = typeof cities.$inferSelect;
export type Neighborhood = typeof neighborhoods.$inferSelect;

/** WB-118: cidades e bairros atendidos. Inativar não apaga: pedidos em andamento seguem. */
@Injectable()
export class RegionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly storefront: StorefrontCacheService,
  ) {}

  /** Lista pública (cidades e bairros ativos), em cache de 60 s; escrita de região invalida o namespace. */
  async listPublic() {
    return this.cache.wrap('regions', 'public', 60, async () => {
      const cities = await this.listCities(true);
      return cities.map((c) => ({ id: c.id, name: c.name, state: c.state, slug: c.slug, neighborhoods: c.neighborhoods.map((n) => ({ id: n.id, name: n.name })) }));
    });
  }

  /** Executa a escrita e invalida o cache público de regiões (também em caso de sucesso parcial não há o que invalidar). */
  async invalidating<T>(write: () => Promise<T>): Promise<T> {
    const result = await write();
    await this.cache.bump('regions');
    return result;
  }

  async listCities(onlyActive = false): Promise<(City & { neighborhoods: Neighborhood[] })[]> {
    const [cityRows, hoodRows] = await Promise.all([
      this.db.select().from(cities).orderBy(asc(cities.name)),
      this.db.select().from(neighborhoods).orderBy(asc(neighborhoods.name)),
    ]);
    return cityRows
      .filter((city) => !onlyActive || city.active)
      .map((city) => ({
        ...city,
        neighborhoods: hoodRows.filter((hood) => hood.cityId === city.id && (!onlyActive || hood.active)),
      }));
  }

  /**
   * Região atendida de um endereço (RN-03): a cidade precisa existir e estar ativa; o bairro só conta se estiver
   * cadastrado (bairro cadastrado e inativo bloqueia; bairro não cadastrado segue a regra da cidade).
   */
  async resolveServed(cityName: string, state: string, neighborhoodName: string): Promise<{ cityId: string; neighborhoodId: string | null } | null> {
    const norm = (text: string): string => slugify(text);
    const [cityRows, hoodRows] = await Promise.all([
      this.db.select().from(cities).where(eq(cities.state, state.toUpperCase())),
      this.db.select().from(neighborhoods),
    ]);
    const city = cityRows.find((c) => norm(c.name) === norm(cityName));
    if (!city?.active) return null;
    const hood = hoodRows.find((h) => h.cityId === city.id && norm(h.name) === norm(neighborhoodName));
    if (hood && !hood.active) return null;
    return { cityId: city.id, neighborhoodId: hood?.id ?? null };
  }

  async createCity(input: { name: string; state: string; active: boolean }, ctx: RequestContext): Promise<City> {
    try {
      return await this.db.transaction(async (tx) => {
        const [city] = await tx
          .insert(cities)
          .values({ name: input.name, state: input.state.toUpperCase(), slug: slugify(`${input.name}-${input.state}`), active: input.active })
          .returning();
        if (!city) throw new Error('Falha ao criar cidade');
        await this.audit.record(tx, ctx, { action: 'city.create', targetType: 'city', targetId: city.id, after: { ...city } });
        return city;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('CITY_EXISTS', 'Cidade já cadastrada');
      throw error;
    }
  }

  async updateCity(id: string, patch: { name?: string; active?: boolean }, ctx: RequestContext): Promise<City> {
    const updated = await this.updateCityInTx(id, patch, ctx);
    // DEC-113: cidade ativada/desativada muda quais lojas a descoberta mostra (o catálogo exige `cities.active`); vale em até 5 s.
    if (patch.active !== undefined) await this.storefront.everythingChanged();
    return updated;
  }

  private async updateCityInTx(id: string, patch: { name?: string; active?: boolean }, ctx: RequestContext): Promise<City> {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(cities).where(eq(cities.id, id)).for('update');
      if (!before) throw errors.notFound('Cidade não encontrada.');
      const [after] = await tx
        .update(cities)
        .set({ ...patch, ...(patch.name ? { slug: slugify(`${patch.name}-${before.state}`) } : {}), updatedAt: new Date() })
        .where(eq(cities.id, id))
        .returning();
      if (!after) throw new Error('Falha ao atualizar cidade');
      await this.audit.record(tx, ctx, { action: 'city.update', targetType: 'city', targetId: id, before: { ...before }, after: { ...after } });
      return after;
    });
  }

  async createNeighborhood(cityId: string, input: { name: string; active: boolean }, ctx: RequestContext): Promise<Neighborhood> {
    try {
      return await this.db.transaction(async (tx) => {
        const [city] = await tx.select({ id: cities.id }).from(cities).where(eq(cities.id, cityId));
        if (!city) throw errors.notFound('Cidade não encontrada.');
        const [hood] = await tx.insert(neighborhoods).values({ cityId, name: input.name, active: input.active }).returning();
        if (!hood) throw new Error('Falha ao criar bairro');
        await this.audit.record(tx, ctx, { action: 'neighborhood.create', targetType: 'neighborhood', targetId: hood.id, after: { ...hood } });
        return hood;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('NEIGHBORHOOD_EXISTS', 'Bairro já cadastrado nesta cidade');
      throw error;
    }
  }

  async updateNeighborhood(id: string, patch: { name?: string; active?: boolean }, ctx: RequestContext): Promise<Neighborhood> {
    try {
      return await this.db.transaction(async (tx) => {
        const [before] = await tx.select().from(neighborhoods).where(eq(neighborhoods.id, id)).for('update');
        if (!before) throw errors.notFound('Bairro não encontrado.');
        const [after] = await tx.update(neighborhoods).set({ ...patch, updatedAt: new Date() }).where(eq(neighborhoods.id, id)).returning();
        if (!after) throw new Error('Falha ao atualizar bairro');
        await this.audit.record(tx, ctx, { action: 'neighborhood.update', targetType: 'neighborhood', targetId: id, before: { ...before }, after: { ...after } });
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('NEIGHBORHOOD_EXISTS', 'Bairro já cadastrado nesta cidade');
      throw error;
    }
  }
}

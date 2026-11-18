import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
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
  ) {}

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

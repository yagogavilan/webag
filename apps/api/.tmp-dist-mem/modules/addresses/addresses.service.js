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
var AddressesService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { ParametersService, RegionsService } from '../admin/index.js';
import { GEOCODING_PROVIDER } from '../stores/index.js';
import { userAddresses } from './db/schema.js';
import { users } from '../identity/db/schema.js';
const normalizeName = (name) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
/** Distância em metros entre dois pontos (haversine); basta para conferir o pino contra o centro do CEP. */
function haversineMeters(a, b) {
    const rad = (deg) => (deg * Math.PI) / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
export const presentAddress = (a) => ({
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
    pinVerified: a.pinVerified,
    isDefault: a.isDefault,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
});
/** Endereços salvos (WB-003, DEC-028). Toda leitura e escrita filtra por `user_id` do token: BOLA vira 404 (SEC-020). */
let AddressesService = AddressesService_1 = class AddressesService {
    db;
    geocoding;
    regions;
    parameters;
    logger = new Logger(AddressesService_1.name);
    constructor(db, geocoding, regions, parameters) {
        this.db = db;
        this.geocoding = geocoding;
        this.regions = regions;
        this.parameters = parameters;
    }
    async list(userId) {
        return this.db.select().from(userAddresses).where(eq(userAddresses.userId, userId)).orderBy(desc(userAddresses.isDefault), asc(userAddresses.createdAt));
    }
    /** Endereço do usuário ou 404 (também para o de outra conta, sem revelar existência). */
    async get(userId, id) {
        const [row] = await this.db.select().from(userAddresses).where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)));
        if (!row)
            throw errors.notFound('Endereço não encontrado.');
        return row;
    }
    /**
     * Ponto do endereço: o do GPS do aparelho, ou o centro do CEP. SEC-169: o ponto do app NÃO é confiável (raio, teto de ETA e faixa de
     * frete saem dele). Regras, nesta ordem:
     * 1. CEP inexistente (ViaCEP) = 422 `ADDRESS_CEP_NOT_FOUND`, com ou sem ponto (antes, qualquer ponto passava).
     * 2. CEP de outro município ou UF que o informado = 422 `ADDRESS_CEP_CITY_MISMATCH`.
     * 3. Com o geocodificador ligado (`GEOCODER_URL`) e no ar, o ponto é conferido contra o centro do CEP (`endereco_pino_max_m`):
     *    longe demais = 422 `ADDRESS_PIN_FAR_FROM_CEP`. `pinVerified = true`.
     * 4. Sem geocodificador (desligado, padrão) ou fora do ar, ou ViaCEP fora: aceita o ponto do app, valida só município/UF (quando o
     *    ViaCEP responde) e o raio/teto de entrega da loja (na cotação), e grava `pinVerified = false`. Sem ponto nenhum: 422
     *    `ADDRESS_GEOCODING_FAILED` e o app pede a posição.
     * Nunca chama o Nominatim público: o provedor é o configurado em `GEOCODER_URL` e o resultado é cacheado por CEP.
     */
    async point(cep, city, state, given) {
        let info = null;
        let cepServiceDown = false;
        try {
            info = await this.geocoding.lookupCep(cep);
            if (info === null)
                throw errors.unprocessable('ADDRESS_CEP_NOT_FOUND', 'CEP não encontrado', { detail: 'Não encontramos esse CEP. Confira os números.' });
        }
        catch (error) {
            if (error instanceof AppError && error.code === 'ADDRESS_CEP_NOT_FOUND')
                throw error;
            cepServiceDown = true;
            this.logger.warn(`consulta de CEP indisponível; endereço aceito com o pino sem conferir: ${error.message}`);
        }
        if (info) {
            if (normalizeName(info.city) !== normalizeName(city) || info.state.toUpperCase() !== state.toUpperCase()) {
                throw errors.unprocessable('ADDRESS_CEP_CITY_MISMATCH', 'O CEP é de outra cidade', { detail: `Esse CEP pertence a ${info.city}/${info.state}. Confira a cidade e o CEP.` });
            }
        }
        const center = info && !cepServiceDown ? await this.geocoding.centerOf(info) : null;
        if (given.lat !== undefined && given.lng !== undefined) {
            const maxM = await this.parameters.getNumber('endereco_pino_max_m');
            if (center && maxM > 0 && haversineMeters({ lat: given.lat, lng: given.lng }, center) > maxM) {
                throw errors.unprocessable('ADDRESS_PIN_FAR_FROM_CEP', 'A posição está longe do CEP', { detail: 'A posição marcada no mapa está longe do CEP informado. Confirme o endereço no mapa.' });
            }
            return { lat: given.lat, lng: given.lng, pinVerified: center !== null && maxM > 0 };
        }
        if (!center)
            throw errors.unprocessable('ADDRESS_GEOCODING_FAILED', 'Não conseguimos localizar o endereço', { detail: 'Confirme a posição para continuar.' });
        return { lat: center.lat, lng: center.lng, pinVerified: true };
    }
    async served(city, state, neighborhood) {
        const region = await this.regions.resolveServed(city, state, neighborhood);
        if (!region)
            throw errors.unprocessable('REGION_NOT_SERVED', 'Ainda não entregamos aqui', { detail: `Ainda não chegamos em ${neighborhood || city}.` });
        return region;
    }
    async create(userId, input) {
        const region = await this.served(input.city, input.state, input.neighborhood);
        const existing = await this.findDuplicate(userId, input.cep, input.number, input.complement ?? null);
        if (existing)
            return { address: existing, created: false };
        const point = await this.point(input.cep, input.city, input.state, input);
        const max = await this.parameters.getNumber('enderecos_max');
        const address = await this.db.transaction(async (tx) => {
            // Trava o usuário: duas criações simultâneas não passam do limite nem criam dois padrões.
            await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
            const [{ count } = { count: 0 }] = await tx.select({ count: sql `count(*)::int` }).from(userAddresses).where(eq(userAddresses.userId, userId));
            if (count >= max)
                throw errors.unprocessable('ADDRESS_LIMIT_REACHED', `Limite de ${max} endereços`, { detail: `Limite de ${max} endereços. Apague um para adicionar.` });
            const makeDefault = input.isDefault === true || count === 0;
            if (makeDefault)
                await tx.update(userAddresses).set({ isDefault: false }).where(eq(userAddresses.userId, userId));
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
                pinVerified: point.pinVerified,
                isDefault: makeDefault,
            })
                .returning();
            if (!row)
                throw new Error('Endereço não criado');
            return row;
        });
        return { address, created: true };
    }
    async findDuplicate(userId, cep, number, complement, exceptId) {
        const [row] = await this.db
            .select()
            .from(userAddresses)
            .where(and(eq(userAddresses.userId, userId), eq(userAddresses.cep, cep), sql `lower(${userAddresses.number}) = lower(${number})`, sql `lower(coalesce(${userAddresses.complement}, '')) = lower(${complement ?? ''})`, exceptId ? ne(userAddresses.id, exceptId) : undefined));
        return row;
    }
    async update(userId, id, input) {
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
        if (await this.findDuplicate(userId, next.cep, next.number, next.complement, id))
            throw errors.conflict('ADDRESS_DUPLICATE', 'Endereço repetido', 'Você já tem esse endereço salvo.');
        const point = input.lat !== undefined || input.cep !== undefined ? await this.point(next.cep, next.city, next.state, input) : { lat: current.lat, lng: current.lng, pinVerified: current.pinVerified };
        return this.db.transaction(async (tx) => {
            await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
            if (input.isDefault)
                await tx.update(userAddresses).set({ isDefault: false }).where(and(eq(userAddresses.userId, userId), ne(userAddresses.id, id)));
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
                pinVerified: point.pinVerified,
                isDefault: input.isDefault ? true : current.isDefault,
                updatedAt: new Date(),
            })
                .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
                .returning();
            if (!row)
                throw errors.notFound('Endereço não encontrado.');
            return row;
        });
    }
    /** Apagar o padrão promove o mais antigo restante (sempre há um padrão se houver endereço). */
    async remove(userId, id) {
        await this.db.transaction(async (tx) => {
            await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
            const [gone] = await tx.delete(userAddresses).where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId))).returning();
            if (!gone)
                throw errors.notFound('Endereço não encontrado.');
            if (!gone.isDefault)
                return;
            const [next] = await tx.select().from(userAddresses).where(eq(userAddresses.userId, userId)).orderBy(asc(userAddresses.createdAt)).limit(1);
            if (next)
                await tx.update(userAddresses).set({ isDefault: true }).where(eq(userAddresses.id, next.id));
        });
    }
};
AddressesService = AddressesService_1 = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __param(1, Inject(GEOCODING_PROVIDER)),
    __metadata("design:paramtypes", [Object, Object, RegionsService,
        ParametersService])
], AddressesService);
export { AddressesService };
//# sourceMappingURL=addresses.service.js.map
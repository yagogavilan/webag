var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var HttpGeocodingProvider_1;
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../platform/cache/cache.service.js';
import { AppError } from '../../platform/http/app-error.js';
export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');
/**
 * Centros reais (aproximados) das cidades atendidas; o provedor fake os usa e espalha o ponto de forma DETERMINÍSTICA
 * pelos dígitos do CEP (até ~1,5 km), sem rede. Coordenadas dos centros: [HIPÓTESE] aproximadas, conferir no mapa.
 */
const CITY_CENTERS = [
    { prefix: '079', city: 'Francisco Morato', lat: -23.2811, lng: -46.7452, hoods: ['Centro', 'Jardim Alegria', 'Vila Rosa', 'Jardim Dos Eucaliptos', 'Jardim Santa Rita'] },
    { prefix: '078', city: 'Franco da Rocha', lat: -23.3216, lng: -46.7263, hoods: ['Centro', 'Vila Rosalina', 'Jardim Luciana', 'Vila Lanfranchi'] },
    { prefix: '077', city: 'Caieiras', lat: -23.3640, lng: -46.7407, hoods: ['Centro', 'Laranjeiras', 'Jardim São Judas'] },
    { prefix: '132', city: 'Campo Limpo Paulista', lat: -23.2079, lng: -46.7881, hoods: ['Centro', 'Jardim Bom Jesus', 'Vila Pires'] },
];
let FakeGeocodingProvider = class FakeGeocodingProvider {
    entryOf(digits) {
        return CITY_CENTERS.find((c) => digits.startsWith(c.prefix));
    }
    lookupCep(cep) {
        const digits = cep.replace(/\D/g, '');
        const entry = this.entryOf(digits);
        if (digits.length !== 8 || !entry)
            return Promise.resolve(digits.startsWith('000') ? null : unknownCity(digits));
        const n = Number(digits.slice(3));
        return Promise.resolve({ cep: digits, street: `Rua ${n % 90 === 0 ? 'Principal' : `Exemplo ${n % 90}`}`, neighborhood: entry.hoods[n % entry.hoods.length] ?? 'Centro', city: entry.city, state: 'SP' });
    }
    centerOf(info) {
        const entry = this.entryOf(info.cep);
        if (!entry)
            return Promise.resolve(info.city === 'São Paulo' ? { lat: -23.55052, lng: -46.633308 } : null);
        const n = Number(info.cep.slice(3));
        const dLat = (((n * 7919) % 2000) - 1000) / 1000 / 70; // ~ +-1,6 km
        const dLng = (((n * 104729) % 2000) - 1000) / 1000 / 70;
        return Promise.resolve({ lat: Number((entry.lat + dLat).toFixed(6)), lng: Number((entry.lng + dLng).toFixed(6)) });
    }
    async lookup(cep) {
        const info = await this.lookupCep(cep);
        if (!info)
            return null;
        const center = await this.centerOf(info);
        return { ...info, lat: center?.lat ?? null, lng: center?.lng ?? null };
    }
};
FakeGeocodingProvider = __decorate([
    Injectable()
], FakeGeocodingProvider);
export { FakeGeocodingProvider };
/** CEP de outra cidade (ex.: São Paulo): existe, mas fora das regiões atendidas. */
function unknownCity(digits) {
    return { cep: digits, street: 'Rua Exemplo', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' };
}
const DAY_S = 86_400;
const CEP_TTL_S = 30 * DAY_S; // CEP muda raramente
const MISS_TTL_S = DAY_S; // "não achei" vale pouco: o CEP pode passar a existir e o geocodificador pode ganhar a rua
const BACKOFF_MS = 60_000; // fora do ar: não insiste por 1 min (evita 4 s de timeout em cada endereço)
/** Caixa do Brasil: descarta coordenada absurda devolvida pelo provedor. */
const inBrazil = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -34 && lat <= 6 && lng >= -74 && lng <= -33;
/**
 * ViaCEP (existência e logradouro) + geocodificador OPCIONAL (`GEOCODER_URL`, vazio = desligado) atrás da mesma interface, com timeout e
 * cache por CEP (30 dias; "não achou" por 1 dia) em Redis. O geocodificador recebe só rua, cidade e UF DO CEP (nunca o número, o
 * complemento nem dado de conta) e, por isso, o cache é seguro e o volume é de CEPs distintos, não de pedidos. O Nominatim público nunca é
 * usado por padrão (a política dele proíbe o volume de endereços de clientes; ADR-008): sem `GEOCODER_URL` só se valida CEP, município e UF.
 * [NÃO TESTADO contra a rede real nesta sessão: sem acesso externo; os testes usam `fetch` simulado.]
 */
let HttpGeocodingProvider = HttpGeocodingProvider_1 = class HttpGeocodingProvider {
    config;
    cache;
    logger = new Logger(HttpGeocodingProvider_1.name);
    cepDownUntil = 0;
    geocoderDownUntil = 0;
    constructor(config, cache) {
        this.config = config;
        this.cache = cache;
    }
    async json(url, headers = {}) {
        const response = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
        if (!response.ok)
            throw new AppError(502, 'GEOCODING_UNAVAILABLE', 'Serviço de CEP indisponível');
        return response.json();
    }
    async lookupCep(cep) {
        const digits = cep.replace(/\D/g, '');
        return this.cache.wrap('geo-cep', digits, (value) => (value ? CEP_TTL_S : MISS_TTL_S), async () => {
            if (Date.now() < this.cepDownUntil)
                throw new AppError(502, 'GEOCODING_UNAVAILABLE', 'Serviço de CEP indisponível');
            try {
                const via = (await this.json(`https://viacep.com.br/ws/${digits}/json/`));
                if (via.erro || !via.localidade)
                    return null;
                return { cep: digits, street: via.logradouro ?? '', neighborhood: via.bairro ?? '', city: via.localidade, state: (via.uf ?? 'SP').toUpperCase() };
            }
            catch (error) {
                this.cepDownUntil = Date.now() + BACKOFF_MS;
                throw error;
            }
        });
    }
    async centerOf(info) {
        const url = this.config.get('GEOCODER_URL', { infer: true });
        if (!url)
            return null; // desligado (padrão)
        try {
            return await this.cache.wrap('geo-center', info.cep, (value) => (value ? CEP_TTL_S : MISS_TTL_S), async () => {
                if (Date.now() < this.geocoderDownUntil)
                    throw new AppError(502, 'GEOCODING_UNAVAILABLE', 'Geocodificador indisponível'); // não grava no cache
                try {
                    const query = new URLSearchParams({ street: info.street, city: info.city, state: info.state, country: 'Brasil', format: 'json', limit: '1' });
                    const key = this.config.get('GEOCODER_API_KEY', { infer: true });
                    if (key)
                        query.set('key', key);
                    const rows = (await this.json(`${url}${url.includes('?') ? '&' : '?'}${query.toString()}`, { 'User-Agent': 'webag-api/1.0' }));
                    const first = Array.isArray(rows) ? rows[0] : undefined;
                    const lat = Number(first?.lat);
                    const lng = Number(first?.lon);
                    return first && inBrazil(lat, lng) ? { lat, lng } : null;
                }
                catch (error) {
                    this.geocoderDownUntil = Date.now() + BACKOFF_MS;
                    throw error;
                }
            });
        }
        catch (error) {
            this.logger.warn(`geocodificador indisponível: ${error.message}`);
            return null;
        }
    }
    async lookup(cep) {
        const info = await this.lookupCep(cep);
        if (!info)
            return null;
        const center = await this.centerOf(info);
        return { ...info, lat: center?.lat ?? null, lng: center?.lng ?? null };
    }
};
HttpGeocodingProvider = HttpGeocodingProvider_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ConfigService,
        CacheService])
], HttpGeocodingProvider);
export { HttpGeocodingProvider };
//# sourceMappingURL=geocoding.js.map
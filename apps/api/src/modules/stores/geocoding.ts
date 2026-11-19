import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../platform/config/env.js';
import { CacheService } from '../../platform/cache/cache.service.js';
import { AppError } from '../../platform/http/app-error.js';

/** Dados do CEP (ViaCEP): logradouro, bairro, cidade e UF. Nenhum dado de cliente. */
export interface CepInfo {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Resultado da consulta de CEP (ADR-008): logradouro, bairro, cidade e, se o geocodificador estiver ligado, a coordenada do centro do CEP. */
export interface CepResult extends CepInfo {
  lat: number | null;
  lng: number | null;
}

export interface GeocodingProvider {
  /** O CEP existe? `null` = CEP inexistente; lança se o serviço de CEP estiver fora do ar. */
  lookupCep(cep: string): Promise<CepInfo | null>;
  /** Centro aproximado do CEP. `null` = geocodificador desligado, fora do ar ou sem resultado. NUNCA lança (degradação elegante, SEC-169). */
  centerOf(info: CepInfo): Promise<GeoPoint | null>;
  /** CEP + centro (lojista). `null` só se o CEP não existe; `lat`/`lng` nulos sem geocodificador. */
  lookup(cep: string): Promise<CepResult | null>;
}

export const GEOCODING_PROVIDER = Symbol('GEOCODING_PROVIDER');

/**
 * Centros reais (aproximados) das cidades atendidas; o provedor fake os usa e espalha o ponto de forma DETERMINÍSTICA
 * pelos dígitos do CEP (até ~1,5 km), sem rede. Coordenadas dos centros: [HIPÓTESE] aproximadas, conferir no mapa.
 */
const CITY_CENTERS: { prefix: string; city: string; lat: number; lng: number; hoods: string[] }[] = [
  { prefix: '079', city: 'Francisco Morato', lat: -23.2811, lng: -46.7452, hoods: ['Centro', 'Jardim Alegria', 'Vila Rosa', 'Jardim Dos Eucaliptos', 'Jardim Santa Rita'] },
  { prefix: '078', city: 'Franco da Rocha', lat: -23.3216, lng: -46.7263, hoods: ['Centro', 'Vila Rosalina', 'Jardim Luciana', 'Vila Lanfranchi'] },
  { prefix: '077', city: 'Caieiras', lat: -23.3640, lng: -46.7407, hoods: ['Centro', 'Laranjeiras', 'Jardim São Judas'] },
  { prefix: '132', city: 'Campo Limpo Paulista', lat: -23.2079, lng: -46.7881, hoods: ['Centro', 'Jardim Bom Jesus', 'Vila Pires'] },
];

@Injectable()
export class FakeGeocodingProvider implements GeocodingProvider {
  private entryOf(digits: string) {
    return CITY_CENTERS.find((c) => digits.startsWith(c.prefix));
  }

  lookupCep(cep: string): Promise<CepInfo | null> {
    const digits = cep.replace(/\D/g, '');
    const entry = this.entryOf(digits);
    if (digits.length !== 8 || !entry) return Promise.resolve(digits.startsWith('000') ? null : unknownCity(digits));
    const n = Number(digits.slice(3));
    return Promise.resolve({ cep: digits, street: `Rua ${n % 90 === 0 ? 'Principal' : `Exemplo ${n % 90}`}`, neighborhood: entry.hoods[n % entry.hoods.length] ?? 'Centro', city: entry.city, state: 'SP' });
  }

  centerOf(info: CepInfo): Promise<GeoPoint | null> {
    const entry = this.entryOf(info.cep);
    if (!entry) return Promise.resolve(info.city === 'São Paulo' ? { lat: -23.55052, lng: -46.633308 } : null);
    const n = Number(info.cep.slice(3));
    const dLat = (((n * 7919) % 2000) - 1000) / 1000 / 70; // ~ +-1,6 km
    const dLng = (((n * 104729) % 2000) - 1000) / 1000 / 70;
    return Promise.resolve({ lat: Number((entry.lat + dLat).toFixed(6)), lng: Number((entry.lng + dLng).toFixed(6)) });
  }

  async lookup(cep: string): Promise<CepResult | null> {
    const info = await this.lookupCep(cep);
    if (!info) return null;
    const center = await this.centerOf(info);
    return { ...info, lat: center?.lat ?? null, lng: center?.lng ?? null };
  }
}

/** CEP de outra cidade (ex.: São Paulo): existe, mas fora das regiões atendidas. */
function unknownCity(digits: string): CepInfo {
  return { cep: digits, street: 'Rua Exemplo', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' };
}

const DAY_S = 86_400;
const CEP_TTL_S = 30 * DAY_S; // CEP muda raramente
const MISS_TTL_S = DAY_S; // "não achei" vale pouco: o CEP pode passar a existir e o geocodificador pode ganhar a rua
const BACKOFF_MS = 60_000; // fora do ar: não insiste por 1 min (evita 4 s de timeout em cada endereço)
/** Caixa do Brasil: descarta coordenada absurda devolvida pelo provedor. */
const inBrazil = (lat: number, lng: number): boolean => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -34 && lat <= 6 && lng >= -74 && lng <= -33;

/**
 * ViaCEP (existência e logradouro) + geocodificador OPCIONAL (`GEOCODER_URL`, vazio = desligado) atrás da mesma interface, com timeout e
 * cache por CEP (30 dias; "não achou" por 1 dia) em Redis. O geocodificador recebe só rua, cidade e UF DO CEP (nunca o número, o
 * complemento nem dado de conta) e, por isso, o cache é seguro e o volume é de CEPs distintos, não de pedidos. O Nominatim público nunca é
 * usado por padrão (a política dele proíbe o volume de endereços de clientes; ADR-008): sem `GEOCODER_URL` só se valida CEP, município e UF.
 * [NÃO TESTADO contra a rede real nesta sessão: sem acesso externo; os testes usam `fetch` simulado.]
 */
@Injectable()
export class HttpGeocodingProvider implements GeocodingProvider {
  private readonly logger = new Logger(HttpGeocodingProvider.name);
  private cepDownUntil = 0;
  private geocoderDownUntil = 0;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly cache: CacheService,
  ) {}

  private async json(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new AppError(502, 'GEOCODING_UNAVAILABLE', 'Serviço de CEP indisponível');
    return response.json();
  }

  async lookupCep(cep: string): Promise<CepInfo | null> {
    const digits = cep.replace(/\D/g, '');
    return this.cache.wrap<CepInfo | null>('geo-cep', digits, (value) => (value ? CEP_TTL_S : MISS_TTL_S), async () => {
      if (Date.now() < this.cepDownUntil) throw new AppError(502, 'GEOCODING_UNAVAILABLE', 'Serviço de CEP indisponível');
      try {
        const via = (await this.json(`https://viacep.com.br/ws/${digits}/json/`)) as { erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
        if (via.erro || !via.localidade) return null;
        return { cep: digits, street: via.logradouro ?? '', neighborhood: via.bairro ?? '', city: via.localidade, state: (via.uf ?? 'SP').toUpperCase() };
      } catch (error) {
        this.cepDownUntil = Date.now() + BACKOFF_MS;
        throw error;
      }
    });
  }

  async centerOf(info: CepInfo): Promise<GeoPoint | null> {
    const url = this.config.get('GEOCODER_URL', { infer: true });
    if (!url) return null; // desligado (padrão)
    try {
      return await this.cache.wrap<GeoPoint | null>('geo-center', info.cep, (value) => (value ? CEP_TTL_S : MISS_TTL_S), async () => {
        if (Date.now() < this.geocoderDownUntil) throw new AppError(502, 'GEOCODING_UNAVAILABLE', 'Geocodificador indisponível'); // não grava no cache
        try {
          const query = new URLSearchParams({ street: info.street, city: info.city, state: info.state, country: 'Brasil', format: 'json', limit: '1' });
          const key = this.config.get('GEOCODER_API_KEY', { infer: true });
          if (key) query.set('key', key);
          const rows = (await this.json(`${url}${url.includes('?') ? '&' : '?'}${query.toString()}`, { 'User-Agent': 'webag-api/1.0' })) as { lat?: string; lon?: string }[];
          const first = Array.isArray(rows) ? rows[0] : undefined;
          const lat = Number(first?.lat);
          const lng = Number(first?.lon);
          return first && inBrazil(lat, lng) ? { lat, lng } : null;
        } catch (error) {
          this.geocoderDownUntil = Date.now() + BACKOFF_MS;
          throw error;
        }
      });
    } catch (error) {
      this.logger.warn(`geocodificador indisponível: ${(error as Error).message}`);
      return null;
    }
  }

  async lookup(cep: string): Promise<CepResult | null> {
    const info = await this.lookupCep(cep);
    if (!info) return null;
    const center = await this.centerOf(info);
    return { ...info, lat: center?.lat ?? null, lng: center?.lng ?? null };
  }
}

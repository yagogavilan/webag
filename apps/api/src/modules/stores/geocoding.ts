import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../platform/config/env.js';
import { AppError } from '../../platform/http/app-error.js';

/** Resultado da consulta de CEP (ADR-008): logradouro, bairro, cidade e coordenada. */
export interface CepResult {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
}

export interface GeocodingProvider {
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
  lookup(cep: string): Promise<CepResult | null> {
    const digits = cep.replace(/\D/g, '');
    const entry = CITY_CENTERS.find((c) => digits.startsWith(c.prefix));
    if (digits.length !== 8 || !entry) return Promise.resolve(digits.startsWith('000') ? null : unknownCity(digits));
    const n = Number(digits.slice(3));
    const dLat = (((n * 7919) % 2000) - 1000) / 1000 / 70; // ~ +-1,6 km
    const dLng = (((n * 104729) % 2000) - 1000) / 1000 / 70;
    return Promise.resolve({
      cep: digits,
      street: `Rua ${n % 90 === 0 ? 'Principal' : `Exemplo ${n % 90}`}`,
      neighborhood: entry.hoods[n % entry.hoods.length] ?? 'Centro',
      city: entry.city,
      state: 'SP',
      lat: Number((entry.lat + dLat).toFixed(6)),
      lng: Number((entry.lng + dLng).toFixed(6)),
    });
  }
}

/** CEP de outra cidade (ex.: São Paulo): existe, mas fora das regiões atendidas. */
function unknownCity(digits: string): CepResult {
  return { cep: digits, street: 'Rua Exemplo', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', lat: -23.55052, lng: -46.633308 };
}

/**
 * ViaCEP (logradouro) + Nominatim (coordenada), atrás da mesma interface, com timeout. O Nominatim público pede <= 1
 * requisição por segundo e atribuição: serve ao cadastro de loja, não a volume (ADR-008). Sem coordenada, o painel
 * deixa o lojista ajustar o pino à mão. [NÃO TESTADO contra a rede real nesta sessão: sem acesso externo.]
 */
@Injectable()
export class HttpGeocodingProvider implements GeocodingProvider {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private async json(url: string, headers: Record<string, string> = {}): Promise<unknown> {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new AppError(502, 'GEOCODING_UNAVAILABLE', 'Serviço de CEP indisponível');
    return response.json();
  }

  async lookup(cep: string): Promise<CepResult | null> {
    const digits = cep.replace(/\D/g, '');
    const via = (await this.json(`https://viacep.com.br/ws/${digits}/json/`)) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
    if (via.erro) return null;
    const query = new URLSearchParams({ street: via.logradouro ?? '', city: via.localidade ?? '', state: via.uf ?? '', country: 'Brasil', format: 'json', limit: '1' });
    const geo = (await this.json(`https://nominatim.openstreetmap.org/search?${query.toString()}`, { 'User-Agent': 'webag-api/1.0 (cadastro de loja)' })) as { lat: string; lon: string }[];
    const first = geo[0];
    if (!first) throw new AppError(502, 'GEOCODING_NO_COORDINATE', 'Não encontramos a coordenada', { detail: 'Ajuste o pino manualmente.' });
    return { cep: digits, street: via.logradouro ?? '', neighborhood: via.bairro ?? '', city: via.localidade ?? '', state: via.uf ?? 'SP', lat: Number(first.lat), lng: Number(first.lon) };
  }
}

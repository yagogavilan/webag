import type { PublicCity } from '@webag/shared';

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

/** A cidade do CEP está entre as regiões ativas? (WB-051 C3). Compara sem acento e sem diferença de caixa. */
export function isServedCity(cities: Pick<PublicCity, 'name' | 'state'>[], city: string, state: string): boolean {
  const name = normalize(city);
  return cities.some((c) => normalize(c.name) === name && c.state.toUpperCase() === state.toUpperCase());
}

import type { PublicCity } from '@webag/shared';

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Região ativa = cidade ativa. O bairro não é critério duro: quem filtra o que chega ao cliente é o raio de entrega de cada loja
 * (ADR-008, PostGIS), e o nome do bairro do ViaCEP nem sempre é igual ao cadastrado pelo admin.
 * Acha a cidade ativa pelo nome (sem acento e sem diferenciar maiúsculas): "Francisco Morato" == "francisco morató". */
export function findActiveCity(cities: readonly PublicCity[], cityName: string): PublicCity | undefined {
  const wanted = normalize(cityName);
  return cities.find((c) => normalize(c.name) === wanted);
}

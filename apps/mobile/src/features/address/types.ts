export type AddressNickname = 'home' | 'work' | 'other';

/**
 * `approx`: só a cidade (escolhida na lista) ou o GPS aproximado: o frete aparece como "a partir de".
 * `full`: CEP + número: frete exato (onda-3 §0.7).
 */
export type AddressPrecision = 'approx' | 'full';

export interface Address {
  id: string;
  nickname: AddressNickname | null;
  precision: AddressPrecision;
  /** 8 dígitos, sem máscara. Vazio no endereço aproximado. */
  cep: string;
  street: string;
  number: string;
  noNumber: boolean;
  complement: string;
  district: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
}

export const MAX_ADDRESSES = 8;

/** "Rua das Palmeiras, 120" (ou só a rua, ou só a cidade quando aproximado). */
export function addressLine(a: Address): string {
  if (a.precision === 'approx' || !a.street) return a.district || a.city;
  return a.noNumber || !a.number ? a.street : `${a.street}, ${a.number}`;
}

/** "Jardim Fortaleza, Francisco Morato". */
export function addressArea(a: Address): string {
  return [a.district, a.city].filter(Boolean).join(', ');
}

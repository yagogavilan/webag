import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
  type Address as ApiAddress,
  type CreateAddressRequest,
  type UpdateAddressRequest,
} from '@webag/shared';
import type { Address, AddressNickname } from '../features/address/types';
import { request } from './http';

/** Acesso a `/v1/me/addresses` (dado pessoal: só o dono lê; 404 também para endereço de outra conta). */

/** O que o formulário preenche; `id`, `precision` e `remote` são do app. */
export type AddressFields = Omit<Address, 'id' | 'precision' | 'remote'>;

const NO_NUMBER = 'S/N';

export function fromApi(a: ApiAddress): Address {
  const noNumber = a.number.trim().toUpperCase() === NO_NUMBER;
  return {
    id: a.id,
    nickname: a.label as AddressNickname | null,
    precision: 'full',
    cep: a.cep.replace(/\D/g, ''),
    street: a.street,
    number: noNumber ? '' : a.number,
    noNumber,
    complement: a.complement ?? '',
    district: a.neighborhood,
    city: a.city,
    state: a.state,
    latitude: a.lat,
    longitude: a.lng,
    remote: true,
  };
}

function toBody(f: AddressFields): CreateAddressRequest {
  return {
    label: f.nickname,
    cep: f.cep,
    street: f.street,
    number: f.noNumber || !f.number ? NO_NUMBER : f.number,
    complement: f.complement ? f.complement : null,
    neighborhood: f.district,
    city: f.city,
    state: f.state,
    // sem ponto do geocodificador do aparelho, o servidor usa o ponto do CEP
    ...(f.latitude !== null && f.longitude !== null ? { lat: f.latitude, lng: f.longitude } : {}),
  };
}

export async function fetchAddresses(): Promise<Address[]> {
  const result = await request((init) => listAddresses(init), { retry: true });
  return result.data.map(fromApi);
}

/** Reenviar o mesmo endereço devolve o existente (200), sem duplicar: seguro repetir em rede ruim. */
export async function createRemoteAddress(fields: AddressFields): Promise<Address> {
  return fromApi(await request((init) => createAddress(toBody(fields), init), { retry: true }));
}

export async function updateRemoteAddress(id: string, fields: AddressFields): Promise<Address> {
  const { isDefault: _ignored, ...rest } = toBody(fields);
  const body: UpdateAddressRequest = rest;
  return fromApi(await request((init) => updateAddress(id, body, init)));
}

export async function setRemoteDefault(id: string): Promise<void> {
  await request((init) => updateAddress(id, { isDefault: true }, init));
}

export async function deleteRemoteAddress(id: string): Promise<void> {
  await request((init) => deleteAddress(id, init));
}

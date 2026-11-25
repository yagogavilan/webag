import { call, ensureCustomer, sql } from './lib.mjs';
const email = 'marina.mkt@seed.webag.local';
const token = await ensureCustomer(email, 'Marina Duarte', '11988880001');
const addrs = await call('GET', '/v1/me/addresses', null, token);
console.log('endereços', addrs.data?.data?.length);
if (!addrs.data?.data?.length) {
  const r = await call('POST', '/v1/me/addresses', { label: 'home', cep: '07900-200', street: 'Rua das Palmeiras', number: '120', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', isDefault: true }, token);
  console.log(r.status, JSON.stringify(r.data).slice(0, 300));
}

import { call, ensureCustomer, sql } from './lib.mjs';
sql(`update users set phone='11999990000' where email='marina.mkt@seed.webag.local'`);
for (const [email, name, phone] of [['rita.mkt@seed.webag.local', 'Rita Moura', '11999990004'], ['joana.mkt@seed.webag.local', 'Joana Prado', '11999990002'], ['paulo.mkt@seed.webag.local', 'Paulo Reis', '11999990003']]) {
  const token = await ensureCustomer(email, name, phone);
  const a = await call('GET', '/v1/me/addresses', null, token);
  if (!a.data.data.length) console.log(email, (await call('POST', '/v1/me/addresses', { label: 'home', cep: '07900-200', street: 'Rua das Palmeiras', number: '120', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' }, token)).status);
}

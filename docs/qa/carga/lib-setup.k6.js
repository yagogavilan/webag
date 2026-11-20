// Funções de preparo compartilhadas pelos cenários k6 que precisam de conta (S4-B, S5, S9). Só para ambiente de teste (provedor `fake`).
// Cada conta nasce com um IP de origem fictício próprio (X-Forwarded-For; a API precisa de TRUST_PROXY=1) porque o cadastro e o login têm limite por IP.
import http from 'k6/http';
import { sleep } from 'k6';

export const API = __ENV.API_URL || 'http://localhost:3000';
export const MAILPIT = __ENV.MAILPIT_URL || 'http://localhost:8025';
export const PASSWORD = 'webag-seed-lojista-2026';
export const LAT = -23.2801;
export const LNG = -46.744;

const ip = (n) => `10.${Math.floor(n / 62500) % 250}.${Math.floor(n / 250) % 250}.${1 + (n % 250)}`;
const json = (token, n) => ({ headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(n), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });

/** Cliente novo com e-mail confirmado (código lido no Mailpit) e endereço. Devolve { token, addressId, email }. */
export function newCustomer(n) {
  const terms = ['customer_terms', 'privacy'].map((type) => ({ type, version: http.get(`${API}/v1/legal/${type}`, json(null, n)).json('version') }));
  const email = `k6.${Date.now()}.${n}.${Math.floor(Math.random() * 1e6)}@seed.webag.local`;
  const reg = http.post(`${API}/v1/auth/register`, JSON.stringify({ name: 'Cliente K6', email, phone: `1198${Math.floor(1e6 + Math.random() * 9e6)}`, password: PASSWORD, adultDeclaration: true, acceptedDocuments: terms }), json(null, n));
  if (reg.status !== 201 && reg.status !== 200) throw new Error(`cadastro ${reg.status} ${reg.body}`);
  const token = http.post(`${API}/v1/auth/login`, JSON.stringify({ email, password: PASSWORD }), json(null, n)).json('tokens.accessToken');
  let code;
  for (let i = 0; i < 20 && !code; i++) {
    const found = http.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).json('messages') || [];
    const mail = found.find((m) => /código/i.test(m.Subject));
    code = mail && (mail.Subject.match(/\b(\d{6})\b/) || [])[1];
    if (!code) sleep(0.3);
  }
  http.post(`${API}/v1/auth/email/verify`, JSON.stringify({ code }), json(token, n));
  const addr = http.post(`${API}/v1/me/addresses`, JSON.stringify({ label: 'home', cep: '07900-100', street: 'Rua do Teste', number: '100', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: LAT, lng: LNG, isDefault: true }), json(token, n));
  return { token, addressId: addr.json('id'), email, n };
}
export const authed = json;

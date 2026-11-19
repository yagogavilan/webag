// k6 — S5 Rajada de webhooks (plano-carga.md §4): reenvio em massa de notificações ASSINADAS de pagamento, com duplicados, assinatura inválida
// e id desconhecido. Invariante: nenhum 5xx; assinatura inválida = 401 sempre; duplicado = 200 {duplicate:true}; ledger e estado dos pedidos NÃO mudam
// com o reenvio (conferir no banco depois: `select count(*) from ledger_entries` igual antes/depois do volume).
// Uso: k6 run -e API_URL=http://localhost:3000 -e SECRET=dev-only-fake-webhook-secret -e IDS=<lista> -e TAXA=50 -e DURACAO=60s docs/qa/carga/s5-webhooks.k6.js
// Pré: provedor `fake`, API com TRUST_PROXY=1 (o limite do webhook é 600/min por IP; cada requisição leva um IP de origem próprio, como o provedor real faria
// de vários IPs). O preparo (`s5-preparar.mjs`) cria os pedidos de PIX e aprova cada um pela rota de desenvolvimento.
import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { API } from './lib-setup.k6.js';

const SECRET = __ENV.SECRET || 'dev-only-fake-webhook-secret';
const TAXA = Number(__ENV.TAXA || 50);
const e5xx = new Counter('erros_5xx');
const invalidasAceitas = new Counter('assinatura_invalida_aceita');

export const options = {
  scenarios: {
    rajada: { executor: 'constant-arrival-rate', rate: TAXA, timeUnit: '1s', duration: __ENV.DURACAO || '60s', preAllocatedVUs: 50, maxVUs: 200 },
  },
  thresholds: { erros_5xx: ['count==0'], assinatura_invalida_aceita: ['count==0'], http_req_duration: ['p(95)<1000'] },
};

function signed(dataId, tsMs) {
  const requestId = `k6-${Math.random().toString(16).slice(2)}`;
  const id = /^[A-Za-z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
  const ts = String(tsMs);
  const v1 = crypto.hmac('sha256', SECRET, `id:${id};request-id:${requestId};ts:${ts};`, 'hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}

// Os ids de pagamento vêm do preparo em Node (`node docs/qa/carga/s5-preparar.mjs 20` imprime IDS=...): o k6 não lê o banco.
export function setup() {
  const ids = (__ENV.IDS || '').split(',').filter(Boolean);
  if (ids.length === 0) throw new Error('passe -e IDS=<ids do s5-preparar.mjs>');
  return { ids };
}

// Todos os pedidos já foram aprovados no preparo: toda notificação válida da rajada é DUPLICADA (idempotência).
export default function (data) {
  const pick = { paymentId: data.ids[Math.floor(Math.random() * data.ids.length)] };
  const roll = Math.random();
  const headers = { 'X-Forwarded-For': `10.${__VU % 250}.${Math.floor(__ITER / 250) % 250}.${1 + (__ITER % 250)}` };
  let res;
  if (roll < 0.05) {
    // assinatura inválida
    res = http.post(`${API}/v1/webhooks/fake?data.id=${pick.paymentId}&type=payment`, '{}', { headers: { ...headers, 'x-signature': `ts=${Date.now()},v1=${'0'.repeat(64)}`, 'x-request-id': 'k6-bad' } });
    check(res, { 'inválida = 401': (r) => r.status === 401 });
    if (res.status === 200) invalidasAceitas.add(1);
  } else if (roll < 0.1) {
    // id desconhecido, assinatura válida
    res = http.post(`${API}/v1/webhooks/fake?data.id=desconhecido${__ITER}&type=payment`, '{}', { headers: { ...headers, ...signed(`desconhecido${__ITER}`, Date.now()) } });
    check(res, { 'desconhecido sem 5xx': (r) => r.status < 500 });
  } else if (roll < 0.15) {
    // fora de ordem / vencida (ts de 10 min atrás): recusada
    res = http.post(`${API}/v1/webhooks/fake?data.id=${pick.paymentId}&type=payment`, '{}', { headers: { ...headers, ...signed(pick.paymentId, Date.now() - 10 * 60 * 1000) } });
    check(res, { 'vencida = 401': (r) => r.status === 401 });
  } else {
    res = http.post(`${API}/v1/webhooks/fake?data.id=${pick.paymentId}&type=payment`, '{}', { headers: { ...headers, ...signed(pick.paymentId, Date.now()) } });
    check(res, { 'válida 200': (r) => r.status === 200 });
  }
  if (res.status >= 500) e5xx.add(1);
}

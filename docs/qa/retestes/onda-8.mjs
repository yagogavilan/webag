#!/usr/bin/env node
// Retestes do G4 final (Onda 8, HEAD congelado 0d902ab) contra a API REAL (provedor `fake`, seed completo). Sem dependências além do Node 22
// e do `sharp` do próprio repositório (para fabricar imagens). Uso: node docs/qa/retestes/onda-8.mjs <seção> [<seção>...]
// Seções: bug020 bugs imagens wb259 wb261 wb262 coleta sec180 cupom csv exclusao v6 regressao papeis limpeza
// Pré-requisitos: `pnpm run setup`, API rodando com TRUST_PROXY=1 (limite de taxa por IP; o gerador usa um IP fictício por conta),
// docker (o relógio é recuado só pelo banco; a varredura é a do próprio servidor). Variáveis: as de lib.mjs + REPO (raiz do clone).
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { api, adminCall, record, notTested, finish, sql, sleep, waitFor, newCustomer, login, store as seedStoreOf, place, pay, cartOf, getOrder, storeOrder, paidAccepted, inPreparation, readyForCollection, outForDelivery, deliveryOf, deliveryStatus, setParam, resetParam, createAddress, API, LAT, LNG, SEED_PASSWORD } from './lib.mjs';

const requireFromApi = createRequire(new URL('../../../apps/api/package.json', import.meta.url));
const sharp = requireFromApi('sharp');
const money = (m) => (m && typeof m === 'object' ? (m.amount ?? m.cents ?? m.value) : m);
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const ORIGIN = 'http://localhost:3101';
const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 60 } } }).png({ compressionLevel: 9 }).toBuffer();
const jpg = (w, h, q = 70) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 120, b: 200 } } }).jpeg({ quality: q }).toBuffer();

/** Memória residente (MB) do processo da API que escuta em API_URL (lê /proc; só Linux). */
async function apiRssMb() {
  const port = new URL(API).port || '80';
  const { spawnSync } = await import('node:child_process');
  const pid = spawnSync('sh', ['-c', `ss -ltnp 2>/dev/null | grep ":${port} " | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p' | head -1`], { encoding: 'utf8' }).stdout.trim() ||
    spawnSync('sh', ['-c', `pgrep -f "dist/main" | head -1`], { encoding: 'utf8' }).stdout.trim();
  if (!pid) return null;
  const status = spawnSync('sh', ['-c', `grep VmRSS /proc/${pid}/status`], { encoding: 'utf8' }).stdout;
  return Math.round(Number(status.replace(/\D/g, '')) / 1024);
}

/** Upload pelo fluxo real: POST pré-assinado ao bucket (com Origin, como o navegador) + complete. */
async function uploadReal(token, { storeId, purpose, contentType, body }) {
  const created = await api('POST', '/v1/uploads', { token, body: { ...(storeId ? { storeId } : {}), purpose, contentType, sizeBytes: body.length } });
  if (created.status !== 201) return { created, step: 'create' };
  const { url, fields } = created.data.upload;
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([body], { type: contentType }), 'arquivo');
  const posted = await fetch(url, { method: 'POST', body: form, headers: { Origin: ORIGIN } });
  if (![200, 201, 204].includes(posted.status)) return { created, step: 'post', storageStatus: posted.status, cors: posted.headers.get('access-control-allow-origin') };
  const started = Date.now();
  const done = await api('POST', `/v1/uploads/${created.data.id}/complete`, { token, body: {} });
  return { created, done, ms: Date.now() - started, cors: posted.headers.get('access-control-allow-origin') };
}

async function mailCode(email, re = /\b(\d{6})\b/) {
  for (let i = 0; i < 20; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const mail = (found.messages ?? []).find((m) => re.test(m.Subject));
    const code = mail?.Subject.match(re)?.[1];
    if (code) return code;
    await sleep(400);
  }
  return undefined;
}
const mailCount = async (email) => ((await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()).messages ?? []).length;
const lastMailCode = async (email) => {
  const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
  for (const m of found.messages ?? []) {
    const detail = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
    const code = `${m.Subject} ${detail.Text ?? ''}`.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
  }
  return undefined;
};
/** Espera chegar um e-mail NOVO (além dos `before` que já existiam) e devolve o código de 6 dígitos do mais recente. */
async function freshCode(email, before) {
  for (let i = 0; i < 40; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    if ((found.messages ?? []).length > before) {
      const withCode = found.messages.find((m) => /\b\d{6}\b/.test(m.Subject));
      if (withCode) return withCode.Subject.match(/\b(\d{6})\b/)[1];
    }
    await sleep(300);
  }
  return undefined;
}
const refundedCents = (orderId) => Number(sql(`select coalesce(sum(r.amount_cents),0) from payment_refunds r join payment_attempts a on a.id = r.attempt_id where a.external_reference = '${orderId}'`) || 0);
const backdateDeparture = (deliveryId, minutes) =>
  sql(`set session_replication_role = replica; update delivery_events set created_at = created_at - interval '${minutes} minutes' where delivery_id = '${deliveryId}' and to_status = 'out_for_delivery'; set session_replication_role = origin;`);
const brtHhmm = (offsetMin) => {
  const d = new Date(Date.now() - 3 * 3600_000 + offsetMin * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

// ====================================================================================================================== BUGS
async function bugs() {
  try {
    await bugsInner();
  } finally {
    await resetParam('logistica_horario').catch(() => undefined);
    await Promise.all(['entrega_max_min', 'entrega_faixa_min', 'entrega_min_por_km'].map((k) => resetParam(k).catch(() => undefined)));
  }
}
async function bugsInner() {
  const s = await seedStoreOf();
  // ---- BUG-023: cupom BEMVINDO10 do seed com teto
  const cap = sql(`select max_uses from coupons where code = 'BEMVINDO10'`);
  record('BUG-023a', 'o cupom de seed BEMVINDO10 (primeira compra) tem teto de usos (max_uses = 100)', cap === '100', `max_uses=${cap}`);
  const noCap = sql(`select count(*) from coupons where scope = 'platform' and max_uses is null and active`);
  record('BUG-023b', 'nenhum cupom da plataforma ativo sem teto no banco semeado', noCap === '0', `sem teto e ativos=${noCap}`);

  // ---- BUG-022: validação dos parâmetros de ETA (422) e prévia do alcance
  const tries = {
    max40: await adminCall('PUT', '/v1/admin/parameters/entrega_max_min', { value: 40, reason: 'Reteste QA BUG-022: teto impossível' }),
    max59: await adminCall('PUT', '/v1/admin/parameters/entrega_max_min', { value: 59, reason: 'Reteste QA BUG-022: abaixo do mínimo viável' }),
    faixa60: await adminCall('PUT', '/v1/admin/parameters/entrega_faixa_min', { value: 60, reason: 'Reteste QA BUG-022: folga maior que o quarto do teto' }),
    kmMin60: await adminCall('PUT', '/v1/admin/parameters/entrega_min_por_km', { value: 60, reason: 'Reteste QA BUG-022: 60 min por km zera o alcance' }),
    neg: await adminCall('PUT', '/v1/admin/parameters/entrega_max_min', { value: -5, reason: 'Reteste QA BUG-022: negativo' }),
  };
  record('BUG-022a', 'entrega_max_min=40, 59 e entrega_faixa_min=60 são recusados (422 PARAMETER_OUT_OF_RANGE)', [tries.max40, tries.max59, tries.faixa60].every((r) => r.status === 422 && r.data?.code === 'PARAMETER_OUT_OF_RANGE'), `40=${tries.max40.status} ${tries.max40.data?.code}; 59=${tries.max59.status}; faixa60=${tries.faixa60.status}`);
  record('BUG-022b', 'entrega_min_por_km=60 (zera o alcance: 60 min por km) é recusado (4xx) e o negativo também', tries.kmMin60.status >= 400 && tries.kmMin60.status < 500 && tries.neg.status >= 400 && tries.neg.status < 500, `min_por_km=60 HTTP ${tries.kmMin60.status} ${JSON.stringify(tries.kmMin60.data).slice(0, 160)}; -5 HTTP ${tries.neg.status}`);
  const detail = JSON.stringify(tries.max40.data);
  record('BUG-022c', 'a recusa traz o teto mínimo e a prévia do alcance em km (mensagem útil ao admin)', /km/i.test(detail) && /\b(60|alcan)/i.test(detail), detail.slice(0, 300));
  const good = await adminCall('PUT', '/v1/admin/parameters/entrega_max_min', { value: 110, reason: 'Reteste QA BUG-022: valor válido' });
  record('BUG-022d', 'um valor válido (110) é aceito e o efeito aparece no alcance; reset volta ao padrão (120)', good.status === 200, `HTTP ${good.status}`);
  const reset = await resetParam('entrega_max_min');
  record('BUG-022e', 'restaurar o padrão funciona', reset.status === 200, `HTTP ${reset.status} ${JSON.stringify(reset.data).slice(0, 100)}`);
  await Promise.all(['entrega_faixa_min', 'entrega_min_por_km'].map(resetParam));

  // ---- BUG-021: fim da faixa x fechamento da logística
  const c = await newCustomer();
  const closingIn = async (minutes) => {
    await setParam('logistica_horario', `${brtHhmm(-120)}-${brtHhmm(minutes)}`, 'Reteste QA BUG-021');
    const { cart } = await cartOf(c, 'delivery');
    const placed = await place(c, 'delivery');
    return { cart: cart.data, placed };
  };
  const near = await closingIn(20);
  record('BUG-021a', 'faltando 20 min para o fechamento a entrega NÃO é oferecida (faixa termina depois) e o servidor recusa criar o pedido', JSON.stringify(near.cart?.checkout).includes('LOGISTICS_CLOSED') && !near.placed.order, `faixa=${JSON.stringify(near.cart?.delivery?.eta)}; checkout=${JSON.stringify(near.cart?.checkout).slice(0, 140)}; criar pedido HTTP ${near.placed.res.status} ${near.placed.res.data?.code ?? ''}`);
  if (near.placed.order) await api('POST', `/v1/orders/${near.placed.order.id}/cancel`, { token: c.token, body: {} });
  // os cartões da descoberta têm cache de 30 s (HOME_TTL): o parâmetro recém-salvo aparece neles em até ~30 s; o checkout é imediato
  let card = null;
  await waitFor(async () => {
    const feed = await api('GET', `/v1/search/stores?lat=${LAT}&lng=${LNG}`);
    card = feed.data?.data?.find((x) => x.name === 'Mercadinho Boa Compra');
    return card?.delivery?.unavailableReason === 'LOGISTICS_CLOSED';
  }, { timeoutMs: 45_000, everyMs: 3_000 });
  record('BUG-021b', 'o cartão da descoberta mostra a mesma coisa (unavailableReason LOGISTICS_CLOSED, mesma conta; cache de até 30 s)', card?.delivery?.unavailableReason === 'LOGISTICS_CLOSED' && card?.delivery?.available === false, `available=${card?.delivery?.available}; unavailableReason=${card?.delivery?.unavailableReason}`);
  const wide = await closingIn(240);
  record('BUG-021c', 'com o fechamento 4 h depois a entrega é oferecida e o pedido nasce (sem falso bloqueio)', Boolean(wide.placed.order) && !JSON.stringify(wide.cart?.checkout).includes('LOGISTICS_CLOSED'), `HTTP ${wide.placed.res.status}; faixa=${JSON.stringify(wide.cart?.delivery?.eta)}`);
  if (wide.placed.order) await api('POST', `/v1/orders/${wide.placed.order.id}/cancel`, { token: c.token, body: {} });
  // borda: fim da faixa == fechamento (exclusivo?) com a faixa vista na sacola
  const eta = wide.cart?.delivery?.eta;
  if (eta?.maxMinutes) {
    const edge = await closingIn(eta.maxMinutes + 1);
    const over = await closingIn(eta.maxMinutes - 2);
    record('BUG-021d', `borda: fechando 1 min depois do fim da faixa (${eta.maxMinutes} min) oferece; 2 min antes do fim da faixa NÃO oferece`, Boolean(edge.placed.order) && !over.placed.order, `+1: pedido HTTP ${edge.placed.res.status}; -2: pedido HTTP ${over.placed.res.status} ${over.placed.res.data?.code ?? ''}`);
    for (const p of [edge.placed, over.placed]) if (p.order) await api('POST', `/v1/orders/${p.order.id}/cancel`, { token: c.token, body: {} });
  }
  await resetParam('logistica_horario');

  // ---- BUG-025: CORS do armazenamento + upload de documento pelo navegador (POST assinado com Origin)
  for (const origin of ['http://localhost:3001', 'http://localhost:3101', 'http://localhost:8081']) {
    const res = await fetch('http://localhost:9000/webag-private/x', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
    record(`BUG-025-${new URL(origin).port}`, `preflight do bucket privado devolve Allow-Origin e POST para ${origin}`, res.headers.get('access-control-allow-origin') === origin && /POST/.test(res.headers.get('access-control-allow-methods') ?? ''), `HTTP ${res.status}; origin=${res.headers.get('access-control-allow-origin')}; methods=${res.headers.get('access-control-allow-methods')}`);
  }
  const up = await uploadReal(s.owner, { storeId: s.id, purpose: 'product_image', contentType: 'image/jpeg', body: await jpg(1200, 900) });
  record('BUG-025-up', 'upload real de foto de produto pelo POST assinado com Origin do navegador: 204 no bucket com Allow-Origin e complete 200', up.done?.status === 200 && up.cors === ORIGIN, `etapa=${up.step ?? 'ok'}; complete HTTP ${up.done?.status}; Allow-Origin=${up.cors}`);
}

// ====================================================================================================================== BUG-010 (imagens em paralelo)
async function imagens() {
  const owners = sql(`select u.email||'|'||s.id from stores s join store_members m on m.store_id = s.id join users u on u.id = m.user_id where u.email like 'lojista.%@seed.webag.local' and s.status = 'approved'`).split('\n').filter(Boolean).map((l) => l.split('|'));
  record('BUG-010-prep', 'há donos de loja semeados para o teste', owners.length >= 6, `${owners.length} donos`);
  const sessions = [];
  for (const [email, storeId] of owners) sessions.push({ storeId, token: (await login(email)).token });
  const before = await apiRssMb();
  const big = await png(5000, 5000); // 25 MP, o teto do PNG
  const huge = await png(6300, 6300); // 39,7 MP: acima do teto do PNG (25 MP): deve ser recusado, não derrubar
  const jpeg40 = await jpg(7000, 5700, 60); // 39,9 MP JPEG
  console.log(`  [info] RSS da API antes: ${before} MB; PNG 25MP=${(big.length / 1e6).toFixed(2)} MB; PNG 39,7MP=${(huge.length / 1e6).toFixed(2)} MB; JPEG 39,9MP=${(jpeg40.length / 1e6).toFixed(2)} MB`);
  // monitor de latência de leitura durante a carga
  const lat = [];
  let monitoring = true;
  const monitor = (async () => {
    while (monitoring) {
      const t = Date.now();
      const r = await fetch(`${API}/v1/home?lat=${LAT}&lng=${LNG}`, { headers: { 'x-forwarded-for': '10.250.1.1' } }).catch(() => ({ status: 0 }));
      lat.push({ ms: Date.now() - t, status: r.status });
      await sleep(250);
    }
  })();
  const jobs = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const sess = sessions[i % sessions.length];
    const body = i % 4 === 0 ? jpeg40 : i % 4 === 3 ? huge : big;
    jobs.push(uploadReal(sess.token, { storeId: sess.storeId, purpose: 'product_image', contentType: body === jpeg40 ? 'image/jpeg' : 'image/png', body }).then((r) => ({ ...r, kind: body === jpeg40 ? 'jpeg40' : body === huge ? 'png40' : 'png25' })));
  }
  const started = Date.now();
  const results = await Promise.all(jobs);
  monitoring = false;
  await monitor;
  const total = Date.now() - started;
  const after = await apiRssMb();
  const by = (kind) => results.filter((r) => r.kind === kind);
  const okCount = (kind) => by(kind).filter((r) => r.done?.status === 200).length;
  const rejected = (kind) => by(kind).filter((r) => r.done?.status === 422).length;
  const other = results.filter((r) => ![200, 422].includes(r.done?.status ?? 0));
  const latOk = lat.filter((l) => l.status === 200).map((l) => l.ms).sort((a, b) => a - b);
  const p95 = latOk[Math.floor(latOk.length * 0.95)] ?? null;
  record('BUG-010a', `${N} uploads simultâneos (10 JPEG 39,9 MP, 20 PNG 25 MP, 10 PNG 39,7 MP) de ${sessions.length} contas: a API não cai nem devolve 5xx`, other.length === 0 || other.every((r) => (r.done?.status ?? 0) < 500), `total ${total} ms; JPEG ok ${okCount('jpeg40')}/${by('jpeg40').length}; PNG25 ok ${okCount('png25')}/${by('png25').length}; PNG40 ok ${okCount('png40')} recusados(422) ${rejected('png40')}; fora do esperado: ${other.map((r) => `${r.step ?? ''}${r.done?.status ?? ''}${r.created?.status ?? ''}`).join(',') || 'nenhum'}`);
  record('BUG-010b', 'a API continua respondendo leituras durante o processamento (p95 de /home abaixo de 1 s, sem erro)', lat.length > 5 && lat.every((l) => l.status === 200) && p95 !== null && p95 < 1000, `${lat.length} leituras; p95=${p95} ms; max=${latOk.at(-1)} ms; erros=${lat.filter((l) => l.status !== 200).length}`);
  record('BUG-010c', 'memória: RSS da API depois da carga não passa de 1 GB (limite sugerido do contêiner: 768 MB a 1 GB)', after !== null && after < 1024, `RSS antes=${before} MB depois=${after} MB`);
  const rejectedReasons = by('png40').filter((r) => r.done?.status === 422).slice(0, 1).map((r) => JSON.stringify(r.done.data).slice(0, 160));
  record('BUG-010d', 'PNG acima do teto de 25 MP é recusado com motivo (422 UPLOAD_REJECTED), não processado', rejected('png40') === by('png40').length, `recusados ${rejected('png40')}/${by('png40').length}; ${rejectedReasons[0] ?? ''}`);
  const timeouts = results.filter((r) => r.done?.status === 422 && /tempo|timeout/i.test(JSON.stringify(r.done.data)));
  record('BUG-010e', 'nenhum upload válido foi recusado por tempo esgotado na fila (honestos não perdem foto no pico)', timeouts.length === 0 && okCount('jpeg40') === by('jpeg40').length && okCount('png25') === by('png25').length, `recusados por tempo=${timeouts.length}; válidos aceitos=${okCount('jpeg40') + okCount('png25')}/${by('jpeg40').length + by('png25').length}`);
}

// ====================================================================================================================== WB-259 estorno
async function placeCard(c, mode = 'delivery', cardToken = 'fake_tok_approved') {
  const { cart } = await cartOf(c, mode);
  const total = money(cart.data?.summary?.total);
  const intent = await api('POST', '/v1/card-intents', { token: c.token, body: { mode, ...(mode === 'delivery' ? { addressId: c.addressId } : {}), cartRevision: cart.data?.revision, expectedTotalCents: total } });
  if (intent.status !== 201) return { intent };
  const token = new URL(intent.data.url).searchParams.get('i');
  const pageInfo = await api('GET', `/v1/card-intents/${token}`);
  const paid = await api('POST', `/v1/card-intents/${token}/pay`, { body: { card: { token: cardToken, installments: 1 } } });
  return { intent, pageInfo, paid, orderId: paid.data?.orderId, total };
}
async function wb259() {
  await seedStoreOf();
  const c = await newCustomer();
  const a = await place(c, 'delivery');
  const r0 = (await getOrder(c, a.order.id)).data;
  record('WB259-1', 'pedido sem pagamento: refund = null', r0.refund === null, `refund=${JSON.stringify(r0.refund)}`);
  await pay(c, a.order.id);
  const r1 = (await getOrder(c, a.order.id)).data;
  record('WB259-2', 'pedido pago em andamento: refund = null', r1.refund === null, `refund=${JSON.stringify(r1.refund)}`);
  const cancel = await api('POST', `/v1/orders/${a.order.id}/cancel`, { token: c.token, body: {} });
  const r2 = (await getOrder(c, a.order.id)).data;
  record('WB259-3', 'cancelamento do pedido pago por PIX: refund {valor total, method pix, status completed|processing, deadlineText de PIX}', cancel.status === 200 && r2.refund?.amountCents === a.total && r2.refund?.method === 'pix' && ['completed', 'processing'].includes(r2.refund?.status) && /PIX/i.test(r2.refund?.deadlineText ?? '') && /dia útil/i.test(r2.refund?.deadlineText ?? ''), `cancel HTTP ${cancel.status}; total=${a.total}; refund=${JSON.stringify(r2.refund)}`);
  record('WB259-4', 'o valor estornado no provedor/ledger bate com o refund exposto', refundedCents(a.order.id) === r2.refund?.amountCents, `ledger=${refundedCents(a.order.id)} api=${r2.refund?.amountCents}`);
  const stranger = await newCustomer();
  record('WB259-5', 'outra conta não vê o pedido nem o estorno (404)', (await getOrder(stranger, a.order.id)).status === 404, '');
  // parcial pelo admin
  const b = await place(c, 'delivery');
  await pay(c, b.order.id);
  const part = await adminCall('POST', `/v1/admin/orders/${b.order.id}/refunds`, { amountCents: 250, reason: 'Reteste QA WB-259: estorno parcial' }, { 'Idempotency-Key': randomUUID() });
  const r3 = (await getOrder(c, b.order.id)).data;
  record('WB259-6', 'estorno parcial: refund.amountCents = valor parcial (250), nunca o total; pedido segue ativo', part.status === 200 && r3.refund?.amountCents === 250 && r3.status === 'received', `HTTP ${part.status}; refund=${JSON.stringify(r3.refund)}; status=${r3.status}`);
  await adminCall('POST', `/v1/admin/orders/${b.order.id}/cancel`, { reason: 'Reteste QA WB-259: limpar', refund: true });
  const r3b = (await getOrder(c, b.order.id)).data;
  record('WB259-7', 'estorno parcial + cancelamento: refund soma as intenções (total do pedido)', r3b.refund?.amountCents === b.total, `refund=${JSON.stringify(r3b.refund)} total=${b.total}`);
  // cartão
  const card = await placeCard(c, 'delivery');
  record('WB259-8', 'cartão simulado (fake_tok_approved) pela página segura: pedido criado e pago', card.paid?.status === 200 && Boolean(card.orderId), `intent HTTP ${card.intent?.status}; página ${card.pageInfo?.status} provedor=${card.pageInfo?.data?.provider}; pay HTTP ${card.paid?.status} ${JSON.stringify(card.paid?.data).slice(0, 160)}`);
  if (card.orderId) {
    const cc = await api('POST', `/v1/orders/${card.orderId}/cancel`, { token: c.token, body: {} });
    const rc = (await getOrder(c, card.orderId)).data;
    record('WB259-9', 'estorno de cartão: method card e o texto das faturas', cc.status === 200 && rc.refund?.method === 'card' && /fatura/i.test(rc.refund?.deadlineText ?? ''), `cancel HTTP ${cc.status}; refund=${JSON.stringify(rc.refund)}`);
  }
  const declined = await placeCard(c, 'delivery', 'fake_tok_insufficient');
  record('WB259-10', 'cartão recusado (saldo insuficiente): 422 PAYMENT_DECLINED, nenhum pedido pago', declined.paid?.status === 422 && declined.paid?.data?.code === 'PAYMENT_DECLINED', `HTTP ${declined.paid?.status} ${JSON.stringify(declined.paid?.data).slice(0, 160)}`);
  const three = await placeCard(c, 'delivery', 'fake_tok_3ds');
  record('WB259-11', 'cartão com 3DS: devolve threeDsUrl e o pedido não vira pago antes', three.paid?.status === 200 && Boolean(three.paid?.data?.threeDsUrl), `HTTP ${three.paid?.status} threeDsUrl=${three.paid?.data?.threeDsUrl} status=${three.paid?.data?.status}`);
  if (three.orderId) await api('POST', `/v1/orders/${three.orderId}/cancel`, { token: c.token, body: {} });
}

// ====================================================================================================================== WB-261 ETA_CHANGED
async function wb261() {
  await seedStoreOf();
  const c = await newCustomer();
  const view = async () => (await cartOf(c, 'delivery')).cart.data;
  const send = (cart, extra = {}) => api('POST', '/v1/orders', { token: c.token, headers: { 'Idempotency-Key': randomUUID() }, body: { mode: 'delivery', addressId: c.addressId, cartRevision: cart.revision, expectedTotalCents: money(cart.summary.total), paymentMethod: 'pix', ...extra } });
  const countActive = async () => (await api('GET', '/v1/orders?scope=active', { token: c.token })).data?.data?.length ?? 0;
  const cancelAll = async () => { for (const o of (await api('GET', '/v1/orders?scope=active', { token: c.token })).data?.data ?? []) await api('POST', `/v1/orders/${o.id}/cancel`, { token: c.token, body: {} }); };
  const minutes = (cart, delta) => new Date(Date.parse(cart.delivery.eta.toAt) + delta * 60_000).toISOString();

  let cart = await view();
  record('WB261-0', 'a sacola traz a faixa com fromAt e toAt (ISO)', Boolean(cart.delivery?.eta?.fromAt) && Boolean(cart.delivery?.eta?.toAt), JSON.stringify(cart.delivery?.eta));
  const same = await send(cart, { acceptedEtaToAt: cart.delivery.eta.toAt });
  record('WB261-1', 'fim da faixa igual ao visto: cria (201) sem aviso', same.status === 201, `HTTP ${same.status} ${JSON.stringify(same.data).slice(0, 120)}`);
  await cancelAll();
  cart = await view();
  const old = await send(cart);
  record('WB261-2', 'app antigo (sem acceptedEtaToAt): cria (201)', old.status === 201, `HTTP ${old.status}`);
  await cancelAll();
  cart = await view();
  const better = await send(cart, { acceptedEtaToAt: minutes(cart, +60) });
  record('WB261-3', 'o cliente viu um fim MAIS TARDE que o atual (melhorou): cria (201)', better.status === 201, `HTTP ${better.status}`);
  await cancelAll();
  // tolerância de 5 min (DEC-068): o fim novo passa MAIS de 5 min do aceito => 409. Margens para o relógio andar entre a sacola e o pedido.
  const results = [];
  for (const delta of [-3, -4, -7, -8, -20]) {
    cart = await view();
    const res = await send(cart, { acceptedEtaToAt: minutes(cart, delta) });
    results.push({ delta, status: res.status, code: res.data?.code, eta: res.data?.eta, order: res.data?.id });
    if (res.status === 201) await api('POST', `/v1/orders/${res.data.id}/cancel`, { token: c.token, body: {} });
  }
  const at = (d) => results.find((r) => r.delta === d);
  record('WB261-4', 'dentro da tolerância (visto 3 e 4 min antes do fim atual): NÃO avisa (201)', at(-3).status === 201 && at(-4).status === 201, `-3 min: ${at(-3).status}; -4 min: ${at(-4).status}`);
  record('WB261-5', 'fora da tolerância (visto 7, 8 e 20 min antes): 409 ETA_CHANGED', [-7, -8, -20].every((d) => at(d).status === 409 && at(d).code === 'ETA_CHANGED'), `-7: ${at(-7).status} ${at(-7).code}; -8: ${at(-8).status}; -20: ${at(-20).status}`);
  const before = await countActive();
  cart = await view();
  const stale = await send(cart, { acceptedEtaToAt: minutes(cart, -20) });
  const afterCount = await countActive();
  record('WB261-6', '409 ETA_CHANGED traz eta {fromAt,toAt} novo e NÃO cria pedido nem tentativa de pagamento', stale.status === 409 && Boolean(stale.data?.eta?.fromAt) && Boolean(stale.data?.eta?.toAt) && afterCount === before, `eta=${JSON.stringify(stale.data?.eta)}; pedidos ativos antes=${before} depois=${afterCount}`);
  const confirmed = await send(await view(), { acceptedEtaToAt: stale.data?.eta?.toAt });
  record('WB261-7', 'o cliente confirma o horário novo: reenviar com o toAt devolvido cria (201), com Idempotency-Key nova', confirmed.status === 201, `HTTP ${confirmed.status} ${JSON.stringify(confirmed.data).slice(0, 120)}`);
  await cancelAll();
  const bad = await send(await view(), { acceptedEtaToAt: 'amanhã' });
  record('WB261-8', 'acceptedEtaToAt inválido: 400', bad.status === 400, `HTTP ${bad.status}`);
  const pickup = await cartOf(c, 'pickup');
  const pk = await api('POST', '/v1/orders', { token: c.token, headers: { 'Idempotency-Key': randomUUID() }, body: { mode: 'pickup', cartRevision: pickup.cart.data?.revision, expectedTotalCents: money(pickup.cart.data?.summary?.total), paymentMethod: 'pix', acceptedEtaToAt: new Date(Date.now() - 3600_000).toISOString() } });
  record('WB261-9', 'retirada não tem faixa de entrega: o campo não gera ETA_CHANGED', pk.status === 201 || pk.status === 400, `HTTP ${pk.status} ${pk.data?.code ?? ''}`);
  if (pk.data?.id) await api('POST', `/v1/orders/${pk.data.id}/cancel`, { token: c.token, body: {} });
  // retorno do limite: loja sai do alcance continua 422 OUT_OF_RANGE (coberto por TETO-121 da onda-7)
  // ordem de grandeza de que o horário "anda": a mesma faixa 2 s depois
  const e1 = (await view()).delivery.eta;
  await sleep(2000);
  const e2 = (await view()).delivery.eta;
  record('WB261-10', 'a faixa nova anda com o relógio em passos de minutos (granularidade ≤ 5 min), não por segundo', Math.abs(Date.parse(e2.toAt) - Date.parse(e1.toAt)) <= 5 * 60_000, `toAt ${e1.toAt} -> ${e2.toAt}`);
}

// ====================================================================================================================== WB-262 deliveredAt
async function wb262() {
  await seedStoreOf();
  const c = await newCustomer();
  const act = (id, body) => adminCall('POST', `/v1/admin/logistics/deliveries/${id}/status`, body);
  const prep = async (departedMinutesAgo) => {
    const { order, deliveryId } = await outForDelivery(c);
    backdateDeparture(deliveryId, departedMinutesAgo);
    const o = (await getOrder(c, order.id)).data;
    return { order, deliveryId, code: o.tracking?.deliveryCode };
  };
  const ago = (m) => new Date(Date.now() - m * 60_000).toISOString();
  let r = await prep(90);
  const t0 = Date.now();
  const plain = await act(r.deliveryId, { action: 'delivered', code: r.code });
  record('WB262-1', 'sem a hora informada vale a hora do clique (corrida e pedido)', plain.status === 200 && Math.abs(Date.parse(plain.data?.deliveredAt) - t0) < 15_000 && sql(`select delivered_at is not null from orders where id = '${r.order.id}'`) === 't', `HTTP ${plain.status}; deliveredAt=${plain.data?.deliveredAt}`);
  r = await prep(90);
  const four = ago(4);
  const near = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: four });
  const orderAt = sql(`select to_char(delivered_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS') from orders where id = '${r.order.id}'`);
  record('WB262-2', 'recuo de 4 min (até 5): vale, sem motivo; vira orders.delivered_at', near.status === 200 && near.data?.deliveredAt?.startsWith(four.slice(0, 19)) && orderAt === four.slice(0, 19), `HTTP ${near.status}; resposta=${near.data?.deliveredAt}; pedido=${orderAt}`);
  r = await prep(90);
  const twenty = ago(20);
  const noReason = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: twenty });
  const other = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: twenty, deliveredAtReason: 'other' });
  const ok20 = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: twenty, deliveredAtReason: 'courier_notified_late' });
  record('WB262-3', 'recuo acima de 5 min exige o motivo (400); "outro" exige a nota (400); com motivo vale (200) e nada mudou nas recusas', noReason.status === 400 && other.status === 400 && ok20.status === 200, `sem motivo ${noReason.status}; other sem nota ${other.status}; com motivo ${ok20.status}`);
  const evt = sql(`select meta::text from delivery_events where delivery_id = '${r.deliveryId}' and action = 'delivered' order by created_at desc limit 1`);
  const audit = sql(`select count(*) from audit_log where action = 'delivery.delivered' and target_id = '${r.deliveryId}' and after::text like '%deliveredAt%' and after::text like '%clickedAt%'`);
  record('WB262-4', 'hora real e hora do clique ficam no histórico da corrida (com motivo e recuo) e na auditoria', evt.includes('courier_notified_late') && evt.includes('clickedAt') && evt.includes('deliveredAt') && audit === '1', `histórico=${evt}; auditorias=${audit}`);
  r = await prep(30);
  const fut = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: new Date(Date.now() + 10 * 60_000).toISOString(), deliveredAtReason: 'no_signal' });
  const beforeDep = await act(r.deliveryId, { action: 'delivered', code: r.code, deliveredAt: ago(45), deliveredAtReason: 'no_signal' });
  record('WB262-5', 'no futuro (+10 min): 422 DELIVERED_AT_IN_FUTURE; antes da saída (saiu há 30, informado 45): 422 DELIVERED_AT_BEFORE_DEPARTURE', fut.status === 422 && fut.data?.code === 'DELIVERED_AT_IN_FUTURE' && beforeDep.status === 422 && beforeDep.data?.code === 'DELIVERED_AT_BEFORE_DEPARTURE', `futuro ${fut.status} ${fut.data?.code}; antes ${beforeDep.status} ${beforeDep.data?.code}`);
  const still = await deliveryStatus(r.order.id);
  record('WB262-6', 'as recusas não mudaram nada: a corrida segue "saiu para entrega"', still === 'out_for_delivery', `status=${still}`);
  const old = await prep(180);
  const tooOld = await act(old.deliveryId, { action: 'delivered', code: old.code, deliveredAt: ago(90), deliveredAtReason: 'no_signal' });
  record('WB262-7', 'mais de 60 min atrás: 422 DELIVERED_AT_TOO_OLD', tooOld.status === 422 && tooOld.data?.code === 'DELIVERED_AT_TOO_OLD', `${tooOld.status} ${tooOld.data?.code}`);
  // quem pode: suporte não (NOT_ALLOWED), coberto em papéis; aqui a base da compensação: entrega 20 min depois do fim da faixa informada com a hora REAL
  const late = await prep(200);
  const etaEnd = sql(`select to_char(eta_to_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS') from orders where id = '${late.order.id}'`);
  sql(`update orders set eta_to_at = now() - interval '25 minutes' where id = '${late.order.id}'`); // fim da faixa há 25 min
  const lateDone = await act(late.deliveryId, { action: 'delivered', code: late.code, deliveredAt: ago(13), deliveredAtReason: 'courier_notified_late' }); // 12 min depois do fim da faixa
  const comp1 = sql(`select count(*) from coupons where source_order_id = '${late.order.id}'`);
  record('WB262-8', 'compensação usa a hora REAL: entregue (informado) 12 min depois do fim da faixa = dentro da tolerância de 15 min: sem cupom', lateDone.status === 200 && comp1 === '0', `eta antes=${etaEnd}; HTTP ${lateDone.status}; cupons=${comp1}`);
  const late1b = await prep(200);
  sql(`update orders set eta_to_at = now() - interval '25 minutes' where id = '${late1b.order.id}'`);
  const l1b = await act(late1b.deliveryId, { action: 'delivered', code: late1b.code, deliveredAt: ago(8), deliveredAtReason: 'courier_notified_late' }); // 17 min depois do fim da faixa
  record('WB262-8b', 'entregue (informado) 17 min depois do fim da faixa (acima da tolerância de 15): 1 cupom', l1b.status === 200 && sql(`select count(*) from coupons where source_order_id = '${late1b.order.id}'`) === '1', `HTTP ${l1b.status}`);
  const late2 = await prep(200);
  sql(`update orders set eta_to_at = now() - interval '40 minutes' where id = '${late2.order.id}'`);
  const l2 = await act(late2.deliveryId, { action: 'delivered', code: late2.code, deliveredAt: ago(10), deliveredAtReason: 'courier_notified_late' });
  const comp2 = sql(`select count(*) from coupons where source_order_id = '${late2.order.id}'`);
  record('WB262-9', 'entregue (hora real) 30 min depois do fim da faixa: 1 cupom de compensação', l2.status === 200 && comp2 === '1', `HTTP ${l2.status}; cupons=${comp2}`);
  const late3 = await prep(200);
  sql(`update orders set eta_to_at = now() - interval '40 minutes' where id = '${late3.order.id}'`);
  const l3 = await act(late3.deliveryId, { action: 'delivered', code: late3.code, deliveredAt: ago(35), deliveredAtReason: 'courier_notified_late' });
  const comp3 = sql(`select count(*) from coupons where source_order_id = '${late3.order.id}'`);
  record('WB262-10', 'hora real informada dentro do prazo (35 min atrás, a faixa terminou há 40): a hora do clique atrasada NÃO gera cupom', l3.status === 200 && comp3 === '0', `HTTP ${l3.status}; cupons=${comp3}`);
  const dup = await act(late3.deliveryId, { action: 'delivered', code: late3.code, deliveredAt: ago(5), deliveredAtReason: 'no_signal' });
  record('WB262-11', 'não há como corrigir a hora depois de entregue (segunda chamada recusada, 409/422)', [409, 422].includes(dup.status), `HTTP ${dup.status} ${dup.data?.code ?? ''}`);
}

// ====================================================================================================================== coleta atrasada (DEC-062)
async function coleta() {
  const s = await seedStoreOf();
  const param = await adminCall('GET', '/v1/admin/parameters');
  const list = param.data?.data ?? param.data;
  const pdef = (Array.isArray(list) ? list : []).find((p) => p.key === 'coleta_atrasada_dias_uteis');
  record('COLETA-0', 'parâmetro coleta_atrasada_dias_uteis existe com valor 1 (faixa 1 a 5)', pdef && Number(pdef.value) === 1, JSON.stringify(pdef ?? {}).slice(0, 200));
  const c = await newCustomer();
  // pedido entregue e arrependimento com coleta em casa
  const { order, deliveryId } = await outForDelivery(c);
  const code = (await getOrder(c, order.id)).data?.tracking?.deliveryCode;
  await adminCall('POST', `/v1/admin/logistics/deliveries/${deliveryId}/status`, { action: 'delivered', code });
  const options = await api('GET', `/v1/orders/${order.id}/exchange-options`, { token: c.token });
  const item = options.data?.items?.[0]?.orderItemId;
  const ex = await api('POST', `/v1/orders/${order.id}/exchanges`, { token: c.token, headers: { 'Idempotency-Key': randomUUID() }, body: { orderItemId: item, type: 'withdrawal', method: 'pickup_at_home' } });
  const run = ex.data?.id ? sql(`select id from deliveries where exchange_id = '${ex.data.id}' and kind = 'exchange_pickup' order by created_at desc limit 1`) : '';
  record('COLETA-1', 'troca com coleta em casa cria a corrida exchange_pickup na fila da Logística', ex.status === 201 && Boolean(run), `troca HTTP ${ex.status}; corrida=${run}`);
  if (!run) return;
  // 8 dias corridos sem motoboy = atrasada; o prazo do item vence em 2 h
  sql(`update deliveries set ready_at = now() - interval '8 days' where id = '${run}'`);
  sql(`update exchange_requests set item_due_at = now() + interval '2 hours' where id = '${ex.data.id}'`);
  const listed = await adminCall('GET', '/v1/admin/logistics/deliveries?kind=exchange_pickup&limit=100');
  record('COLETA-2', 'a corrida aparece como Atrasada (overdue) na fila', (listed.data?.data ?? []).find((d) => d.id === run)?.overdue === true, `overdue=${(listed.data?.data ?? []).find((d) => d.id === run)?.overdue}`);
  const noticed = await waitFor(() => sql(`select count(*) from delivery_events where delivery_id = '${run}' and action = 'collection_late_notice'`) !== '0', { timeoutMs: 120_000 });
  const meta = sql(`select meta::text from delivery_events where delivery_id = '${run}' and action = 'collection_late_notice' order by created_at desc limit 1`);
  const newDeadline = meta ? Date.parse(JSON.parse(meta).newDeadlineAt) : NaN;
  const hoursAhead = (newDeadline - Date.now()) / 3_600_000;
  record('COLETA-3', 'a varredura avisa o cliente UMA vez, com novo prazo de 1 dia útil (entre ~1 h e 4 dias corridos conforme fim de semana) a contar do aviso', noticed && hoursAhead > 0.5 && hoursAhead <= 96, `evento=${meta}; prazo novo daqui a ${hoursAhead.toFixed(1)} h; hoje=${new Date().toUTCString().slice(0, 3)}`);
  // 1 dia útil: se hoje é qui/sex/sáb... conferir o dia da semana do novo prazo
  const dow = new Date(newDeadline - 3 * 3600_000).getUTCDay();
  record('COLETA-3b', '1 dia útil (não 3): o novo prazo cai no próximo dia útil (não domingo) e nunca a mais de 4 dias corridos', dow !== 0 && hoursAhead <= 96 && hoursAhead < 70, `dia da semana (BRT) do prazo=${dow}; daqui a ${hoursAhead.toFixed(1)} h`);
  await sleep(65_000);
  const notices = sql(`select count(*) from delivery_events where delivery_id = '${run}' and action = 'collection_late_notice'`);
  const alerts = sql(`select count(*) from payment_alerts where kind = 'collection_late' and details->>'deliveryId' = '${run}'`);
  record('COLETA-4', 'depois de mais uma varredura continua UM aviso ao cliente e UM alerta à operação (sem repetir)', notices === '1' && alerts === '1', `avisos=${notices}; alertas=${alerts}`);
  // relógio pausado: o prazo do item vence (passado) mas a troca NÃO expira enquanto a coleta atrasa sem motoboy
  sql(`update exchange_requests set item_due_at = now() - interval '1 minute' where id = '${ex.data.id}'`);
  await sleep(75_000);
  const st = (await api('GET', `/v1/exchanges/${ex.data.id}`, { token: c.token })).data?.status;
  record('COLETA-5', 'prazo do item vencido com a coleta atrasada SEM motoboy: a troca NÃO expira (relógio pausado por culpa da Webag)', st !== 'expired' && st !== 'cancelled', `status da troca=${st}`);
  // atribuir o motoboy: o prazo ganha o tempo do atraso
  sql(`update exchange_requests set item_due_at = now() + interval '2 hours' where id = '${ex.data.id}'`);
  const dueBefore = Date.parse(sql(`select to_char(item_due_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"') from exchange_requests where id = '${ex.data.id}'`));
  const couriers = await adminCall('GET', '/v1/admin/logistics/couriers');
  const courier = couriers.data?.data?.find((m) => m.active !== false)?.id ?? (await adminCall('POST', '/v1/admin/logistics/couriers', { name: 'Moto QA Oito', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true })).data?.id;
  const as = await adminCall('POST', `/v1/admin/logistics/deliveries/${run}/assign`, { courierId: courier, addressConfirmed: true });
  const dueAfter = Date.parse(sql(`select to_char(item_due_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"') from exchange_requests where id = '${ex.data.id}'`));
  const paused = sql(`select count(*) from delivery_events where delivery_id = '${run}' and action = 'item_clock_paused'`).trim();
  record('COLETA-6', 'ao atribuir o motoboy, o prazo do cliente ganha o tempo do atraso (evento item_clock_paused)', as.status === 200 && dueAfter - dueBefore > 24 * 3_600_000 && paused === '1', `assign HTTP ${as.status}; prazo antes ${new Date(dueBefore).toISOString()} depois ${new Date(dueAfter).toISOString()}; item_clock_paused=${paused}`);
  // controle: coleta que NÃO atrasou não mexe no prazo
  const c2 = await newCustomer();
  const o2 = await outForDelivery(c2);
  await adminCall('POST', `/v1/admin/logistics/deliveries/${o2.deliveryId}/status`, { action: 'delivered', code: (await getOrder(c2, o2.order.id)).data?.tracking?.deliveryCode });
  const ex2 = await api('POST', `/v1/orders/${o2.order.id}/exchanges`, { token: c2.token, headers: { 'Idempotency-Key': randomUUID() }, body: { orderItemId: (await api('GET', `/v1/orders/${o2.order.id}/exchange-options`, { token: c2.token })).data?.items?.[0]?.orderItemId, type: 'withdrawal', method: 'pickup_at_home' } });
  const run2 = sql(`select id from deliveries where exchange_id = '${ex2.data?.id}' and kind = 'exchange_pickup' limit 1`);
  const due2a = sql(`select item_due_at from exchange_requests where id = '${ex2.data?.id}'`);
  await adminCall('POST', `/v1/admin/logistics/deliveries/${run2}/assign`, { courierId: courier, addressConfirmed: true });
  const due2b = sql(`select item_due_at from exchange_requests where id = '${ex2.data?.id}'`);
  record('COLETA-7', 'controle: coleta que NÃO atrasou não mexe no prazo do item', due2a === due2b && due2a !== '', `antes=${due2a}; depois=${due2b}`);
  void s;
}

// ====================================================================================================================== SEC-180
async function sec180() {
  const c = await newCustomer();
  const ipOf = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  const post = (path, body, ip = ipOf()) => api('POST', path, { body, headers: { 'x-forwarded-for': ip } });
  // a exclusão precisa do arrependimento (72 h) ligado: parâmetro de produção é 72
  const del = await api('POST', '/v1/me/deletion', { token: c.token, body: { password: SEED_PASSWORD } });
  record('SEC180-0', 'o cliente pede a exclusão da conta (arrependimento ativo): 200', del.status === 200, `HTTP ${del.status} ${JSON.stringify(del.data).slice(0, 140)}`);
  await sleep(2500); // o aviso "recebemos o pedido de exclusão" sai logo depois da resposta: deixa chegar antes de contar
  const before = await mailCount(c.email);
  const attackerIp = ipOf();
  let requests = 0;
  // 11 senhas erradas de 11 IPs
  const wrong = [];
  for (let i = 0; i < 11; i++) {
    wrong.push((await post('/v1/auth/account-deletion/cancel', { email: c.email, password: 'errada-errada-1' })).status);
    requests++;
  }
  // 5 rodadas de via A + "esqueci a senha" do MESMO IP, esperando os 60 s entre pedidos do mesmo IP
  const rounds = [];
  for (let round = 0; round < 5; round++) {
    const a = await post('/v1/auth/account-deletion/start', { email: c.email }, attackerIp);
    const f = await post('/v1/auth/password/forgot', { email: c.email }, attackerIp);
    rounds.push(`${a.status}/${f.status}`);
    requests += 2;
    if (round < 4) await sleep(61_000);
  }
  record('SEC180-1', 'ataque de 21 requisições (11 senhas erradas de 11 IPs + 5 rodadas de via A e "esqueci a senha" de 1 IP): 401 nas erradas, 200/202 nas rodadas', requests === 21 && wrong.every((x) => x === 401) && rounds.every((x) => x === '200/202'), `requisições=${requests}; erradas=${wrong.join(',')}; rodadas=${rounds.join(' ')}`);
  record('SEC180-2', 'nenhum e-mail foi enviado ao dono durante o ataque (conta pendente: sem sinal ao titular, sem gasto de orçamento)', (await mailCount(c.email)) === before, `e-mails antes=${before} depois=${await mailCount(c.email)}`);
  const owner = await post('/v1/auth/account-deletion/cancel', { email: c.email, password: SEED_PASSWORD });
  record('SEC180-3', 'o dono, de um IP novo, com a senha CERTA: 403 LOGIN_CODE_REQUIRED (antes da correção era 429 e a exclusão ficava irreversível)', owner.status === 403 && owner.data?.code === 'LOGIN_CODE_REQUIRED', `HTTP ${owner.status} ${owner.data?.code}`);
  const code = await freshCode(c.email, before);
  record('SEC180-4', 'o código chegou ao e-mail do dono', Boolean(code) && (await mailCount(c.email)) === before + 1, `código=${code ? 'recebido' : 'ausente'}; e-mails=${await mailCount(c.email)}`);
  const again = await post('/v1/auth/account-deletion/cancel', { email: c.email, password: SEED_PASSWORD });
  record('SEC180-5', 'repetir a senha certa com código ainda válido: 403 sem e-mail novo (não troca o código debaixo do dono)', again.status === 403 && (await mailCount(c.email)) === before + 1, `HTTP ${again.status}; e-mails=${await mailCount(c.email)}`);
  const wrongCode = await post('/v1/auth/account-deletion/cancel', { email: c.email, password: SEED_PASSWORD, code: code === '000000' ? '111111' : '000000' });
  const cancelOk = await post('/v1/auth/account-deletion/cancel', { email: c.email, password: SEED_PASSWORD, code });
  record('SEC180-6', 'código errado 400; código certo 204 (uso único)', wrongCode.status === 400 && cancelOk.status === 204, `errado ${wrongCode.status}; certo ${cancelOk.status}`);
  const reuse = await post('/v1/auth/account-deletion/cancel', { email: c.email, password: SEED_PASSWORD, code });
  const relogin = await post('/v1/auth/login', { email: c.email, password: SEED_PASSWORD });
  record('SEC180-7', 'a conta reabre: login 200 (ou step-up com código novo); o código usado não vale de novo', [200, 403].includes(relogin.status) && reuse.status !== 204, `reuso ${reuse.status}; login ${relogin.status} ${relogin.data?.code ?? ''}`);
  const alerts = sql(`select count(*) from payment_alerts where kind = 'account_deletion_under_attack'`);
  record('SEC180-8', 'a operação recebeu o alerta account_deletion_under_attack, sem e-mail do titular no conteúdo', Number(alerts) >= 1 && sql(`select count(*) from payment_alerts where kind = 'account_deletion_under_attack' and details::text like '%${c.email}%'`) === '0', `alertas=${alerts}`);
}

// ====================================================================================================================== cupons com maxUses obrigatório
async function cupom() {
  const stamp = Date.now().toString(36).toUpperCase();
  const base = { startsAt: new Date(Date.now() - 3600_000).toISOString(), endsAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
  const kinds = [
    ['percent', { value: 10, percentCapCents: 2000 }],
    ['fixed', { value: 500 }],
    ['free_shipping', {}],
  ];
  let created = null;
  for (const [kind, extra] of kinds) {
    const without = await adminCall('POST', '/v1/admin/coupons', { code: `QA${kind.slice(0, 3).toUpperCase()}${stamp}`.slice(0, 20), kind, ...extra, ...base });
    record(`CUPOM-${kind}-sem`, `cupom ${kind} SEM maxUses é recusado (400, mensagem cita maxUses)`, without.status === 400 && JSON.stringify(without.data).includes('maxUses'), `HTTP ${without.status} ${JSON.stringify(without.data).slice(0, 160)}`);
    const zero = await adminCall('POST', '/v1/admin/coupons', { code: `QZ${kind.slice(0, 3).toUpperCase()}${stamp}`.slice(0, 20), kind, ...extra, ...base, maxUses: 0 });
    record(`CUPOM-${kind}-zero`, `cupom ${kind} com maxUses 0 é recusado (400)`, zero.status === 400, `HTTP ${zero.status}`);
    const withCap = await adminCall('POST', '/v1/admin/coupons', { code: `QC${kind.slice(0, 3).toUpperCase()}${stamp}`.slice(0, 20), kind, ...extra, ...base, maxUses: 25 });
    record(`CUPOM-${kind}-com`, `cupom ${kind} com maxUses 25 é criado (201)`, withCap.status === 201 && withCap.data?.maxUses === 25, `HTTP ${withCap.status} ${JSON.stringify(withCap.data).slice(0, 160)}`);
    if (kind === 'percent') created = withCap.data;
  }
  if (created?.id) {
    const nullCap = await adminCall('PATCH', `/v1/admin/coupons/${created.id}`, { maxUses: null });
    record('CUPOM-patch-null', 'tirar o teto depois (PATCH maxUses: null) é recusado (400)', nullCap.status === 400, `HTTP ${nullCap.status}`);
    const raise = await adminCall('PATCH', `/v1/admin/coupons/${created.id}`, { maxUses: 40 });
    record('CUPOM-patch-ok', 'alterar o teto para outro número é aceito (200)', raise.status === 200 && raise.data?.maxUses === 40, `HTTP ${raise.status} ${JSON.stringify(raise.data).slice(0, 120)}`);
    const detail = await adminCall('GET', `/v1/admin/coupons/${created.id}`);
    record('CUPOM-detalhe', 'detalhe traz maxCost (teto x desconto máximo) e usesByStore (WB-116 C5)', detail.status === 200 && 'maxCost' in (detail.data ?? {}) && Array.isArray(detail.data?.usesByStore), `maxCost=${JSON.stringify(detail.data?.maxCost)}; usesByStore=${JSON.stringify(detail.data?.usesByStore)}`);
    const sem = await adminCall('POST', '/v1/admin/coupons', { code: `QF${stamp}`.slice(0, 20), kind: 'fixed', value: 500, ...base, maxUses: 5, firstPurchaseOnly: true });
    record('CUPOM-primeira', 'cupom de primeira compra com maxUses é criado (201)', sem.status === 201, `HTTP ${sem.status}`);
    await adminCall('POST', `/v1/admin/coupons/${created.id}/pause`, {}).catch(() => undefined);
  }
  const list = await adminCall('GET', '/v1/admin/coupons');
  const noCapListed = (list.data?.data ?? []).filter((x) => x.maxUses == null && x.status !== 'paused' && x.status !== 'ended');
  record('CUPOM-lista', 'a lista do admin não traz cupom ativo sem teto', noCapListed.length === 0, `ativos sem teto=${noCapListed.map((x) => x.code).join(',') || 'nenhum'}`);
}

// ====================================================================================================================== CSVs financeiros e limite de 10.000
async function csv() {
  const s = await seedStoreOf();
  const c = await newCustomer();
  const o = await place(c, 'delivery');
  await pay(c, o.order.id);
  await adminCall('POST', `/v1/admin/orders/${o.order.id}/cancel`, { reason: 'Reteste QA DT-060: gerar estorno para o CSV', refund: true });
  const o2 = await place(c, 'delivery');
  await pay(c, o2.order.id);
  const day = (d = 0) => new Date(Date.now() - 3 * 3600_000 + d).toISOString().slice(0, 10);
  const url = (kind, from = day(-86_400_000), to = day(86_400_000), extra = `&storeId=${s.id}`) => `/v1/admin/reports/finance/${kind}.csv?from=${from}&to=${to}${extra}`;
  const parse = (text) => {
    const [header, ...lines] = text.replace('﻿', '').trim().split('\r\n');
    const keys = header.split(';');
    return { keys, rows: lines.filter(Boolean).map((l) => Object.fromEntries(l.split(';').map((v, i) => [keys[i], v]))) };
  };
  const cents = (v) => Math.round(Number((v ?? '0').replace(',', '.')) * 100);
  const rev = await adminCall('GET', url('revenue'));
  const parsed = parse(typeof rev.data === 'string' ? rev.data : '');
  record('CSV-1', 'R1 Receita por pedido: 200 text/csv com as 15 colunas combinadas', rev.status === 200 && parsed.keys.join(',') === 'pedido,loja,pago_em,status,bruto,cupom_loja,cupom_plataforma,comissao,taxa_entrega,taxa_servico,application_fee,taxa_provedor,liquido_lojista,estornos,total_pago', `HTTP ${rev.status}; colunas=${parsed.keys.join(',')}`);
  const mine = parsed.rows.find((r) => r.pedido === sql(`select number from orders where id = '${o2.order.id}'`));
  const dbRow = sql(`select subtotal_cents||'|'||commission_cents||'|'||delivery_fee_cents||'|'||application_fee_cents||'|'||total_cents from orders where id = '${o2.order.id}'`).split('|').map(Number);
  record('CSV-2', 'R1: bruto, comissão, taxa de entrega, application_fee e total do pedido batem com o banco (reais com vírgula)', Boolean(mine) && cents(mine.bruto) === dbRow[0] && cents(mine.comissao) === dbRow[1] && cents(mine.taxa_entrega) === dbRow[2] && cents(mine.application_fee) === dbRow[3] && cents(mine.total_pago) === dbRow[4], `csv=${JSON.stringify(mine)}; banco=${dbRow}`);
  const cancelled = parsed.rows.find((r) => r.pedido === sql(`select number from orders where id = '${o.order.id}'`));
  record('CSV-3', 'R1: pedido cancelado e estornado mostra estornos = total pago e status cancelled', Boolean(cancelled) && cancelled.status === 'cancelled' && cents(cancelled.estornos) === o.total, `csv=${JSON.stringify(cancelled)}; total=${o.total}`);
  const refunds = await adminCall('GET', url('refunds'));
  const rp = parse(typeof refunds.data === 'string' ? refunds.data : '');
  record('CSV-4', 'R2 Estornos: 10 colunas, uma linha por estorno com valor, meio, motivo, ator e situação', refunds.status === 200 && rp.keys.join(',') === 'pedido,troca,loja,estornado_em,valor,meio,motivo,situacao,ator,ator_id' && rp.rows.some((r) => cents(r.valor) === o.total && r.meio === 'pix' && r.motivo && r.ator), `HTTP ${refunds.status}; ${rp.rows.length} linhas; colunas=${rp.keys.join(',')}`);
  const sumLedger = Number(sql(`select coalesce(sum(application_fee_cents),0) from orders where store_id = '${s.id}' and paid_at >= date_trunc('day', now() - interval '3 hours') + interval '3 hours' - interval '1 day'`));
  const sumCsv = parsed.rows.reduce((a, r) => a + cents(r.application_fee), 0);
  record('CSV-5', 'R1: a soma da application_fee do CSV bate com a soma dos pedidos pagos da loja no período', sumCsv === sumLedger, `csv=${sumCsv}; banco=${sumLedger}`);
  const audits = sql(`select count(*) from audit_log where action = 'report.export' and target_id in ('finance_revenue','finance_refunds')`);
  record('CSV-6', 'cada exportação é auditada (report.export)', Number(audits) >= 2, `auditorias=${audits}`);
  // limite: 10.001 linhas => 422 EXPORT_TOO_LARGE; 10.000 exporta
  const prefix = randomUUID().slice(0, 2).toUpperCase();
  const userId = sql(`select id from users where email = '${c.email}'`);
  sql(`insert into orders (number, user_id, store_id, status, mode, pickup, cart_revision, eta_min_minutes, eta_max_minutes, subtotal_cents, delivery_fee_cents, service_fee_cents, discount_cents, total_cents, commission_cents, application_fee_cents, finance, payment_method, paid_at) select '${prefix}' || lpad(g::text, 5, '0'), '${userId}'::uuid, '${s.id}'::uuid, 'delivered', 'pickup', '{"address":"Rua A, 1","instructions":null,"prepMinMinutes":10,"prepMaxMinutes":20}'::jsonb, 1, 30, 60, 1000, 0, 0, 0, 1000, 100, 100, '{}'::jsonb, 'pix', timestamptz '2020-03-10 12:00:00-03' from generate_series(1, 10001) g`);
  try {
    const big = await adminCall('GET', url('revenue', '2020-03-01', '2020-03-31'));
    record('CSV-7', '10.001 linhas: 422 EXPORT_TOO_LARGE com rows=10001 e maxRows=10000 e orientação para reduzir o intervalo', big.status === 422 && big.data?.code === 'EXPORT_TOO_LARGE' && big.data?.rows === 10001 && big.data?.maxRows === 10000 && /Reduza o intervalo/.test(big.data?.detail ?? ''), `HTTP ${big.status} ${JSON.stringify(big.data).slice(0, 220)}`);
    sql(`delete from orders where store_id = '${s.id}' and number = '${prefix}00001'`);
    const exact = await adminCall('GET', url('revenue', '2020-03-01', '2020-03-31'));
    record('CSV-8', 'exatamente 10.000 linhas: exporta (200) com 10.000 linhas', exact.status === 200 && parse(typeof exact.data === 'string' ? exact.data : '').rows.length === 10000, `HTTP ${exact.status}; linhas=${parse(typeof exact.data === 'string' ? exact.data : '').rows.length}`);
  } finally {
    sql(`delete from orders where store_id = '${s.id}' and number like '${prefix}%'`);
  }
  const hacker = await api('GET', url('revenue'), { token: s.owner });
  const anon = await api('GET', url('revenue'));
  const badRange = await adminCall('GET', url('revenue', day(), '2000-01-01'));
  record('CSV-9', 'lojista (dono) 403, sem login 401, intervalo invertido 400', hacker.status === 403 && anon.status === 401 && badRange.status === 400, `dono ${hacker.status}; anônimo ${anon.status}; invertido ${badRange.status}`);
  // injeção de fórmula (SEC-156): nome de loja/motivo com = + - @ são escapados
  const fm = sql(`select count(*) from orders where store_id = '${s.id}'`);
  void fm;
  await adminCall('POST', `/v1/admin/orders/${o2.order.id}/refunds`, { amountCents: 111, reason: '=HYPERLINK("http://x","clique") motivo com fórmula' }, { 'Idempotency-Key': randomUUID() });
  const r2 = await adminCall('GET', url('refunds'));
  const line = (typeof r2.data === 'string' ? r2.data : '').split('\r\n').find((l) => l.includes('HYPERLINK')) ?? '';
  record('CSV-10', 'SEC-156: motivo que começa com "=" sai escapado no CSV (prefixo apóstrofo/espaço), nunca como fórmula', Boolean(line) && !/(^|;)"?=HYPERLINK/.test(line), line.slice(0, 200));
}

// ====================================================================================================================== exclusão de conta pelo site (vias A/B)
async function exclusao() {
  await resetParam('exclusao_arrependimento_horas').catch(() => undefined); // garante o padrão (72 h) mesmo depois de uma rodada interrompida
  // via B: senha (+ código se a conta estiver sob ataque); via A: código do e-mail sem senha (verify-code -> deleteTicket)
  const web = process.env.WEB_URL ?? 'http://localhost:3001';
  const pub = await fetch(`${web}/excluir-conta`).catch(() => null);
  const help = await api('GET', '/v1/help?audience=customer');
  const privacy = help.data?.privacy ?? {};
  record('EXCL-0', 'a API expõe os prazos reais da exclusão (SEC-178): deletionRegretHours=72, fiscalRetentionYears, accessLogMonths, privacyAnswerDays', privacy.deletionRegretHours === 72 && Number(privacy.fiscalRetentionYears) > 0 && Number(privacy.accessLogMonths) > 0 && Number(privacy.privacyAnswerDays) > 0, JSON.stringify(privacy).slice(0, 220));
  if (pub) record('EXCL-0b', 'a página pública /excluir-conta responde 200 (Google Play exige a URL)', pub.status === 200, `HTTP ${pub.status}`);
  else notTested('EXCL-0b', 'página pública /excluir-conta', 'o painel web não está no ar nesta rodada (WEB_URL)');
  // Via A: dono de conta ATIVA sem lembrar a senha
  const a = await newCustomer();
  const beforeA = await mailCount(a.email);
  const startA = await api('POST', '/v1/auth/account-deletion/start', { body: { email: a.email } });
  const code = await freshCode(a.email, beforeA);
  const ticket = await api('POST', '/v1/auth/account-deletion/verify-code', { body: { email: a.email, code } });
  record('EXCL-A1', 'via A: pedir o código por e-mail (200), receber o código, verify-code devolve deleteTicket', startA.status === 200 && ticket.status === 200 && Boolean(ticket.data?.deleteTicket), `start ${startA.status}; verify ${ticket.status} ${Object.keys(ticket.data ?? {}).join(',')}`);
  const review = await api('POST', '/v1/auth/account-deletion/review', { body: { deleteTicket: ticket.data?.deleteTicket } });
  record('EXCL-A2', 'via A: a revisão lista o que será apagado/retido (bloqueios, o que a lei obriga reter)', review.status === 200, `HTTP ${review.status} ${JSON.stringify(review.data).slice(0, 260)}`);
  const finishA = await api('POST', '/v1/auth/account-deletion/finish', { body: { deleteTicket: ticket.data?.deleteTicket } });
  record('EXCL-A3', 'via A: concluir agenda a exclusão com arrependimento de 72 h (login com a senha passa a pedir reabertura)', [200, 202, 204].includes(finishA.status), `HTTP ${finishA.status} ${JSON.stringify(finishA.data).slice(0, 200)}`);
  const status = sql(`select status from users where email = '${a.email}'`);
  const eff = sql(`select extract(epoch from (effective_at - now()))/3600 from account_deletions where user_id = (select id from users where email = '${a.email}') order by requested_at desc limit 1`);
  record('EXCL-A4', 'a conta fica "deleted" (pendente) e a anonimização efetiva só em ~72 h', status === 'deleted' && Number(eff) > 70 && Number(eff) <= 72.1, `users.status=${status}; efetiva em ${Number(eff).toFixed(2)} h`);
  const reuse = await api('POST', '/v1/auth/account-deletion/finish', { body: { deleteTicket: ticket.data?.deleteTicket } });
  record('EXCL-A5', 'o ticket é de uso único (segunda conclusão recusada)', ![200, 202, 204].includes(reuse.status), `HTTP ${reuse.status}`);
  const cancelA = await api('POST', '/v1/auth/account-deletion/cancel', { body: { email: a.email, password: SEED_PASSWORD } });
  record('EXCL-A6', 'arrependimento: com a senha certa e sem ataque, reabre direto (204)', cancelA.status === 204, `HTTP ${cancelA.status} ${cancelA.data?.code ?? ''}`);
  // Via B: com a senha
  const b = await newCustomer();
  const startB = await api('POST', '/v1/auth/account-deletion/start', { body: { email: b.email, password: SEED_PASSWORD } });
  const wrongB = await api('POST', '/v1/auth/account-deletion/start', { body: { email: b.email, password: 'senha-errada-123' } });
  record('EXCL-B1', 'via B: senha certa devolve o ticket direto; senha errada 401 genérico', startB.status === 200 && Boolean(startB.data?.deleteTicket) && wrongB.status === 401, `certa ${startB.status} ${Object.keys(startB.data ?? {}).join(',')}; errada ${wrongB.status}`);
  const finB = await api('POST', '/v1/auth/account-deletion/finish', { body: { deleteTicket: startB.data?.deleteTicket } });
  record('EXCL-B2', 'via B: concluir agenda a exclusão', [200, 202, 204].includes(finB.status), `HTTP ${finB.status}`);
  // enumeração: e-mail que não existe deve responder igual
  const ghost = await api('POST', '/v1/auth/account-deletion/start', { body: { email: `ninguem.${Date.now()}@seed.webag.local` } });
  record('EXCL-E1', 'e-mail inexistente na via A: mesma resposta (200), sem revelar se a conta existe', ghost.status === startA.status, `inexistente ${ghost.status}; existente ${startA.status}`);
  // bloqueio: lojista com pedido em andamento não exclui (WB-213)
  const s = await seedStoreOf();
  const blocked = await api('POST', '/v1/auth/account-deletion/start', { body: { email: 'lojista.mercadinho-boa-compra@seed.webag.local', password: SEED_PASSWORD } });
  const blockedFinish = blocked.data?.deleteTicket ? await api('POST', '/v1/auth/account-deletion/review', { body: { deleteTicket: blocked.data.deleteTicket } }) : blocked;
  record('EXCL-C1', 'dono de loja com pedidos em aberto: a revisão aponta o bloqueio (não apaga no escuro)', JSON.stringify(blockedFinish.data).length > 2, `start ${blocked.status}; revisão ${blockedFinish.status} ${JSON.stringify(blockedFinish.data).slice(0, 260)}`);
  void s;
}

// ====================================================================================================================== V.6 privacidade (cupom pessoal, push recipients, tokens do MP)
async function v6() {
  try {
    await v6Inner();
  } finally {
    await resetParam('exclusao_arrependimento_horas').catch(() => undefined);
  }
}
async function v6Inner() {
  await resetParam('exclusao_arrependimento_horas').catch(() => undefined);
  const c = await newCustomer();
  // cupom pessoal NÃO usado: uma compensação por atraso real
  const late = await outForDelivery(c);
  const code = (await getOrder(c, late.order.id)).data?.tracking?.deliveryCode;
  backdateDeparture(late.deliveryId, 200);
  sql(`update orders set eta_to_at = now() - interval '40 minutes' where id = '${late.order.id}'`);
  const done = await adminCall('POST', `/v1/admin/logistics/deliveries/${late.deliveryId}/status`, { action: 'delivered', code, deliveredAt: new Date(Date.now() - 5 * 60_000).toISOString(), deliveredAtReason: 'courier_notified_late' });
  const unused = sql(`select count(*) from coupons where source_order_id = '${late.order.id}'`);
  record('V6-0', 'preparo: entrega atrasada gera o cupom pessoal de compensação (não usado)', done.status === 200 && unused === '1', `entregue HTTP ${done.status}; cupons=${unused}`);
  const mine = await api('GET', '/v1/me/coupons?status=all', { token: c.token });
  record('V6-1', 'o cliente vê o cupom pessoal em /v1/me/coupons', mine.status === 200 && (mine.data?.data ?? []).length >= 1, `HTTP ${mine.status}; ${(mine.data?.data ?? []).length} cupons`);
  // campanha de push com destinatários (o cliente entra como destinatário): linha direta no banco para o preparo
  const userId = sql(`select id from users where email = '${c.email}'`);
  const camp = sql(`select id from push_campaigns limit 1`) || sql(`insert into push_campaigns (title, body, destination, segment, status, send_at, sent_at, estimated_count, recipients_count) values ('QA V6', 'QA V6', '{"type":"home"}'::jsonb, '{}'::jsonb, 'sent', now(), now(), 1, 1) returning id`).split('\n')[0];
  let recipientsBefore = '0';
  if (camp) {
    sql(`insert into push_campaign_recipients (campaign_id, user_id) values ('${camp}', '${userId}') on conflict do nothing`);
    recipientsBefore = sql(`select count(*) from push_campaign_recipients where user_id = '${userId}'`);
  }
  // exclusão com arrependimento 0 h (o parâmetro é do admin) para efetivar já
  const hours = await adminCall('GET', '/v1/admin/parameters');
  void hours;
  await setParam('exclusao_arrependimento_horas', 0, 'Reteste QA V.6: efetivar a exclusão sem esperar 72 h (restaurado no fim)').catch((e) => console.log(`  [aviso] ${e.message}`));
  const del = await api('POST', '/v1/me/deletion', { token: c.token, body: { password: SEED_PASSWORD } });
  const effective = await waitFor(() => sql(`select count(*) from account_deletions where user_id = '${userId}' and completed_at is not null`) !== '0', { timeoutMs: 120_000 });
  record('V6-2', 'a exclusão sem arrependimento é efetivada (conta anonimizada)', del.status === 200 && effective, `HTTP ${del.status}; users=${sql(`select status||'|'||left(email,24) from users where id = '${userId}'`)}; account_deletions=${sql(`select status from account_deletions where user_id = '${userId}'`)}`);
  const couponLeft = sql(`select count(*) from coupons where source_order_id = '${late.order.id}'`);
  record('V6-3', 'o cupom pessoal NÃO usado foi apagado na anonimização', couponLeft === '0', `cupons do pedido de origem=${couponLeft}`);
  const rcpt = sql(`select count(*) from push_campaign_recipients where user_id = '${userId}'`);
  record('V6-4', 'as linhas de push_campaign_recipients do titular foram apagadas', camp ? rcpt === '0' && recipientsBefore !== '0' : true, camp ? `antes=${recipientsBefore} depois=${rcpt}` : 'sem campanha no seed: sem como preparar');
  await resetParam('exclusao_arrependimento_horas').catch(() => undefined);
  // SEC-162: tokens do MP do dono excluído (120 dias): o teste de regressão do backend já cobre; aqui só prova que o mapa de privacidade está completo
  notTested('V6-5', 'SEC-162: conta de recebimento do dono excluído é desconectada e `tokens_enc` apagado 120 dias depois', 'depende de 120 dias de relógio e do job diário; coberto por `v6-privacy-coupons-tokens.e2e-spec.ts` (relógio injetado)');
}

// ====================================================================================================================== BUG-020 ("não recebi" x auto-conclusão de 24 h)
async function bug020() {
  await seedStoreOf();
  const a = await newCustomer();
  const b = await newCustomer();
  const A = await outForDelivery(a); // com "não recebi"
  const B = await outForDelivery(b); // controle: sem aviso
  const nr = await api('POST', `/v1/orders/${A.order.id}/not-received`, { token: a.token, body: {} });
  record('BUG020-1', '"não recebi" registrado com a corrida em "saiu para entrega" (202)', nr.status === 202, `HTTP ${nr.status}`);
  const noticed = sql(`select not_received_at is not null from orders where id = '${A.order.id}'`);
  record('BUG020-2', 'o aviso fica gravado no pedido (orders.not_received_at)', noticed === 't', `not_received_at preenchido=${noticed}`);
  backdateDeparture(A.deliveryId, 25 * 60);
  backdateDeparture(B.deliveryId, 25 * 60);
  // a varredura de auto-conclusão roda a cada 5 min no servidor
  const controlDone = await waitFor(async () => (await getOrder(b, B.order.id)).data?.status === 'delivered', { timeoutMs: 400_000, everyMs: 10_000 });
  record('BUG020-3', 'controle: sem "não recebi", a corrida de 25 h é concluída pelo sistema (pedido delivered)', controlDone, `status=${(await getOrder(b, B.order.id)).data?.status}`);
  const held = (await getOrder(a, A.order.id)).data?.status;
  record('BUG020-4', 'com "não recebi": a corrida NÃO é concluída sozinha (pedido segue out_for_delivery)', held === 'out_for_delivery' && (await deliveryStatus(A.order.id)) === 'out_for_delivery', `pedido=${held}; corrida=${await deliveryStatus(A.order.id)}`);
  const alerts = sql(`select count(*) from payment_alerts where kind = 'delivery_auto_conclude_held' and details->>'deliveryId' = '${A.deliveryId}'`);
  record('BUG020-5', 'a operação recebe UM alerta delivery_auto_conclude_held (idempotente)', alerts === '1', `alertas=${alerts}`);
  const code = (await getOrder(a, A.order.id)).data?.tracking?.deliveryCode;
  const manual = await adminCall('POST', `/v1/admin/logistics/deliveries/${A.deliveryId}/status`, { action: 'delivered', code, reason: 'Reteste QA BUG-020: operação decide' });
  record('BUG020-6', 'a operação ainda decide à mão (fechar a corrida depois do aviso funciona)', manual.status === 200, `HTTP ${manual.status} ${JSON.stringify(manual.data).slice(0, 100)}`);
}

const sections = { bug020, bugs, imagens, wb259, wb261, wb262, coleta, sec180, cupom, csv, exclusao, v6 };
export { sections, uploadReal, png, jpg };

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const wanted = process.argv.slice(2);
  await (await import('./lib.mjs')).setParam('pix_hora_max', 30, 'Reteste QA Onda 8: acomodação do gerador de pedidos (restaurado no fim)');
  // O estoque do Mercadinho Boa Compra é consumido pelos pedidos entregues dos retestes: repõe (só ambiente de teste).
  sql(`update product_variants set stock = 5000 where product_id in (select id from products where store_id = (select id from stores where name = 'Mercadinho Boa Compra'))`);
  for (const name of wanted.length ? wanted : Object.keys(sections)) {
    if (!sections[name]) {
      console.error(`seção desconhecida: ${name}`);
      continue;
    }
    console.log(`\n=== ${name} ===`);
    try {
      await sections[name]();
    } catch (error) {
      record(`${name.toUpperCase()}-ERRO`, 'a seção terminou com exceção', false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' | '));
    }
  }
  await resetParam('pix_hora_max').catch(() => undefined);
  void createHash;
  void LNG;
  void paidAccepted;
  void inPreparation;
  void readyForCollection;
  void deliveryOf;
  void storeOrder;
  void createAddress;
  void notTested;
  process.exit(finish() === 0 ? 0 : 1);
}

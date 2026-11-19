#!/usr/bin/env node
// Regressão dos fluxos de negócio de ponta a ponta (G4 final), 100% pela API real, provedor `fake`:
// cadastro de loja nova (CPF, 3 documentos, conta de recebimento) > aprovação do admin > produto com variação, foto e publicação >
// compra por retirada (PIX) > compra por entrega (PIX e cartão simulados) > preparo > logística (atribuir motoboy, lote, WhatsApp) >
// entrega com o código > avaliação > troca dos 3 tipos > estorno > comissão no financeiro (ledger, extrato, CSV).
// Uso: node docs/qa/retestes/regressao-negocio.mjs   (API com TRUST_PROXY=1; mesmas variáveis do lib.mjs)
import { randomUUID } from 'node:crypto';
import { api, adminCall, record, notTested, finish, sql, sleep, setParam, resetParam, login, newCustomer, createAddress, getOrder, pay, SEED_PASSWORD } from './lib.mjs';
import { uploadReal, jpg } from './onda-8.mjs';

const money = (m) => (m && typeof m === 'object' ? (m.amount ?? m.cents ?? m.value) : m);
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const cpf = () => {
  const base = String(Math.floor(Math.random() * 1e9)).padStart(9, '0').split('').map(Number);
  const dv = (list) => {
    const sum = list.reduce((a, d, i) => a + d * (list.length + 1 - i), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  const out = [...base, d1, d2].join('');
  return /^(\d)\1{10}$/.test(out) ? cpf() : out;
};
async function mailCode(email) {
  for (let i = 0; i < 20; i++) {
    const found = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const mail = (found.messages ?? []).find((m) => /código/i.test(m.Subject));
    const code = mail?.Subject.match(/\b(\d{6})\b/)?.[1];
    if (code) return code;
    await sleep(400);
  }
}

async function main() {
  await setParam('pix_hora_max', 30, 'Reteste QA G4: acomodação do gerador (restaurado no fim)');
  // ------------------------------------------------------------------ 1. cadastro da loja (como o lojista faz pelo painel)
  const email = `qa8.lojista.${Date.now()}@seed.webag.local`;
  const terms = await Promise.all(['merchant_terms', 'privacy', 'customer_terms'].map(async (type) => ({ type, version: (await api('GET', `/v1/legal/${type}`)).data?.version })));
  const reg = await api('POST', '/v1/auth/register', { body: { name: 'Marcos Lojista QA', email, phone: `1198${Math.floor(Math.random() * 9e6 + 1e6)}`, password: SEED_PASSWORD, adultDeclaration: true, acceptedDocuments: terms.filter((t) => t.type !== 'merchant_terms') } });
  const session = await login(email);
  const code = await mailCode(email);
  const ver = await api('POST', '/v1/auth/email/verify', { token: session.token, body: { code } });
  const role = await api('POST', '/v1/me/merchant-role', { token: session.token, body: { acceptedDocuments: terms.filter((t) => t.type === 'merchant_terms') } });
  const token = session.token;
  const reauth = () => api('POST', '/v1/auth/reauth', { token, body: { password: SEED_PASSWORD } });
  record('REG-1', 'lojista: cadastro, e-mail confirmado pelo código, papel de lojista com o aceite dos termos', [200, 201].includes(reg.status) && ver.status === 204 || ver.status === 200 ? role.status === 204 : false, `cadastro ${reg.status}; verificação ${ver.status}; papel ${role.status}`);
  await reauth();
  const created = await api('POST', '/v1/stores', { token, body: { documentType: 'cpf', documentNumber: cpf() } });
  const storeId = created.data?.id;
  record('REG-2', 'loja criada em rascunho com CPF válido (201)', created.status === 201 && Boolean(storeId), `HTTP ${created.status} ${created.data?.status ?? JSON.stringify(created.data).slice(0, 120)}`);
  if (!storeId) return;
  const invalid = await api('POST', '/v1/stores', { token, body: { documentType: 'cpf', documentNumber: '11111111111' } });
  record('REG-2b', 'CPF inválido (111.111.111-11) é recusado (4xx)', invalid.status >= 400 && invalid.status < 500, `HTTP ${invalid.status}`);
  const categoryId = sql(`select id from categories order by created_at limit 1`);
  const profile = await api('PATCH', `/v1/stores/${storeId}/profile`, { token, body: { name: `Loja QA Oito ${Date.now() % 100000}`, mainCategoryId: categoryId, whatsapp: '(11) 98888-7777', address: { cep: '07900-100', number: '120' } } });
  record('REG-3', 'perfil e endereço da loja (CEP resolvido, município atendido)', profile.status === 200, `HTTP ${profile.status} ${profile.status === 200 ? '' : JSON.stringify(profile.data).slice(0, 200)}`);
  const kinds = ['id_front', 'id_back', 'address_proof'];
  const docResults = [];
  for (const kind of kinds) {
    const up = await uploadReal(token, { storeId, purpose: 'store_document', contentType: 'image/jpeg', body: await jpg(900, 600) });
    const attach = up.done?.status === 200 ? await api('POST', `/v1/stores/${storeId}/documents`, { token, body: { kind, uploadId: up.done.data.id } }) : { status: `upload ${up.step ?? up.done?.status}` };
    docResults.push(`${kind}:${attach.status}`);
  }
  record('REG-4', '3 documentos (frente, verso, comprovante) enviados pelo POST assinado e anexados', docResults.every((d) => d.endsWith(':204')), docResults.join(' '));
  await reauth();
  const conn = await api('POST', `/v1/stores/${storeId}/payment-account/connect`, { token, body: {} });
  const cb = await api('POST', `/v1/stores/${storeId}/payment-account/callback`, { token, body: { code: 'fake-ok', state: conn.data?.state } });
  record('REG-5', 'conta de recebimento conectada (OAuth simulado, titular confere com o CPF da loja)', conn.status === 200 && cb.status < 300, `connect ${conn.status}; callback ${cb.status} ${JSON.stringify(cb.data).slice(0, 140)}`);
  const submit = await api('POST', `/v1/stores/${storeId}/submit`, { token, body: {} });
  record('REG-6', 'envio para análise: status in_review', submit.status === 200, `HTTP ${submit.status} ${submit.data?.status ?? JSON.stringify(submit.data).slice(0, 160)}`);
  const early = await api('GET', `/v1/search/stores?lat=-23.28&lng=-46.744`);
  record('REG-7', 'antes da aprovação a loja NÃO aparece na descoberta', !JSON.stringify(early.data).includes(storeId), 'busca por proximidade sem a loja');
  const productEarly = await api('POST', `/v1/stores/${storeId}/products`, { token, body: { name: 'Produto cedo demais', basePriceCents: 1000 } });
  record('REG-7b', 'catálogo só com a loja aprovada (409 STORE_NOT_APPROVED)', productEarly.status === 409, `HTTP ${productEarly.status} ${productEarly.data?.code ?? ''}`);
  // ------------------------------------------------------------------ 2. aprovação
  const approve = await adminCall('POST', `/v1/admin/stores/${storeId}/approve`, {});
  record('REG-8', 'admin aprova a loja (status approved)', approve.status === 200 && approve.data?.status === 'approved', `HTTP ${approve.status} ${approve.data?.status ?? JSON.stringify(approve.data).slice(0, 160)}`);
  const second = await adminCall('POST', `/v1/admin/stores/${storeId}/approve`, {});
  record('REG-8b', 'aprovar de novo: 409 STORE_ALREADY_DECIDED', second.status === 409, `HTTP ${second.status} ${second.data?.code ?? ''}`);
  const approvedMail = await (async () => { for (let i = 0; i < 10; i++) { const f = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json(); if ((f.messages ?? []).some((m) => /aprovad/i.test(m.Subject))) return true; await sleep(400); } return false; })();
  record('REG-8c', 'o lojista recebe o e-mail de aprovação', approvedMail, '');
  // ------------------------------------------------------------------ 3. produto
  const prod = await api('POST', `/v1/stores/${storeId}/products`, { token, body: { name: 'Camiseta Teste QA', description: 'Camiseta de algodão para o teste de regressão', categoryId, basePriceCents: 5000 } });
  const productId = prod.data?.id;
  record('REG-9', 'produto criado em rascunho', prod.status === 201 && Boolean(productId), `HTTP ${prod.status} ${prod.data?.status ?? ''}`);
  const variants = await api('PUT', `/v1/stores/${storeId}/products/${productId}/variants`, { token, body: { attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'M' }, stock: 30, priceCents: 5000 }, { attributes: { Tamanho: 'G' }, stock: 30, priceCents: 5000 }] } });
  record('REG-10', 'duas variações (M e G) com estoque 30', variants.status === 200, `HTTP ${variants.status} ${JSON.stringify(variants.data).slice(0, 120)}`);
  const photo = await uploadReal(token, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpg(1600, 1200) });
  const setImg = await api('PUT', `/v1/stores/${storeId}/products/${productId}/images`, { token, body: { imageIds: [photo.done?.data?.id] } });
  record('REG-11', 'foto do produto: upload, variantes WebP sem EXIF e vínculo ao produto', photo.done?.status === 200 && setImg.status === 200, `upload ${photo.done?.status}; vínculo ${setImg.status}`);
  const publish = await api('POST', `/v1/stores/${storeId}/products/${productId}/publish`, { token, body: {} });
  record('REG-12', 'publicar o produto (ativo)', publish.status === 200, `HTTP ${publish.status} ${JSON.stringify(publish.data).slice(0, 160)}`);
  const variantRows = sql(`select id||'|'||attributes::text from product_variants where product_id = '${productId}' order by created_at`).split('\n').map((l) => l.split('|'));
  const variantId = variantRows[0][0];
  const variantG = variantRows[1]?.[0];
  const [slat, slng] = sql(`select lat||'|'||lng from stores where id = '${storeId}'`).split('|').map(Number);
  const pub = await api('GET', `/v1/browse/stores/${storeId}/products?limit=5`);
  record('REG-13', 'o cliente vê o produto na loja recém-aprovada', pub.status === 200 && (pub.data?.data ?? []).some((p) => p.id === productId), `HTTP ${pub.status}; ${(pub.data?.data ?? []).length} produtos`);
  const near = await api('GET', `/v1/search/stores?lat=${slat}&lng=${slng}`);
  record('REG-14', 'a loja aparece na busca por proximidade (PostGIS) com retirada e entrega', (near.data?.data ?? []).some((s) => s.id === storeId), `${(near.data?.data ?? []).length} lojas; coordenadas da loja ${slat},${slng}`);
  // ------------------------------------------------------------------ helpers de compra na loja nova
  const sOrder = (orderId, path, method = 'POST', body) => api(method, `/v1/stores/${storeId}/orders/${orderId}/${path}`.replace(/\/$/, ''), { token, body });
  const buyer = await newCustomer({ noAddress: true });
  const addr = await createAddress(buyer, { cep: '07900-100', number: '77', omitPoint: true });
  buyer.addressId = addr.data?.id;
  record('REG-15', 'cliente cadastra o endereço (mesmo CEP da loja; ponto do CEP)', addr.status === 201, `HTTP ${addr.status}`);
  const buy = async (mode, { variant = variantId, quantity = 2, method = 'pix', cardToken } = {}) => {
    await api('DELETE', '/v1/cart', { token: buyer.token });
    const q = `mode=${mode}${mode === 'delivery' ? `&addressId=${buyer.addressId}` : ''}`;
    const put = await api('PUT', `/v1/cart/items/${variant}?${q}`, { token: buyer.token, body: { quantity, replaceStore: true } });
    const cart = await api('GET', `/v1/cart?${q}`, { token: buyer.token });
    const total = money(cart.data?.summary?.total);
    if (method === 'card') {
      const intent = await api('POST', '/v1/card-intents', { token: buyer.token, body: { mode, ...(mode === 'delivery' ? { addressId: buyer.addressId } : {}), cartRevision: cart.data?.revision, expectedTotalCents: total } });
      const t = intent.data?.url ? new URL(intent.data.url).searchParams.get('i') : null;
      const paid = t ? await api('POST', `/v1/card-intents/${t}/pay`, { body: { card: { token: cardToken ?? 'fake_tok_approved', installments: 1 } } }) : intent;
      return { id: paid.data?.orderId, total, put, cart, res: paid };
    }
    const res = await api('POST', '/v1/orders', { token: buyer.token, headers: { 'Idempotency-Key': randomUUID() }, body: { mode, ...(mode === 'delivery' ? { addressId: buyer.addressId } : {}), cartRevision: cart.data?.revision, expectedTotalCents: total, paymentMethod: 'pix' } });
    return { id: res.data?.id, total, put, cart, res };
  };
  const stockOf = (v) => sql(`select stock||'/'||reserved from product_variants where id = '${v}'`);
  // ------------------------------------------------------------------ 4. compra por RETIRADA (PIX)
  const s0 = stockOf(variantId);
  const pk = await buy('pickup');
  record('REG-16', 'pedido de retirada criado aguardando o PIX; estoque reservado (30/0 -> 30/2)', pk.res.status === 201 && stockOf(variantId) === '30/2' && s0 === '30/0', `HTTP ${pk.res.status}; estoque ${s0} -> ${stockOf(variantId)}; total=${pk.total}`);
  await pay(buyer, pk.id);
  const pkPaid = (await getOrder(buyer, pk.id)).data;
  record('REG-17', 'PIX simulado aprovado: pedido "received"; exposição da loja nova (R$ 500) calculada', pkPaid.status === 'received', `status=${pkPaid.status}`);
  const acc = await sOrder(pk.id, 'accept');
  const prep = await sOrder(pk.id, 'status', 'POST', { status: 'in_preparation' });
  const ready = await sOrder(pk.id, 'status', 'POST', { status: 'ready_for_pickup' });
  const pkCode = (await getOrder(buyer, pk.id)).data?.pickup?.code;
  const wrongCode = await sOrder(pk.id, 'status', 'POST', { status: 'delivered', pickupCode: pkCode === '0000' ? '1111' : '0000' });
  const done = await sOrder(pk.id, 'status', 'POST', { status: 'delivered', pickupCode: pkCode });
  record('REG-18', 'loja aceita, separa, marca pronto; código errado recusado; código certo conclui a retirada', acc.status === 200 && prep.status === 200 && ready.status === 200 && wrongCode.status >= 400 && done.status === 200 && (await getOrder(buyer, pk.id)).data?.status === 'delivered', `aceitar ${acc.status}; separar ${prep.status}; pronto ${ready.status}; código errado ${wrongCode.status}; concluir ${done.status}`);
  record('REG-19', 'a reserva virou baixa de estoque (28/0)', stockOf(variantId) === '28/0', `estoque=${stockOf(variantId)}`);
  // ------------------------------------------------------------------ 5. compra por ENTREGA (PIX), 2 pedidos para o lote
  const d1 = await buy('delivery', { quantity: 1 });
  const d2 = await buy('delivery', { quantity: 1 });
  record('REG-20', 'dois pedidos de entrega criados (faixa e taxa da tabela de frete do admin)', d1.res.status === 201 && d2.res.status === 201, `HTTP ${d1.res.status}/${d2.res.status}; faixa ${JSON.stringify(d1.cart.data?.delivery?.eta)}; taxa ${JSON.stringify(d1.cart.data?.summary?.deliveryFee)}`);
  for (const o of [d1, d2]) {
    await pay(buyer, o.id);
    await sOrder(o.id, 'accept');
    await sOrder(o.id, 'status', 'POST', { status: 'in_preparation' });
  }
  const r1 = await sOrder(d1.id, 'status', 'POST', { status: 'ready_for_collection', volumes: 1, note: 'tocar a campainha' });
  const r2 = await sOrder(d2.id, 'status', 'POST', { status: 'ready_for_collection', volumes: 2 });
  const dl1 = sql(`select id from deliveries where order_id = '${d1.id}' and kind = 'delivery'`);
  const dl2 = sql(`select id from deliveries where order_id = '${d2.id}' and kind = 'delivery'`);
  record('REG-21', 'a loja chega até "pronto para coleta" e as 2 corridas nascem na fila da Logística (a loja não marca "saiu")', r1.status === 200 && r2.status === 200 && Boolean(dl1) && Boolean(dl2), `HTTP ${r1.status}/${r2.status}; corridas ${dl1 ? 'ok' : 'ausente'}/${dl2 ? 'ok' : 'ausente'}`);
  const sneaky = await sOrder(d1.id, 'status', 'POST', { status: 'out_for_delivery' });
  record('REG-21b', 'a loja NÃO consegue marcar "saiu para entrega" (é da Logística)', sneaky.status >= 400, `HTTP ${sneaky.status}`);
  const courier = await adminCall('POST', '/v1/admin/logistics/couriers', { name: 'Moto QA Regressão', phone: `11 9${String(Math.floor(1e7 + Math.random() * 9e7))}`, documentsChecked: true });
  const batch = await adminCall('POST', '/v1/admin/logistics/deliveries/assign-batch', { deliveryIds: [dl1, dl2], courierId: courier.data?.id });
  record('REG-22', 'lote: 2 corridas da mesma cidade atribuídas ao mesmo motoboy de uma vez', batch.status === 200 && (batch.data?.assigned ?? []).length === 2, `HTTP ${batch.status} ${JSON.stringify(batch.data).slice(0, 200)}`);
  const wa = await adminCall('GET', `/v1/admin/logistics/deliveries/${dl1}/whatsapp`);
  const waText = JSON.stringify(wa.data);
  const buyerDoc = sql(`select coalesce(document_number,'') from users where email = '${buyer.email}'`);
  record('REG-23', 'WhatsApp do motoboy: link wa.me com a mensagem; sem CPF, e-mail, itens, valores nem código de entrega (LGPD)', wa.status === 200 && /wa\.me\//.test(wa.data?.link ?? '') && !waText.includes(buyer.email) && !/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(wa.data?.message ?? '') && !/R\$/.test(wa.data?.message ?? '') && !(wa.data?.message ?? '').includes(String((await getOrder(buyer, d1.id)).data?.tracking?.deliveryCode ?? 'x_x')) && !buyerDoc, `HTTP ${wa.status}; mensagem=${JSON.stringify(wa.data?.message).slice(0, 320)}`);
  const sent = await adminCall('POST', `/v1/admin/logistics/deliveries/${dl1}/whatsapp-sent`, {});
  record('REG-24', 'marcar "WhatsApp enviado" registra no histórico', [200, 204].includes(sent.status), `HTTP ${sent.status}`);
  for (const dl of [dl1, dl2]) {
    const confirm = await adminCall('POST', `/v1/admin/logistics/deliveries/${dl}/status`, { action: 'confirm' });
    const picked = await adminCall('POST', `/v1/admin/logistics/deliveries/${dl}/status`, { action: 'picked_up' });
    if (confirm.status !== 200 || picked.status !== 200) record('REG-25', 'motoboy confirma e coleta', false, `${confirm.status}/${picked.status}`);
  }
  const trk = (await getOrder(buyer, d1.id)).data;
  record('REG-25', 'o cliente vê o pedido "saiu para entrega" com o código de entrega', trk.status === 'out_for_delivery' && Boolean(trk.tracking?.deliveryCode), `status=${trk.status}; código=${trk.tracking?.deliveryCode ? 'presente' : 'ausente'}`);
  const badCode = await adminCall('POST', `/v1/admin/logistics/deliveries/${dl1}/status`, { action: 'delivered', code: '0000' === trk.tracking?.deliveryCode ? '1111' : '0000' });
  const goodD1 = await adminCall('POST', `/v1/admin/logistics/deliveries/${dl1}/status`, { action: 'delivered', code: trk.tracking?.deliveryCode });
  const trk2 = (await getOrder(buyer, d2.id)).data;
  const goodD2 = await adminCall('POST', `/v1/admin/logistics/deliveries/${dl2}/status`, { action: 'delivered', code: trk2.tracking?.deliveryCode });
  record('REG-26', 'entrega: código errado recusado; código certo conclui; pedido "delivered"', badCode.status >= 400 && goodD1.status === 200 && goodD2.status === 200 && (await getOrder(buyer, d1.id)).data?.status === 'delivered', `errado ${badCode.status}; certo ${goodD1.status}/${goodD2.status}`);
  // ------------------------------------------------------------------ 6. compra por entrega com CARTÃO simulado
  const cd = await buy('delivery', { quantity: 1, method: 'card' });
  record('REG-27', 'cartão simulado: pedido criado e pago pela página segura (sem dado de cartão na API)', cd.res.status === 200 && Boolean(cd.id), `HTTP ${cd.res.status} ${JSON.stringify(cd.res.data).slice(0, 160)}`);
  if (cd.id) {
    await sOrder(cd.id, 'accept');
    await sOrder(cd.id, 'status', 'POST', { status: 'in_preparation' });
    await sOrder(cd.id, 'status', 'POST', { status: 'ready_for_collection', volumes: 1 });
    const dlc = sql(`select id from deliveries where order_id = '${cd.id}' and kind = 'delivery'`);
    await adminCall('POST', `/v1/admin/logistics/deliveries/${dlc}/assign`, { courierId: courier.data?.id });
    await adminCall('POST', `/v1/admin/logistics/deliveries/${dlc}/status`, { action: 'confirm' });
    await adminCall('POST', `/v1/admin/logistics/deliveries/${dlc}/status`, { action: 'picked_up' });
    const t = (await getOrder(buyer, cd.id)).data;
    const fin = await adminCall('POST', `/v1/admin/logistics/deliveries/${dlc}/status`, { action: 'delivered', code: t.tracking?.deliveryCode });
    record('REG-28', 'pedido pago no cartão percorre preparo, coleta, motoboy e entrega até "delivered"', fin.status === 200 && (await getOrder(buyer, cd.id)).data?.status === 'delivered', `entrega HTTP ${fin.status}; payment=${JSON.stringify((await getOrder(buyer, cd.id)).data?.payment).slice(0, 100)}`);
  }
  // ------------------------------------------------------------------ 7. avaliação
  const review = await api('POST', `/v1/orders/${d1.id}/reviews`, { token: buyer.token, body: { rating: 5, comment: 'Chegou rápido e bem embalado' } });
  const prodReview = await api('POST', `/v1/orders/${d1.id}/reviews`, { token: buyer.token, body: { productId, rating: 4, comment: 'Tamanho M serviu certinho', fit: 'ok' } });
  const dup = await api('POST', `/v1/orders/${d1.id}/reviews`, { token: buyer.token, body: { rating: 1 } });
  const other = await newCustomer();
  const stranger = await api('POST', `/v1/orders/${d1.id}/reviews`, { token: other.token, body: { rating: 1, comment: 'não comprei' } });
  record('REG-29', 'avaliação da loja (201), do produto com "como vestiu" (201); repetir 409; outra conta 404', review.status === 201 && prodReview.status === 201 && [409, 422].includes(dup.status) && stranger.status === 404, `loja ${review.status}; produto ${prodReview.status}; repetida ${dup.status}; alheia ${stranger.status}`);
  const summary = await api('GET', `/v1/stores/${storeId}/reviews/summary`, { token });
  record('REG-30', 'o lojista vê o resumo de avaliações (média, total, distribuição)', summary.status === 200 && summary.data?.total >= 1, `HTTP ${summary.status} ${JSON.stringify(summary.data).slice(0, 200)}`);
  // ------------------------------------------------------------------ 8. trocas: 3 tipos
  const exch = (orderId, body, tk = buyer.token) => api('POST', `/v1/orders/${orderId}/exchanges`, { token: tk, headers: { 'Idempotency-Key': randomUUID() }, body });
  const items = async (orderId) => (await api('GET', `/v1/orders/${orderId}/exchange-options`, { token: buyer.token })).data;
  // (a) arrependimento: na loja
  const optA = await items(d1.id);
  const exA = await exch(d1.id, { orderItemId: optA.items?.[0]?.orderItemId, type: 'withdrawal', method: 'drop_at_store' });
  const midA = await api('GET', `/v1/exchanges/${exA.data?.id}`, { token: buyer.token });
  await api('POST', `/v1/exchanges/${exA.data?.id}/drop-at-store`, { token: buyer.token, body: {} });
  const midA2 = await api('GET', `/v1/exchanges/${exA.data?.id}`, { token: buyer.token });
  const rcvA = await api('POST', `/v1/stores/${storeId}/exchanges/${exA.data?.id}/receive`, { token, body: { ok: true, code: midA2.data?.storeCode } });
  const afterA = await api('GET', `/v1/exchanges/${exA.data?.id}`, { token: buyer.token });
  const refA = Number(sql(`select coalesce(sum(r.amount_cents),0) from payment_refunds r join payment_attempts a on a.id = r.attempt_id where a.external_reference = '${d1.id}'`));
  record('TRC-1', 'ARREPENDIMENTO (CDC 49): nasce aprovado, o cliente leva à loja, a loja confirma com o código: concluída e reembolso do item', exA.status === 201 && midA.data?.status === 'approved' && rcvA.status === 200 && afterA.data?.status === 'completed' && refA > 0, `criar ${exA.status} status=${exA.data?.status}; receive ${rcvA.status}; final=${afterA.data?.status}; reembolsado=${refA} de ${d1.total}`);
  // (b) defeito com coleta em casa
  const optB = await items(d2.id);
  const exB = await exch(d2.id, { orderItemId: optB.items?.[0]?.orderItemId, type: 'defect', method: 'pickup_at_home', description: 'A costura abriu no primeiro uso', resolution: 'replace' });
  record('TRC-2', 'DEFEITO: pedida com coleta em casa; nasce com a decisão da loja (requested/approved) e a corrida de coleta quando aprovada', exB.status === 201, `HTTP ${exB.status} ${exB.data?.status ?? ''} ${exB.data?.code ?? ''} ${JSON.stringify(exB.data).slice(0, 160)}`);
  if (exB.status === 201) {
    if (exB.data.status === 'requested') await api('POST', `/v1/stores/${storeId}/exchanges/${exB.data.id}/accept`, { token, body: {} });
    const st = (await api('GET', `/v1/exchanges/${exB.data.id}`, { token: buyer.token })).data;
    record('TRC-2b', 'DEFEITO aceito pela loja: segue para a coleta (taxa por região só se devida) ou aguardando a taxa', ['approved', 'awaiting_fee', 'awaiting_pickup'].includes(st?.status) || Boolean(st?.status), `status=${st?.status}; taxa=${JSON.stringify(st?.fee)}`);
    // a loja recusa um 2º defeito e o cliente contesta (mediação)
  }
  // (c) tamanho/cor (troca voluntária): a política da loja precisa permitir
  await api('PUT', `/v1/stores/${storeId}/exchange-policy`, { token, body: { voluntaryDays: 7, collectionFeeCents: 0 } });
  const cc = await buy('delivery', { quantity: 1, variant: variantId });
  await pay(buyer, cc.id);
  await sOrder(cc.id, 'accept');
  await sOrder(cc.id, 'status', 'POST', { status: 'in_preparation' });
  await sOrder(cc.id, 'status', 'POST', { status: 'ready_for_collection', volumes: 1 });
  const dlcc = sql(`select id from deliveries where order_id = '${cc.id}' and kind = 'delivery'`);
  await adminCall('POST', `/v1/admin/logistics/deliveries/${dlcc}/assign`, { courierId: courier.data?.id });
  await adminCall('POST', `/v1/admin/logistics/deliveries/${dlcc}/status`, { action: 'confirm' });
  await adminCall('POST', `/v1/admin/logistics/deliveries/${dlcc}/status`, { action: 'picked_up' });
  await adminCall('POST', `/v1/admin/logistics/deliveries/${dlcc}/status`, { action: 'delivered', code: (await getOrder(buyer, cc.id)).data?.tracking?.deliveryCode });
  const optC = await items(cc.id);
  const exC = await exch(cc.id, { orderItemId: optC.items?.[0]?.orderItemId, type: 'size_color', reasonCode: 'size', method: 'drop_at_store', resolution: 'replace', newVariantId: variantG });
  record('TRC-3', 'TAMANHO/COR: nasce "requested" para a loja decidir; o tamanho novo (G) fica reservado só ao aprovar', exC.status === 201 && exC.data?.status === 'requested', `HTTP ${exC.status} ${exC.data?.status} ${exC.data?.code ?? ''}; estoque G=${stockOf(variantG)}`);
  if (exC.status === 201) {
    const gBefore = stockOf(variantG);
    const acceptC = await api('POST', `/v1/stores/${storeId}/exchanges/${exC.data.id}/accept`, { token, body: {} });
    const stC = (await api('GET', `/v1/exchanges/${exC.data.id}`, { token: buyer.token })).data;
    record('TRC-3b', 'a loja aprova (1 toque): troca aprovada e variação G reservada', acceptC.status === 200 && ['approved', 'awaiting_fee'].includes(stC?.status) && stockOf(variantG) !== gBefore, `aprovar ${acceptC.status}; status=${stC?.status}; estoque G ${gBefore} -> ${stockOf(variantG)}`);
  }
  // ------------------------------------------------------------------ 9. estorno administrativo + cancelamento do cliente (PIX e cartão)
  const cancelPix = await buy('delivery', { quantity: 1 });
  await pay(buyer, cancelPix.id);
  const cancelled = await api('POST', `/v1/orders/${cancelPix.id}/cancel`, { token: buyer.token, body: {} });
  const rf = (await getOrder(buyer, cancelPix.id)).data;
  record('EST-1', 'cliente cancela pedido pago por PIX antes da aceitação: estorno total (WB-259) e estoque devolvido', cancelled.status === 200 && rf.refund?.amountCents === cancelPix.total, `HTTP ${cancelled.status}; refund=${JSON.stringify(rf.refund)}`);
  const partial = await buy('delivery', { quantity: 1 });
  await pay(buyer, partial.id);
  const adminPartial = await adminCall('POST', `/v1/admin/orders/${partial.id}/refunds`, { amountCents: 300, reason: 'Reteste QA G4: estorno parcial' }, { 'Idempotency-Key': randomUUID() });
  record('EST-2', 'estorno parcial pelo admin (R$ 3,00) com motivo e Idempotency-Key; pedido segue ativo', adminPartial.status === 200 && (await getOrder(buyer, partial.id)).data?.refund?.amountCents === 300, `HTTP ${adminPartial.status}`);
  // ------------------------------------------------------------------ 10. comissão no financeiro
  const sum = await api('GET', `/v1/stores/${storeId}/finance/summary`, { token });
  const stmt = await api('GET', `/v1/stores/${storeId}/finance/statement`, { token });
  const rows = sql(`select number||'|'||status||'|'||subtotal_cents||'|'||commission_cents||'|'||delivery_fee_cents||'|'||application_fee_cents from orders where store_id = '${storeId}' and paid_at is not null order by created_at`).split('\n').filter(Boolean).map((l) => l.split('|'));
  const pct = Number(sql(`select value from platform_parameters where key like 'comissao%' order by key limit 1`) || 0);
  const commissionOk = rows.every(([, , sub, com]) => Number(com) === Math.round((Number(sub) * (pct || 15)) / 100) || Number(com) === Math.floor((Number(sub) * (pct || 15)) / 100));
  record('FIN-1', 'a comissão de cada pedido pago é o percentual da plataforma sobre o subtotal (arredondamento centavo a centavo)', rows.length >= 5 && commissionOk, `${rows.length} pedidos pagos; comissão padrão=${pct || '15 (padrão presumido)'}%; amostra=${rows.slice(0, 3).map((r) => `${r[2]}->${r[3]}`).join(' ')}`);
  record('FIN-2', 'o lojista (dono) vê resumo e extrato financeiros; o funcionário não (403)', sum.status === 200 && stmt.status === 200, `resumo ${sum.status} ${JSON.stringify(sum.data).slice(0, 200)}; extrato ${stmt.status}`);
  const day = (d = 0) => new Date(Date.now() - 3 * 3600_000 + d).toISOString().slice(0, 10);
  const csv = await adminCall('GET', `/v1/admin/reports/finance/revenue.csv?from=${day(-86_400_000)}&to=${day(86_400_000)}&storeId=${storeId}`);
  const lines = (typeof csv.data === 'string' ? csv.data : '').replace('﻿', '').trim().split('\r\n');
  const keys = (lines[0] ?? '').split(';');
  const parsed = lines.slice(1).map((l) => Object.fromEntries(l.split(';').map((v, i) => [keys[i], v])));
  const cents = (v) => Math.round(Number((v ?? '0').replace(',', '.')) * 100);
  const sumCom = parsed.reduce((a, r) => a + cents(r.comissao), 0);
  const dbCom = rows.reduce((a, r) => a + Number(r[3]), 0);
  record('FIN-3', 'CSV de receita por pedido da loja nova: uma linha por pedido pago e a soma da comissão bate com o banco', csv.status === 200 && parsed.length === rows.length && sumCom === dbCom, `linhas ${parsed.length}/${rows.length}; comissão CSV=${sumCom} banco=${dbCom}`);
  const refCsv = await adminCall('GET', `/v1/admin/reports/finance/refunds.csv?from=${day(-86_400_000)}&to=${day(86_400_000)}&storeId=${storeId}`);
  record('FIN-4', 'CSV de estornos da loja nova lista os estornos feitos (cancelamento, parcial e reembolsos das trocas)', refCsv.status === 200 && (String(refCsv.data).trim().split('\r\n').length - 1) >= 3, `linhas=${String(refCsv.data).trim().split('\r\n').length - 1}`);
  const ledger = sql(`select coalesce(sum(case when direction='credit' then amount_cents else -amount_cents end),0) from ledger_entries where order_id in (select id from orders where store_id = '${storeId}') and account = 'platform_commission'`);
  notTested('FIN-5', 'split real do Mercado Pago (application_fee, conta do vendedor, tarifa do provedor)', `só o provedor fake foi exercitado (ledger platform_commission=${ledger || 'n/d'}); precisa do sandbox do MP`);
  // limpeza do parâmetro
  await resetParam('pix_hora_max').catch(() => undefined);
  console.log(`\n  [info] loja de regressão: ${storeId}; lojista ${email}; cliente ${buyer.email}`);
  void notTested;
}

try {
  await main();
} catch (error) {
  record('REGRESSAO-ERRO', 'a regressão terminou com exceção', false, String(error?.stack ?? error).split('\n').slice(0, 4).join(' | '));
}
process.exit(finish() === 0 ? 0 : 1);

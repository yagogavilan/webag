#!/usr/bin/env node
// Teste exploratório da invalidação da vitrine (DEC-113/116, SEC-201, DT-087) contra a API REAL compilada, com os caches LIGADOS nos TTLs de produção
// (FEED_DIRECTORY_TTL_SECONDS=15, HOME_SECTIONS_TTL_SECONDS=60, BROWSE_CACHE_TTL_SECONDS=10). Relógio REAL (o e2e usa relógio falso: aqui o tempo conta de verdade).
// Mede, em milissegundos, do retorno da escrita até a vitrine refletir (consulta a cada 200 ms, sem cache de cliente), em 4 superfícies: home, vitrine da loja,
// página do produto/loja e busca. Limite da DEC-113: 5 s. Também mostra o contraponto: escrita DIRETA no banco (nenhum serviço viu) segue o TTL.
// Uso: API_URL=http://127.0.0.1:3400 QA_TOTP_FILE=/caminho/totp.txt node docs/qa/performance/invalidacao-vitrine.mjs   (mesmo ambiente de docs/qa/retestes/lib.mjs)
import { adminCall, api, API, cartOf, finish, LAT, LNG, newCustomer, record, sleep, sql, store } from '../retestes/lib.mjs';

const LIMIT_MS = 5000;
const Q = `lat=${LAT}&lng=${LNG}`;
const s = await store();
const read = async (path) => {
  const r = await api('GET', path);
  return { status: r.status, text: JSON.stringify(r.data) };
};
const surfaces = (productId, productName) => ({
  home: async () => (await read(`/v1/home?${Q}&mode=delivery`)).text.includes(productId) ? 'present' : 'absent',
  vitrine: async () => (await read(`/v1/browse/stores/${s.id}/products?limit=50`)).text.includes(productId) ? 'present' : 'absent',
  // A página por id continua respondendo 200 para produto moderado, mas com `available:false` e `unavailableReason` (comportamento igual com o cache desligado); "ausente" = 404 ou indisponível.
  pagina: async () => {
    const r = await read(`/v1/browse/products/${productId}`);
    return r.status === 200 && !r.text.includes('"available":false') ? 'present' : 'absent';
  },
  busca: async () => (await read(`/v1/search/products?${Q}&q=${encodeURIComponent(productName.split(' ')[0])}&limit=50`)).text.includes(productId) ? 'present' : 'absent',
});
const storeSurfaces = () => ({
  home: async () => (await read(`/v1/home?${Q}&mode=delivery`)).text.includes(s.id) ? 'present' : 'absent',
  vitrine: async () => ((await read(`/v1/browse/stores/${s.id}/products?limit=5`)).status === 200 ? 'present' : 'absent'),
  pagina: async () => ((await read(`/v1/browse/stores/${s.id}`)).status === 200 ? 'present' : 'absent'),
  busca: async () => (await read(`/v1/search/stores?${Q}`)).text.includes(s.id) ? 'present' : 'absent',
});
/** Espera cada superfície chegar ao estado `want`; devolve ms por superfície (null = não chegou em 12 s). */
async function until(probes, want, since) {
  const out = {};
  const pending = new Set(Object.keys(probes));
  while (pending.size > 0 && Date.now() - since < 12_000) {
    for (const name of [...pending]) {
      if ((await probes[name]()) === want) {
        out[name] = Date.now() - since;
        pending.delete(name);
      }
    }
    if (pending.size > 0) await sleep(200);
  }
  for (const name of pending) out[name] = null;
  return out;
}
const fmt = (o) => Object.entries(o).map(([k, v]) => `${k}=${v === null ? '>12s' : `${v}ms`}`).join(' ');
const within = (o, only) => Object.entries(o).every(([k, v]) => (only && !only.includes(k)) || (v !== null && v <= LIMIT_MS));
const warm = async (probes, times = 3) => {
  for (let i = 0; i < times; i++) for (const p of Object.values(probes)) await p();
};

// ------------------------------------------------------------------ escolhe o produto presente no máximo de superfícies com o cache quente
const list = (await api('GET', `/v1/browse/stores/${s.id}/products?limit=30`)).data.data;
let best = null;
for (const p of list.slice(0, 12)) {
  const probes = surfaces(p.id, p.name);
  const seen = {};
  for (const [k, f] of Object.entries(probes)) seen[k] = await f();
  const n = Object.values(seen).filter((v) => v === 'present').length;
  if (!best || n > best.n) best = { p, n, seen };
}
console.log(`  [info] produto escolhido: "${best.p.name}", presente em ${best.n}/4 superfícies: ${JSON.stringify(best.seen)}`);
const productId = best.p.id;
const variantId = (await api('GET', `/v1/browse/products/${productId}`)).data?.variants?.[0]?.id;
const buyer = await newCustomer();
const present = Object.entries(best.seen).filter(([, v]) => v === 'present').map(([k]) => k);

// ------------------------------------------------------------------ E1: moderação remove o produto
{
  const probes = surfaces(productId, best.p.name);
  await warm(probes);
  const t0 = Date.now();
  const r = await adminCall('POST', `/v1/admin/products/${productId}/moderation`, { action: 'remove', reason: 'Reteste QA do desempenho: remoção de teste' });
  const t1 = Date.now();
  const got = await until(probes, 'absent', t1);
  record('E1', `moderação REMOVE o produto com tudo quente: some de ${present.join(', ')} em até 5 s`, r.status === 200 && within(got, present), `HTTP ${r.status} em ${t1 - t0} ms; ${fmt(got)}`);
  const add = await cartOf(buyer, 'pickup', undefined, { variantId, quantity: 1 });
  record('E1b', 'com o produto removido a sacola recusa (checkout lê o banco)', add.put.status !== 200, `HTTP ${add.put.status} ${add.put.data?.code ?? ''}`);
  const detail = (await api('GET', `/v1/browse/products/${productId}`)).data;
  record('E1d', 'INFORMATIVO: a página por id de produto REMOVIDO segue respondendo 200 com available=false (igual com o cache desligado); descrição e fotos ainda vêm no corpo?', null, `available=${detail?.available} motivo=${detail?.unavailableReason} descricao=${Boolean(detail?.description)} fotos=${Object.keys(detail?.images?.[0]?.urls ?? detail?.image?.urls ?? {}).length}`);
  const back = Date.now();
  const rr = await adminCall('POST', `/v1/admin/products/${productId}/moderation`, { action: 'restore' });
  const got2 = await until(probes, 'present', back);
  record('E1c', 'moderação RESTAURA: volta a aparecer em até 5 s', rr.status === 200 && within(got2, present), `HTTP ${rr.status}; ${fmt(got2)}`);
}

// ------------------------------------------------------------------ E2: moderação PAUSA o produto
{
  const probes = surfaces(productId, best.p.name);
  await warm(probes);
  const r = await adminCall('POST', `/v1/admin/products/${productId}/moderation`, { action: 'pause', reason: 'Reteste QA do desempenho: pausa de teste' });
  const t1 = Date.now();
  const got = await until(probes, 'absent', t1);
  record('E2', `moderação PAUSA o produto: some de ${present.join(', ')} em até 5 s`, r.status === 200 && within(got, present), `HTTP ${r.status}; ${fmt(got)}`);
  const back = Date.now();
  await adminCall('POST', `/v1/admin/products/${productId}/moderation`, { action: 'restore' });
  const got2 = await until(probes, 'present', back);
  record('E2b', 'restaurar depois da pausa: volta em até 5 s', within(got2, present), fmt(got2));
}

// ------------------------------------------------------------------ E3: loja SUSPENSA e reativada
{
  const probes = storeSurfaces();
  const seen = {};
  for (const [k, f] of Object.entries(probes)) seen[k] = await f();
  await warm(probes);
  const on = Object.entries(seen).filter(([, v]) => v === 'present').map(([k]) => k);
  const r = await adminCall('POST', `/v1/admin/stores/${s.id}/suspend`, { reason: 'Reteste QA do desempenho: suspensão de teste' });
  const t1 = Date.now();
  const got = await until(probes, 'absent', t1);
  record('E3', `loja SUSPENSA com tudo quente: some de ${on.join(', ')} em até 5 s`, r.status === 200 && within(got, on), `HTTP ${r.status}; ${fmt(got)}`);
  const add = await cartOf(buyer, 'pickup', undefined, { variantId, quantity: 1 });
  record('E3c', 'sacola recusa item de loja suspensa', add.put.status !== 200, `HTTP ${add.put.status} ${add.put.data?.code ?? ''}`);
  const back = Date.now();
  const rr = await adminCall('POST', `/v1/admin/stores/${s.id}/reactivate`, { reason: 'Reteste QA do desempenho: reativar loja de teste' });
  const got2 = await until(probes, 'present', back);
  record('E3d', 'loja REATIVADA: volta em até 5 s', rr.status === 200 && within(got2, on), `HTTP ${rr.status}; ${fmt(got2)}`);
}

// ------------------------------------------------------------------ E6: produto das seções "ofertas" e "mais vendidos" da home (cache de 60 s + posição de 30 s) removido pela moderação
for (const section of ['offers', 'bestSellers']) {
  const home = async () => (await api('GET', `/v1/home?${Q}&mode=delivery`)).data;
  await home();
  const target = (await home())?.[section]?.[0];
  if (!target) {
    record(`E6-${section}`, `home tem item em ${section}`, null, 'NÃO TESTADO: seção vazia neste banco');
    continue;
  }
  const probe = { home: async () => (JSON.stringify(await home()).includes(target.id) ? 'present' : 'absent') };
  await warm(probe, 4);
  const r = await adminCall('POST', `/v1/admin/products/${target.id}/moderation`, { action: 'remove', reason: 'Reteste QA do desempenho: remoção de item da home' });
  const got = await until(probe, 'absent', Date.now());
  record(`E6-${section}`, `produto de "${section}" removido pela moderação some da home em até 5 s (cache da seção é de 60 s)`, r.status === 200 && within(got), `HTTP ${r.status}; ${fmt(got)}`);
  await adminCall('POST', `/v1/admin/products/${target.id}/moderation`, { action: 'restore' });
}

// ------------------------------------------------------------------ E7: corrida (concorrência). 10 leitores martelam home e página enquanto a moderação acontece:
// NENHUMA resposta de requisição INICIADA depois do retorno da moderação pode ainda conter o produto (a API só responde depois de apagar os caches).
{
  const home = async () => (await api('GET', `/v1/home?${Q}&mode=delivery`)).data;
  const target = (await home())?.offers?.[0];
  if (!target) {
    record('E7', 'corrida entre leitura e moderação', null, 'NÃO TESTADO: home sem ofertas neste banco');
  } else {
    let removedAt = null;
    let stop = false;
    const seen = { before: 0, after: 0, afterWithProduct: 0 };
    const reader = async () => {
      while (!stop) {
        const started = Date.now();
        const inHome = JSON.stringify(await home()).includes(target.id);
        const page = (await api('GET', `/v1/browse/products/${target.id}`)).data;
        const inPage = page?.available !== false;
        if (removedAt !== null && started > removedAt) {
          seen.after += 1;
          if (inHome || inPage) seen.afterWithProduct += 1;
        } else seen.before += 1;
      }
    };
    const readers = Array.from({ length: 10 }, reader);
    await sleep(1500);
    const r = await adminCall('POST', `/v1/admin/products/${target.id}/moderation`, { action: 'remove', reason: 'Reteste QA do desempenho: corrida com leitores' });
    removedAt = Date.now();
    await sleep(4000);
    stop = true;
    await Promise.all(readers);
    await adminCall('POST', `/v1/admin/products/${target.id}/moderation`, { action: 'restore' });
    record('E7', 'corrida: leitores concorrentes antes e depois da moderação; nenhuma resposta iniciada após o retorno traz o produto retirado', r.status === 200 && seen.after > 20 && seen.afterWithProduct === 0, `HTTP ${r.status}; leituras antes=${seen.before} depois=${seen.after} com o produto depois=${seen.afterWithProduct}`);
  }
}

// ------------------------------------------------------------------ E4: lojista muda o preço pela API (comercial: DEC-113 diz 5 s para página e vitrine)
{
  const priceOf = async () => (await api('GET', `/v1/browse/products/${productId}`)).data?.price?.amount;
  const vitrinePrice = async () => (await api('GET', `/v1/browse/stores/${s.id}/products?limit=50`)).data?.data?.find((p) => p.id === productId)?.price?.amount;
  const before = await priceOf();
  for (let i = 0; i < 3; i++) { await priceOf(); await vitrinePrice(); }
  const next = before + 111;
  const t0 = Date.now();
  const r = await api('PATCH', `/v1/stores/${s.id}/products/${productId}`, { token: s.owner, body: { basePriceCents: next } });
  const t1 = Date.now();
  let page = null;
  let vit = null;
  while (Date.now() - t1 < 12_000 && (page === null || vit === null)) {
    if (page === null && (await priceOf()) === next) page = Date.now() - t1;
    if (vit === null && (await vitrinePrice()) === next) vit = Date.now() - t1;
    await sleep(200);
  }
  record('E4', 'lojista altera o preço pela API: página e vitrine mostram o novo em até 5 s', r.status === 200 && page !== null && vit !== null && page <= LIMIT_MS && vit <= LIMIT_MS, `HTTP ${r.status} em ${t1 - t0} ms; página=${page}ms vitrine=${vit}ms`);
  await api('PATCH', `/v1/stores/${s.id}/products/${productId}`, { token: s.owner, body: { basePriceCents: before } });
}

// ------------------------------------------------------------------ E5: contraponto, escrita DIRETA no banco (nenhum serviço viu) segue o TTL de 10 s
{
  const priceOf = async () => (await api('GET', `/v1/browse/products/${productId}`)).data?.price?.amount;
  const before = await priceOf();
  await priceOf();
  const next = before + 222;
  sql(`update products set base_price_cents = ${next}, updated_at = now() where id = '${productId}'`);
  const t1 = Date.now();
  let seen = null;
  while (Date.now() - t1 < 15_000 && seen === null) {
    if ((await priceOf()) === next) seen = Date.now() - t1;
    await sleep(200);
  }
  record('E5', 'INFORMATIVO: escrita direta no banco aparece só pelo TTL (10 s, tolerância 11 s), como documentado; nenhuma rota do produto faz isso', seen !== null && seen <= 11_000, `apareceu em ${seen} ms`);
  sql(`update products set base_price_cents = ${before}, updated_at = now() where id = '${productId}'`);
}

// ------------------------------------------------------------------ E8: 2ª réplica REAL (outro processo, mesmo banco e mesmo Redis): a invalidação chega pelo pub/sub (ADR-017)
if (process.env.API_REPLICA) {
  const replica = process.env.API_REPLICA.replace(/\/+$/, '');
  const readR = async (path) => {
    const r = await fetch(replica + path, { headers: { 'x-forwarded-for': '10.7.7.7' } });
    return { status: r.status, text: await r.text() };
  };
  const probes = {
    vitrine: async () => ((await readR(`/v1/browse/stores/${s.id}/products?limit=50`)).text.includes(productId) ? 'present' : 'absent'),
    pagina: async () => {
      const r = await readR(`/v1/browse/products/${productId}`);
      return r.status === 200 && !r.text.includes('"available":false') ? 'present' : 'absent';
    },
    busca: async () => ((await readR(`/v1/search/products?${Q}&q=${encodeURIComponent(best.p.name.split(' ')[0])}&limit=50`)).text.includes(productId) ? 'present' : 'absent'),
  };
  await warm(probes, 3);
  const r = await adminCall('POST', `/v1/admin/products/${productId}/moderation`, { action: 'remove', reason: 'Reteste QA do desempenho: remoção vista pela 2ª réplica' });
  const got = await until(probes, 'absent', Date.now());
  record('E8', 'moderação feita na réplica 1 some da vitrine, página e busca da réplica 2 (cache quente) em até 5 s', r.status === 200 && within(got), `HTTP ${r.status}; réplica 2: ${fmt(got)}`);
  await adminCall('POST', `/v1/admin/products/${productId}/moderation`, { action: 'restore' });
  const back = await until(probes, 'present', Date.now());
  record('E8b', 'restaurar volta a aparecer na réplica 2 em até 5 s', within(back), fmt(back));
}

// ------------------------------------------------------------------ E9: equivalência com o cache DESLIGADO (outra réplica com TTL 0, mesmo banco): mesmas respostas depois de cada escrita
// Preço e estoque (mudança comercial): página, vitrine, página da loja e busca; a home segue o TTL de propósito (DEC-113), por isso não entra.
// Moderação e suspensão (retirada): home entra também. Corpo comparado sem `eta.fromAt/toAt` (agora + minutos).
if (process.env.API_CACHE_OFF) {
  const off = process.env.API_CACHE_OFF.replace(/\/+$/, '');
  const norm = (text) => text.replace(/"(fromAt|toAt)":"[^"]*"/g, '"$1":"~"');
  const fetchBoth = async (path) => {
    const [a, b] = await Promise.all([off, API].map(async (host) => {
      const r = await fetch(host + path, { headers: { 'x-forwarded-for': '10.6.6.6' } });
      return `${r.status} ${norm(await r.text())}`;
    }));
    return a === b ? null : path.replace(/lat=[^&]+&lng=[^&]+/, 'lat,lng');
  };
  // ATENÇÃO ao desenho: a API "desligada" (TTL 0) NÃO recebe a invalidação da outra (outro banco lógico do Redis, não é réplica) e mantém o cache de 30 s da posição
  // no Redis (home e busca: não há como desligá-lo). Por isso, na SUSPENSÃO da loja (que entra na home e na busca), só páginas lidas direto do banco são comparáveis;
  // home e busca da suspensão foram provadas à parte (E3 e E8) e a convergência da API desligada em 30 s foi conferida por sonda manual (ver relatório).
  const paths = (withHome, onlyDirect = false) => [
    `/v1/browse/products/${productId}`,
    `/v1/browse/stores/${s.id}/products?limit=50`,
    `/v1/browse/stores/${s.id}?${Q}`,
    ...(onlyDirect ? [] : [`/v1/search/products?${Q}&q=${encodeURIComponent(best.p.name.split(' ')[0])}&limit=50`]),
    ...(withHome && !onlyDirect ? [`/v1/home?${Q}&mode=delivery`] : []),
  ];
  const compare = async (id, title, withHome, onlyDirect = false) => {
    await sleep(400);
    const list = paths(withHome, onlyDirect);
    const diffs = (await Promise.all(list.map(fetchBoth))).filter(Boolean);
    record(id, title, diffs.length === 0, diffs.length === 0 ? `${list.length} URLs idênticas` : `diferentes: ${diffs.join(', ')}`);
  };
  const variant = (await api('GET', `/v1/browse/products/${productId}`)).data?.variants?.[0];
  const priceNow = (await api('GET', `/v1/browse/products/${productId}`)).data?.price?.amount;
  for (const p of paths(false)) await fetch(API + p); // esquenta o cache ligado
  await api('PATCH', `/v1/stores/${s.id}/products/${productId}`, { token: s.owner, body: { basePriceCents: priceNow + 333 } });
  await compare('E9a', 'preço alterado: cache ligado = cache desligado', false);
  const stockBefore = sql(`select stock from product_variants where id = '${variant.id}'`);
  await api('POST', `/v1/stores/${s.id}/products/${productId}/variants/${variant.id}/stock`, { token: s.owner, body: { set: 0 } });
  await compare('E9b', 'estoque zerado pelo lojista: cache ligado = cache desligado', false);
  await api('POST', `/v1/stores/${s.id}/products/${productId}/variants/${variant.id}/stock`, { token: s.owner, body: { set: Number(stockBefore) } });
  await api('PATCH', `/v1/stores/${s.id}/products/${productId}`, { token: s.owner, body: { basePriceCents: priceNow } });
  await compare('E9c', 'preço e estoque restaurados: cache ligado = cache desligado', false);
  await adminCall('POST', `/v1/admin/products/${productId}/moderation`, { action: 'remove', reason: 'Reteste QA do desempenho: equivalência' });
  await compare('E9d', 'produto removido pela moderação: cache ligado = cache desligado (inclui a home)', true);
  await adminCall('POST', `/v1/admin/products/${productId}/moderation`, { action: 'restore' });
  await compare('E9e', 'produto restaurado: cache ligado = cache desligado (inclui a home)', true);
  await adminCall('POST', `/v1/admin/stores/${s.id}/suspend`, { reason: 'Reteste QA do desempenho: equivalência' });
  await compare('E9f', 'loja suspensa: páginas da loja e do produto com cache ligado = cache desligado (home e busca: ver nota acima)', false, true);
  await adminCall('POST', `/v1/admin/stores/${s.id}/reactivate`, { reason: 'Reteste QA do desempenho: equivalência' });
  await compare('E9g', 'loja reativada: páginas com cache ligado = cache desligado', false, true);
}

finish();

#!/usr/bin/env node
// Gera os screenshots finais de todas as telas (brief §8: "Capturas de todas as telas em docs/telas/") com a API REAL local e o seed
// de demonstração. Tudo em viewport (não fullPage), sem dados reais (só o que o seed cria). Índice gerado em docs/telas/README.md.
//
//   node scripts/capture-screens.mjs                 # tudo (app, lojista, admin e site)
//   ONLY=app,site node scripts/capture-screens.mjs   # só algumas áreas (não reescreve o README)
//
// Pré-requisitos (README da raiz): `pnpm run setup` (infra, migrações e seed) e a API no ar (`pnpm dev` ou `pnpm --filter @webag/api start`).
// O script sobe sozinho o que faltar: o site/painéis (`next build` + `next start`) e o app em versão web (`expo export`,
// servido por um servidor estático local), e encerra o que subiu. Para usar o que já está rodando, informe APP_URL e/ou WEB_URL.
//
// Variáveis: API_URL (http://localhost:3000), WEB_URL (sobe em :3101), APP_URL (sobe em :8081), REAL_DB_URL (ajuste dos pedidos de
// demonstração: atrasado e dentro do prazo; só em banco local), SEED_PASSWORD, ADMIN_EMAIL/ADMIN_PASSWORD, OUT_DIR (docs/telas),
// ONLY (app,lojista,admin,site), PW_CHANNEL=chrome (usa o Chrome instalado se o Chromium do Playwright não existir), REUSE_APP_BUILD=1 e REUSE_WEB_BUILD=1 (não refazem o build do app web e do site).
// Efeito colateral temporário (banco local, dados fictícios; desfeito ao terminar): faixa de entrega de 2 pedidos do seed, data de entrega de 1 pedido,
// 1 cupom pessoal, o estado de 1 loja e o horário de outra. O script cria (uma vez) 2 clientes de demonstração `telas.compra@` e `telas.exclusao@` (como o `pnpm smoke`).
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = join(ROOT, 'apps/web');
const MOBILE_DIR = join(ROOT, 'apps/mobile');
const OUT = resolve(process.env.OUT_DIR ?? join(ROOT, 'docs/telas'));
const API = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const WEB_PORT = Number(process.env.REAL_WEB_PORT ?? 3101);
const APP_PORT = Number(process.env.APP_PORT ?? 8081);
let WEB = (process.env.WEB_URL ?? '').replace(/\/+$/, '');
let APP = (process.env.APP_URL ?? '').replace(/\/+$/, '');
const DB = process.env.REAL_DB_URL ?? 'postgresql://webag:webag_dev_only@localhost:5432/webag';
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'webag-seed-lojista-2026';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@webag.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Webag-Admin-Dev-2026';
const CUSTOMER = 'cliente.ana@seed.webag.local';
const MERCHANT = 'lojista.mercadinho-boa-compra@seed.webag.local';
const ONLY = new Set((process.env.ONLY ?? 'app,lojista,admin,site').split(',').map((s) => s.trim()).filter(Boolean));
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1440, height: 900 };

const log = (msg) => console.log(`[telas] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wrap = (s) => `"${s}"`;

// ------------------------------------------------------------------------------------------------ catálogo (ordem = numeração)

/** area: app | lojista | admin | site. `views`: perfis de viewport. O número do arquivo vem da posição aqui (estável com ONLY). */
const CATALOG = [
  // app do cliente, 390x844
  ['app', 'inicio', 'Início', 'Cliente', 'Lojas perto do cliente, categorias e ofertas, com o ponto de entrega escolhido.'],
  ['app', 'busca', 'Busca', 'Cliente', 'Aba Buscar com o campo, o histórico e as categorias.'],
  ['app', 'resultados', 'Resultados da busca', 'Cliente', 'Lista de lojas e produtos para um termo, com filtros e ordenação.'],
  ['app', 'loja', 'Loja', 'Cliente', 'Capa, horário, nota, destaques e produtos da loja.'],
  ['app', 'produto', 'Produto', 'Cliente', 'Fotos, preço, opções (tamanho e cor) e o botão de adicionar à sacola.'],
  ['app', 'sacola', 'Sacola', 'Cliente', 'Itens, quantidades e total, com o botão para ir ao pagamento.'],
  ['app', 'checkout-pix', 'Checkout com PIX', 'Cliente', 'Entrega, endereço, resumo do pedido e PIX escolhido como forma de pagamento.'],
  ['app', 'checkout-cartao', 'Checkout com cartão', 'Cliente', 'Mesmo resumo com cartão: o cartão é digitado na página segura do Mercado Pago, nunca no app.'],
  ['app', 'pix', 'PIX gerado', 'Cliente', 'Valor, contagem regressiva do PIX e código copia e cola; a tela muda sozinha quando o servidor confirma o pagamento.'],
  ['app', 'pedido-confirmado', 'Pedido confirmado', 'Cliente', 'Número do pedido e o que acontece em seguida, depois do pagamento aprovado.'],
  ['app', 'acompanhamento', 'Acompanhamento do pedido', 'Cliente', 'Linha do tempo de um pedido a caminho, dentro da faixa de entrega prometida.'],
  ['app', 'acompanhamento-atrasado', 'Acompanhamento com atraso', 'Cliente', 'Pedido fora da faixa de entrega: aviso de atraso e as opções de esperar ou pedir o cancelamento.'],
  ['app', 'pedidos', 'Meus pedidos', 'Cliente', 'Pedidos em andamento e anteriores.'],
  ['app', 'troca', 'Pedir troca', 'Cliente', 'Pedido de troca ou devolução de um pedido entregue, com motivo, prazo e como devolver.'],
  ['app', 'conta', 'Conta', 'Cliente', 'Menu da conta: endereços, cupons, favoritos, trocas, privacidade e ajuda.'],
  ['app', 'cupons', 'Meus cupons', 'Cliente', 'Cupons disponíveis para o cliente.'],
  ['app', 'licencas', 'Licenças de código aberto', 'Cliente', 'Bibliotecas de terceiros usadas no app e as licenças.'],
  ['app', 'exclusao-de-conta', 'Exclusão de conta', 'Cliente', 'Prazo, o que é apagado, impedimentos (pedidos em aberto) e a confirmação com senha.'],
  // painel do lojista
  ['lojista', 'inicio', 'Início do lojista', 'Lojista (dono)', 'Resumo do dia: pedidos, vendas, avaliação e mais vendidos com "Você recebe".'],
  ['lojista', 'pedidos-novos', 'Pedidos novos', 'Lojista (dono)', 'Fila de pedidos por etapa, com o pedido novo aguardando aceite.'],
  ['lojista', 'produtos', 'Produtos', 'Lojista (dono)', 'Lista de produtos com estoque, estado e interruptor de venda.'],
  ['lojista', 'produto-voce-recebe', 'Produto: Você recebe', 'Lojista (dono)', 'Formulário de produto com o valor líquido estimado: preço menos comissão menos a tarifa mais cara do provedor (DEC-074e).'],
  ['lojista', 'trocas', 'Trocas', 'Lojista (dono)', 'Pedidos de troca e devolução dos clientes.'],
  ['lojista', 'avaliacoes', 'Avaliações', 'Lojista (dono)', 'Nota média, distribuição e comentários dos clientes.'],
  ['lojista', 'financeiro', 'Financeiro', 'Lojista (dono)', 'Valores a receber, liberados e extrato.'],
  ['lojista', 'minha-loja', 'Minha loja', 'Lojista (dono)', 'Dados da loja, horários, entrega, trocas e avisos.'],
  ['lojista', 'cadastro', 'Cadastro do lojista', 'Visitante', 'Criação da conta do lojista (primeira etapa do cadastro).'],
  ['lojista', 'revisao', 'Revisão do cadastro da loja', 'Lojista (dono)', 'Última etapa do cadastro: conferir os dados antes de enviar para análise.'],
  // painel admin
  ['admin', 'inicio', 'Início do admin', 'Super admin', 'Pendências: lojas, produtos, trocas, denúncias e alertas.'],
  ['admin', 'alertas', 'Alertas', 'Super admin', 'Alertas operacionais com gravidade e estado.'],
  ['admin', 'usuarios', 'Usuários', 'Super admin', 'Busca e lista de usuários (cliente, lojista e equipe).'],
  ['admin', 'pedidos', 'Pedidos', 'Super admin', 'Todos os pedidos da plataforma, com filtros.'],
  ['admin', 'lojas', 'Lojas', 'Super admin', 'Lojas por estado, incluindo a fila de aprovação.'],
  ['admin', 'loja-aprovacao', 'Loja: detalhe e aprovação', 'Super admin', 'Dados, documentos e a decisão de aprovar, pedir correção ou recusar.'],
  ['admin', 'logistica', 'Logística', 'Super admin', 'Corridas, entregadores e atrasos.'],
  ['admin', 'parametros-entrega', 'Parâmetros de entrega', 'Super admin', 'Raio, faixas de prazo e regras de entrega.'],
  ['admin', 'comissoes', 'Comissões', 'Super admin', 'Comissão padrão, por categoria e por loja.'],
  ['admin', 'relatorios', 'Relatórios', 'Super admin', 'Indicadores e exportações em planilha.'],
  ['admin', 'manutencao', 'Manutenção', 'Super admin', 'Botão de parar a plataforma e o aviso aos usuários.'],
  // site público
  ['site', 'home', 'Home do site', 'Público', 'Página inicial do Webag.'],
  ['site', 'privacidade', 'Política de privacidade', 'Público', 'Texto da política (LGPD).'],
  ['site', 'termos', 'Termos de uso', 'Público', 'Termos de uso do cliente.'],
  ['site', 'exclusao-de-conta', 'Exclusão de conta (site)', 'Público', 'Como pedir a exclusão da conta e dos dados.'],
  ['site', 'licencas', 'Licenças', 'Público', 'Licenças de código aberto usadas pelo Webag.'],
];
const SPEC = new Map(CATALOG.map((row, index) => [`${row[0]}/${row[1]}`, { n: String(index + 1).padStart(2, '0'), area: row[0], slug: row[1], screen: row[2], profile: row[3], shows: row[4] }]));
const taken = new Map(); // arquivo -> viewport
let lastPage = null;
const failed = []; // { key, why }
const problems = [];
const suspects = new Map(); // tela -> texto de erro que apareceu na captura

// ------------------------------------------------------------------------------------------------ playwright e servidores

const requireFromWeb = createRequire(join(WEB_DIR, 'package.json'));
const { chromium } = requireFromWeb('@playwright/test');

const children = [];
let staticServer = null;
function stopAll() {
  for (const child of children) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* já encerrou */
    }
  }
  staticServer?.close();
}
process.on('exit', stopAll);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));

async function up(url, okStatus = (s) => s > 0) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'manual' });
    return okStatus(res.status);
  } catch {
    return false;
  }
}
async function waitUp(url, ms, what) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await up(url)) return;
    await sleep(1000);
  }
  throw new Error(`${what} não respondeu em ${Math.round(ms / 1000)} s (${url})`);
}
function run(command, args, options) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`"${command} ${args.join(' ')}" terminou com código ${result.status}`);
}
function spawnBackground(command, args, options) {
  const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'], detached: true, ...options });
  children.push(child);
  return child;
}

async function ensureApi() {
  if (!(await up(`${API}/v1/health`)) && !(await up(`${API}/health`))) {
    throw new Error(`A API não responde em ${API}. Suba a infraestrutura e a API antes (pnpm run setup e pnpm dev).`);
  }
  log(`API no ar em ${API}`);
}

async function ensureWeb() {
  if (WEB) return;
  WEB = `http://localhost:${WEB_PORT}`;
  if (await up(WEB)) {
    log(`site já no ar em ${WEB}`);
    return;
  }
  if (!process.env.REUSE_WEB_BUILD || !existsSync(join(WEB_DIR, '.next/BUILD_ID'))) {
    log('construindo o site (next build, alguns minutos)');
    run('pnpm', ['build'], { cwd: WEB_DIR, env: { ...process.env, API_URL: API } });
  }
  log(`subindo o site em ${WEB}`);
  const host = `localhost:${WEB_PORT}`;
  spawnBackground('pnpm', ['exec', 'next', 'start', '--port', String(WEB_PORT)], {
    cwd: WEB_DIR,
    env: { ...process.env, API_URL: API, COOKIE_SECURE: 'false', WEBAG_ALLOW_LOCAL_ORIGINS: 'true', ADMIN_HOST: host, LOJISTA_HOST: host, PUBLIC_HOST: host, STORAGE_ORIGIN: process.env.REAL_STORAGE_ORIGIN ?? 'http://localhost:9000' },
  });
  await waitUp(WEB, 120_000, 'o site');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.map': 'application/json' };

async function ensureApp() {
  if (APP) return;
  APP = `http://localhost:${APP_PORT}`;
  if (await up(APP)) {
    log(`app web já no ar em ${APP}`);
    return;
  }
  const dir = join(tmpdir(), 'webag-capture-app-web', createHash('sha1').update(`${API}|${WEB}`).digest('hex').slice(0, 8));
  if (!process.env.REUSE_APP_BUILD || !existsSync(join(dir, 'index.html'))) {
    log('exportando o app para web (expo export, cerca de 1 minuto)');
    rmSync(dir, { recursive: true, force: true });
    run('node', ['--env-file-if-exists=../../.env', './node_modules/expo/bin/cli', 'export', '--platform', 'web', '--output-dir', dir], {
      cwd: MOBILE_DIR,
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, CI: '1', EXPO_PUBLIC_API_URL: API, EXPO_PUBLIC_WEB_URL: WEB },
    });
  }
  staticServer = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(dir, path);
    if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html'); // rotas do Expo Router: sempre o index
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((ok) => staticServer.listen(APP_PORT, ok));
  log(`app web servido em ${APP}`);
}

// ------------------------------------------------------------------------------------------------ banco (só ajuste de dados de demonstração)

function sql(query) {
  return execFileSync('psql', [DB, '-At', '-F', '|', '-c', query], { encoding: 'utf8' }).trim();
}
const DEMO_STORE = 'Farmácia Saúde Já'; // loja usada na compra (vende o dia todo depois do ajuste de horário abaixo)
const REVIEW_STORE = { name: 'Papelaria Ponto Certo', email: 'lojista.papelaria-ponto-certo@seed.webag.local' }; // loja que vira rascunho (revisão do cadastro) e depois "em análise" (aprovação no admin)
const demo = { hasAddress: false, storeId: null, reviewStoreId: null, restore: [] };
const setReviewStore = (status) => demo.reviewStoreId && sql(`update stores set status = '${status}', submitted_at = ${status === 'draft' ? 'null' : 'now()'}, decision_reason = null where id = '${demo.reviewStoreId}'`);

/**
 * Ajusta só dados fictícios do seed, no banco local, e desfaz tudo ao terminar (mesmo com erro):
 * 1 pedido a caminho do cliente Ana dentro do prazo e 1 do cliente Carla atrasado há 40 min, a data de entrega de 1 pedido (troca dentro do prazo),
 * 1 cupom pessoal para a Ana ("Meus cupons"), o estado de 1 loja com 3 documentos fictícios (rascunho, depois "em análise", para a revisão do cadastro e a aprovação no admin) e o horário da loja da compra (aberta o dia todo, para a captura não depender da hora em que o script roda).
 */
function prepareDemoData() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(DB)) {
    log('REAL_DB_URL não é local: pulando o ajuste dos dados de demonstração');
    return;
  }
  try {
    const orders = sql(`select number, eta_from_at, eta_to_at, late_notified_at, delivered_at from orders where number in ('WB-DM036','WB-DM056','WB-DM018')`);
    const quote = (v) => (v ? `'${v}'` : 'null');
    for (const line of orders.split('\n').filter(Boolean)) {
      const [number, from, to, late, delivered] = line.split('|');
      demo.restore.push(`update orders set eta_from_at = ${quote(from)}, eta_to_at = ${quote(to)}, late_notified_at = ${quote(late)}, delivered_at = ${quote(delivered)} where number = '${number}'`);
      demo.restore.push(`update deliveries set eta_to_at = ${quote(to)} where order_id = (select id from orders where number = '${number}')`);
    }
    const eta = (number, from, to) => {
      sql(`update orders set eta_from_at = now() + interval '${from} minutes', eta_to_at = now() + interval '${to} minutes', late_notified_at = null where number = '${number}'`);
      sql(`update deliveries set eta_to_at = now() + interval '${to} minutes' where order_id = (select id from orders where number = '${number}')`);
    };
    eta('WB-DM036', 10, 35);
    eta('WB-DM056', -100, -40);
    sql(`update orders set delivered_at = now() - interval '2 days' where number = 'WB-DM018'`);
    sql(`insert into coupons (code, kind, scope, value, starts_at, ends_at, max_uses, per_customer_limit, owner_user_id, source_order_id)
         select 'ATRASODEMO1', 'free_shipping', 'platform', 0, now() - interval '1 day', now() + interval '29 days', 1, 1, u.id, (select id from orders where number = 'WB-DM018')
         from users u where u.email = '${CUSTOMER}' and not exists (select 1 from coupons where code = 'ATRASODEMO1')`);
    demo.restore.push(`delete from coupons where code = 'ATRASODEMO1'`);
    demo.storeId = sql(`select id from stores where name = '${DEMO_STORE}'`) || null;
    if (demo.storeId) {
      for (const row of sql(`select id, start_min, end_min from store_hours where store_id = '${demo.storeId}'`).split('\n').filter(Boolean)) {
        const [id, start, end] = row.split('|');
        demo.restore.push(`update store_hours set start_min = ${start}, end_min = ${end} where id = '${id}'`);
      }
      sql(`update store_hours set start_min = 0, end_min = 1439 where store_id = '${demo.storeId}'`);
    }
    demo.reviewStoreId = sql(`select id from stores where name = '${REVIEW_STORE.name}'`) || null;
    if (demo.reviewStoreId) {
      const [status, submitted, reason] = sql(`select status, coalesce(submitted_at::text, ''), coalesce(decision_reason, '') from stores where id = '${demo.reviewStoreId}'`).split('|');
      demo.restore.push(`update stores set status = '${status}', submitted_at = ${submitted ? `'${submitted}'` : 'null'}, decision_reason = ${reason ? `'${reason.replace(/'/g, "''")}'` : 'null'} where id = '${demo.reviewStoreId}'`);
    }
    if (demo.reviewStoreId) {
      // 3 documentos fictícios (sem arquivo no armazenamento) para a revisão do cadastro ficar completa; removidos ao terminar
      const owner = sql(`select id from users where email = '${REVIEW_STORE.email}'`);
      if (owner && !sql(`select 1 from store_documents where store_id = '${demo.reviewStoreId}' limit 1`)) {
        for (const kind of ['id_front', 'id_back', 'address_proof']) {
          sql(`with asset as (insert into media_assets (owner_user_id, store_id, purpose, status, object_key, declared_content_type, declared_size_bytes, content_type, size_bytes, completed_at, expires_at)
               values ('${owner}', '${demo.reviewStoreId}', 'store_document', 'ready', 'telas-demo/${kind}.png', 'image/png', 1000, 'image/png', 1000, now(), now() + interval '1 day') returning id)
               insert into store_documents (store_id, kind, asset_id, uploaded_by) select '${demo.reviewStoreId}', '${kind}', id, '${owner}' from asset`);
        }
        demo.restore.unshift(`delete from store_documents where store_id = '${demo.reviewStoreId}' and asset_id in (select id from media_assets where object_key like 'telas-demo/%')`, `delete from media_assets where object_key like 'telas-demo/%'`);
      }
    }
    log('dados de demonstração ajustados (serão restaurados ao terminar)');
  } catch (e) {
    log(`sem acesso ao banco (${String(e.message).split('\n')[0]}): atraso, troca e horário da loja podem sair diferentes`);
  }
}
function restoreDemoData() {
  for (const query of demo.restore.splice(0)) {
    try {
      sql(query);
    } catch {
      /* melhor esforço */
    }
  }
}
process.on('exit', restoreDemoData);

/** Aprova o PIX pendente do cliente pela rota de simulação da API (`pnpm pagar` faz o mesmo para o último pedido). */
async function approvePix(email) {
  const attempt = sql(`select a.id from payment_attempts a join orders o on o.id::text = a.external_reference join users u on u.id = o.user_id where u.email = '${email}' and a.status = 'pending' and a.provider = 'fake' order by a.created_at desc limit 1`);
  if (!attempt) throw new Error('nenhum PIX pendente do cliente novo no banco');
  const login = await (await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: SEED_PASSWORD }) })).json();
  const res = await fetch(`${API}/v1/dev/payments/${attempt}/approve`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${login.tokens?.accessToken}` }, body: '{}' });
  if (!res.ok) throw new Error(`simulação de pagamento: HTTP ${res.status} (a API precisa de PAYMENT_PROVIDER=fake e NODE_ENV=development)`);
}

/** Ids dos pedidos do cliente Ana pelo número (a lista do app mostra a loja, não o número). */
async function ordersOf(email, password) {
  const login = await (await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  const token = login.tokens?.accessToken;
  if (!token) throw new Error(`login de ${email} falhou`);
  const found = new Map();
  let cursor = '';
  for (let i = 0; i < 6; i++) {
    const res = await (await fetch(`${API}/v1/orders?limit=50${cursor}`, { headers: { authorization: `Bearer ${token}` } })).json();
    for (const o of res.data ?? []) found.set(o.number, o.id);
    if (!res.nextCursor) break;
    cursor = `&cursor=${encodeURIComponent(res.nextCursor)}`;
  }
  return found;
}

// ------------------------------------------------------------------------------------------------ captura

async function snap(page, key, view) {
  const spec = SPEC.get(key);
  if (!spec) throw new Error(`tela fora do catálogo: ${key}`);
  const suffix = view === 'phone' && spec.area !== 'app' ? '-mobile' : view === 'desk' ? '-desktop' : '';
  const file = `${spec.n}-${spec.area}-${spec.slug}${suffix}.png`;
  await page.waitForTimeout(900); // imagens, fontes e animações de entrada
  await page.screenshot({ path: join(OUT, file), fullPage: false });
  taken.set(file, { key, view });
  log(`ok ${file}`);
}

/** Tenta uma captura; em falha, guarda o motivo e uma imagem de diagnóstico (FALHA-*.png) fora de docs/telas, e segue. */
async function attempt(page, key, fn) {
  try {
    await fn();
  } catch (e) {
    const why = String(e.message).split('\n')[0].slice(0, 200);
    failed.push({ key, why });
    console.error(`[telas] FALHA ${key}: ${why}`);
    mkdirSync(join(tmpdir(), 'webag-capture-fail'), { recursive: true });
    await page.screenshot({ path: join(tmpdir(), 'webag-capture-fail', `${key.replace('/', '-')}.png`) }).catch(() => undefined);
  }
}

function watch(page, label) {
  page.on('pageerror', (e) => problems.push(`${label} pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', async (r) => {
    if (r.status() < 500) return;
    const body = (await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
    problems.push(`${label} http ${r.status()}: ${r.request().method()} ${r.url().slice(0, 140)} ${body}`);
  });
}

async function launch() {
  try {
    return await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
  } catch (e) {
    if (process.env.PW_CHANNEL) throw e;
    log('Chromium do Playwright indisponível; tentando o Chrome instalado (channel chrome)');
    return chromium.launch({ channel: 'chrome' });
  }
}

const tid = (id) => `[data-testid="${id}"]`;
const vis = (page, id, timeout = 60_000) => page.locator(`${tid(id)}:visible`).first().waitFor({ timeout });
async function tap(page, id, timeout = 60_000) {
  const el = page.locator(`${tid(id)}:visible`).first();
  await el.waitFor({ timeout });
  await el.click({ timeout });
}
/** Navegação do Expo Router sem recarregar (a sessão do app web vive só na memória da aba). */
async function appGo(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, '', p);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

// ------------------------------------------------------------------------------------------------ app do cliente (390x844)

async function appSession(browser) {
  const context = await browser.newContext({ viewport: PHONE, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  lastPage = page;
  watch(page, 'app');
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  // ponto de entrega: primeira cidade e "qualquer bairro"
  await tap(page, 'location.choose-city', 120_000);
  await page.waitForSelector('[data-testid^="location.city-"]', { timeout: 30_000 });
  const morato = page.locator('[data-testid^="location.city-"]').filter({ hasText: 'Francisco Morato' });
  await (((await morato.count()) ? morato : page.locator('[data-testid^="location.city-"]')).first()).click();
  await page.waitForSelector(tid('location.neighborhood-any'), { timeout: 20_000 });
  await page.click(tid('location.neighborhood-any'));
  await vis(page, 'home.screen', 90_000);
  await page.locator('[data-testid^="home.store-"]:visible').first().waitFor({ timeout: 90_000 });
  return { context, page };
}

async function appLogin(page, email, password) {
  await tap(page, 'tabs.account');
  await tap(page, 'home.login');
  await page.fill(tid('auth.login-email-input'), email);
  await page.fill(tid('auth.login-password-input'), password);
  await tap(page, 'auth.login-submit');
  await vis(page, 'tabs.account', 60_000);
  await page.waitForTimeout(2500);
  await tap(page, 'tabs.account');
  await vis(page, 'account.screen', 60_000);
}

/** Endereço de entrega (dados fictícios) pelo formulário do app; o CEP é preenchido à mão para não depender de busca externa. */
async function appAddAddress(page) {
  await appGo(page, '/address/form');
  const cep = page.locator(`${tid('address.cep-input')}:visible`).first();
  await cep.waitFor();
  await cep.fill('07900-200');
  await page.waitForTimeout(2500); // dá tempo da busca do CEP preencher rua e bairro, se houver
  for (const [id, value] of [['address.street-input', 'Rua das Flores'], ['address.district-input', 'Centro'], ['address.number-input', '100']]) {
    const el = page.locator(`${tid(id)}:visible`).first();
    if (!(await el.inputValue())) await el.fill(value);
  }
  await tap(page, 'address.submit');
  await page.waitForTimeout(2500);
}

/**
 * Clientes de demonstração fixos (um por finalidade, criados na primeira execução como o `pnpm smoke` faz): evitam encher a base de contas a
 * cada captura. `compra` faz o pedido; `exclusao` nunca pede nada, então a tela de exclusão sai sem impedimentos.
 */
async function demoCustomer(kind) {
  const email = `telas.${kind}@seed.webag.local`;
  const call = async (method, path, body, token) => {
    const res = await fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  let login = await call('POST', '/v1/auth/login', { email, password: SEED_PASSWORD });
  if (!login.data?.tokens) {
    const documents = await Promise.all(['customer_terms', 'privacy'].map(async (type) => ({ type, version: (await call('GET', `/v1/legal/${type}`)).data?.version })));
    const phone = `1199${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;
    const registered = await call('POST', '/v1/auth/register', { name: 'Cliente Demonstração', email, phone, password: SEED_PASSWORD, adultDeclaration: true, acceptedDocuments: documents });
    if (registered.status !== 201 && registered.status !== 200) throw new Error(`cadastro do cliente ${email}: HTTP ${registered.status}`);
    login = await call('POST', '/v1/auth/login', { email, password: SEED_PASSWORD });
  }
  // O código de e-mail (Mailpit) não é necessário para fotografar: marca o e-mail como confirmado direto no banco local, se possível.
  try {
    sql(`update users set email_verified_at = coalesce(email_verified_at, now()) where email = '${email}'`);
  } catch {
    log('sem acesso ao banco: o checkout do cliente de demonstração pode pedir a confirmação do e-mail');
  }
  // Pedidos de execuções anteriores: cancela o que ainda estiver aberto (limites de PIX e impedimentos de exclusão).
  const token = login.data?.tokens?.accessToken;
  const open = await call('GET', '/v1/orders?limit=50', null, token);
  for (const order of open.data?.data ?? []) {
    if (['awaiting_payment', 'received', 'accepted'].includes(order.status)) await call('POST', `/v1/orders/${order.id}/cancel`, {}, token);
  }
  const addresses = await call('GET', '/v1/me/addresses', null, token);
  demo.hasAddress = (addresses.data?.data?.length ?? 0) > 0;
  return email;
}

async function captureApp(browser) {
  // 1) cliente do seed (Ana): conta, cupons, pedidos, acompanhamento e troca
  {
    const { context, page } = await appSession(browser);
    await page.waitForTimeout(6000); // o aviso "Entregando em ..." (toast de 4 s) some antes da captura
    await attempt(page, 'app/inicio', () => snap(page, 'app/inicio', 'phone'));
    await attempt(page, 'app/busca', async () => {
      await tap(page, 'tabs.search');
      await vis(page, 'search.screen');
      await page.waitForTimeout(1500);
      await snap(page, 'app/busca', 'phone');
    });
    await attempt(page, 'app/resultados', async () => {
      await page.locator(tid('search.input')).first().fill('pão');
      await page.locator(tid('search.input')).first().press('Enter');
      await vis(page, 'results.screen');
      await page.waitForTimeout(3000);
      await snap(page, 'app/resultados', 'phone');
    });
    await appGo(page, '/');
    await appLogin(page, CUSTOMER, SEED_PASSWORD);
    await attempt(page, 'app/conta', () => snap(page, 'app/conta', 'phone'));
    await attempt(page, 'app/pedidos', async () => {
      await tap(page, 'tabs.orders');
      await vis(page, 'orders.screen');
      await page.getByText('Em andamento').first().waitFor();
      await page.waitForTimeout(1500);
      await snap(page, 'app/pedidos', 'phone');
    });
    const ids1 = await ordersOf(CUSTOMER, SEED_PASSWORD);
    const openOrder = async (number, ids = ids1) => {
      const id = ids.get(number);
      if (!id) throw new Error(`pedido ${number} não encontrado na conta de demonstração`);
      await appGo(page, `/order/${id}`);
      await vis(page, 'order.screen');
      await vis(page, 'order.timeline');
      await page.waitForTimeout(1500);
    };
    await attempt(page, 'app/acompanhamento', async () => {
      await openOrder('WB-DM036');
      await snap(page, 'app/acompanhamento', 'phone');
    });
    await attempt(page, 'app/troca', async () => {
      await openOrder('WB-DM018');
      await tap(page, 'order.exchange');
      await vis(page, 'exchange.screen');
      await page.locator(tid('exchange.skeleton')).waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
      await snap(page, 'app/troca', 'phone');
    });
    await attempt(page, 'app/cupons', async () => {
      await appGo(page, '/');
      await tap(page, 'tabs.account');
      await tap(page, 'account.coupons');
      await vis(page, 'coupons.screen');
      await page.locator(tid('coupons.skeleton')).waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
      await snap(page, 'app/cupons', 'phone');
    });
    await attempt(page, 'app/licencas', async () => {
      await appGo(page, '/licenses');
      await vis(page, 'licenses.screen');
      await snap(page, 'app/licencas', 'phone');
    });
    await context.close();
  }

  // 1b) cliente Carla: pedido a caminho com a faixa de entrega vencida (sem pedido de cancelamento anterior)
  {
    const { context, page } = await appSession(browser);
    await appLogin(page, 'cliente.carla@seed.webag.local', SEED_PASSWORD);
    const ids = await ordersOf('cliente.carla@seed.webag.local', SEED_PASSWORD);
    await attempt(page, 'app/acompanhamento-atrasado', async () => {
      const id = ids.get('WB-DM056');
      if (!id) throw new Error('pedido WB-DM056 não encontrado');
      await appGo(page, `/order/${id}`);
      await vis(page, 'order.screen');
      await vis(page, 'order.timeline');
      await page.locator('[data-testid^="tracking.late-"], [data-testid="order.late-tag"]').first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await snap(page, 'app/acompanhamento-atrasado', 'phone');
    });
    await context.close();
  }

  // 2) cliente que nunca pede: exclusão de conta sem impedimentos
  {
    const { context, page } = await appSession(browser);
    await appLogin(page, await demoCustomer('exclusao'), SEED_PASSWORD);
    await attempt(page, 'app/exclusao-de-conta', async () => {
      await appGo(page, '/privacy/delete');
      await vis(page, 'account.delete-screen');
      await page.locator(tid('account.delete-skeleton')).waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      await snap(page, 'app/exclusao-de-conta', 'phone');
    });
    await context.close();
  }

  // 3) cliente da compra: endereço, loja, produto, sacola, checkout (PIX e cartão), PIX e pedido confirmado
  const email = await demoCustomer('compra');
  const { context, page } = await appSession(browser);
  await appLogin(page, email, SEED_PASSWORD);
  if (!demo.hasAddress) await appAddAddress(page).catch((e) => log(`sem endereço salvo: ${String(e.message).split('\n')[0]}`));
  await appGo(page, '/');
  await tap(page, 'tabs.home');
  let pickup = false;
  if (demo.storeId) await appGo(page, `/store/${demo.storeId}`);
  else await page.locator('[data-testid^="home.store-"]:visible').first().click({ timeout: 90_000 });
  await vis(page, 'store.screen');
  await page.locator('[data-testid^="store.product-"]:visible').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await attempt(page, 'app/loja', () => snap(page, 'app/loja', 'phone'));
  await page.locator('[data-testid^="store.product-"]:visible').first().click();
  await vis(page, 'product.add');
  const options = await page.locator('[data-testid^="product.variant-"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).filter((t) => t !== 'product.variant-error'));
  const groups = new Set();
  for (const id of options) {
    const group = id.split('-').slice(0, -1).join('-');
    if (groups.has(group)) continue;
    groups.add(group);
    await page.locator(`[data-testid="${id}"]:visible`).first().click();
  }
  await attempt(page, 'app/produto', () => snap(page, 'app/produto', 'phone'));
  await tap(page, 'product.add');
  await page.waitForTimeout(2500);
  await tap(page, 'product.back');
  await page.locator(`${tid('store.cart-bar')}:visible`).first().click({ timeout: 30_000 });
  await vis(page, 'cart.total');
  // entrega fechada pelo horário da logística (BUG-016): muda para "Retirada" no Início e volta à sacola, para não deixar o checkout sem captura
  if (await page.locator(`${tid('cart.logistics-banner')}:visible`).count()) {
    log('entregas fechadas agora: sacola e checkout seguem por retirada');
    pickup = true;
    await appGo(page, '/');
    await tap(page, 'tabs.home');
    await tap(page, 'home.mode-pickup');
    await page.waitForTimeout(1500);
    await page.locator(`${tid('minibag')}:visible`).first().click();
    await vis(page, 'cart.total');
  }
  // pedido mínimo da loja: aumenta a quantidade até o botão deixar de pedir "mais itens"
  for (let i = 0; i < 8 && (await page.locator(`${tid('cart.minimum-banner')}:visible`).count()); i++) {
    await page.locator('[data-testid^="cart.item-"][data-testid$="-qty-plus"]:visible').first().click();
    await page.waitForTimeout(1200);
  }
  await attempt(page, 'app/sacola', () => snap(page, 'app/sacola', 'phone'));
  await tap(page, 'cart.submit');
  await vis(page, 'checkout.screen');
  await tap(page, pickup ? 'checkout.mode-pickup' : 'checkout.mode-delivery').catch(() => undefined);
  const cpf = async () => {
    const field = page.locator(`${tid('checkout.cpf-input')}:visible`);
    if (await field.count()) await field.first().fill('52998224725');
  };
  await tap(page, 'checkout.pay-pix');
  await cpf();
  await attempt(page, 'app/checkout-pix', () => snap(page, 'app/checkout-pix', 'phone'));
  await tap(page, 'checkout.pay-card');
  await vis(page, 'checkout.card-secure-note');
  await cpf();
  await attempt(page, 'app/checkout-cartao', () => snap(page, 'app/checkout-cartao', 'phone'));
  await tap(page, 'checkout.pay-pix');
  await cpf();
  await tap(page, 'checkout.submit');
  await vis(page, 'pix.screen');
  await vis(page, 'pix.code');
  await attempt(page, 'app/pix', () => snap(page, 'app/pix', 'phone'));
  // Só no provedor `fake` de desenvolvimento: o botão "Simular pagamento" existe no app de dev; no export, a mesma rota da API faz o papel do banco.
  // Em qualquer caso a confirmação chega ao app pelo servidor (o app nunca marca como pago).
  if (await page.locator(`${tid('pix.simulate')}:visible`).count()) await tap(page, 'pix.simulate');
  else await approvePix(email);
  await vis(page, 'confirmed.title', 120_000);
  await vis(page, 'confirmed.order-number');
  await page.waitForTimeout(4500); // celebração e aviso (toast) terminam: a captura mostra a tela em repouso
  await attempt(page, 'app/pedido-confirmado', () => snap(page, 'app/pedido-confirmado', 'phone'));
  await context.close();
}

// ------------------------------------------------------------------------------------------------ site, lojista e admin (1440x900 e 390x844)

const VIEWS = [['desk', DESK], ['phone', PHONE]];

/** Abre a rota nos dois tamanhos (a tela responsiva muda, então recarrega em cada um) e fotografa. `prepare` roda antes da captura. */
async function webScreen(page, key, path, prepare) {
  await attempt(page, key, async () => {
    for (const [view, size] of VIEWS) {
      await page.setViewportSize(size);
      await page.goto(`${WEB}${path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.locator('main, [role="main"], body').first().waitFor({ timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined);
      await page.locator('[data-testid="skeleton"]').first().waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => undefined); // carregando termina (ou vira erro, que vai para o relatório)
      // O alerta de pedido novo é modal e travado; para fotografar o que há atrás dele, esconde-o só na captura.
      await page.addStyleTag({ content: '[data-dialog-root]:has([data-testid="lojista.alert.modal"]) { display: none !important; }' }).catch(() => undefined);
      await page.evaluate(() => document.querySelectorAll('[inert]').forEach((el) => el.removeAttribute('inert'))).catch(() => undefined);
      if (prepare) await prepare(page);
      await suspect(page, `${key} ${view}`);
      await snap(page, key, view);
    }
  });
}

/** Tela com cara de erro (aviso de falha, 404): não derruba a captura, mas entra no relatório para correção. */
async function suspect(page, label) {
  const text = (await page.locator('main, body').first().innerText({ timeout: 5000 }).catch(() => '')).slice(0, 4000);
  const hit = /Não conseguimos carregar|Não foi possível carregar|Algo deu errado|Página não encontrada|Sem conexão|This page could not be found/i.exec(text);
  if (hit) {
    problems.push(`${label}: texto de erro na tela ("${hit[0]}")`);
    suspects.set(label.split(' ')[0], hit[0]);
  }
}

async function newWebContext(browser) {
  const context = await browser.newContext({ viewport: DESK, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  lastPage = page;
  return { context, page };
}

async function captureSite(browser) {
  const { context, page } = await newWebContext(browser);
  watch(page, 'site');
  await webScreen(page, 'site/home', '/');
  await webScreen(page, 'site/privacidade', '/privacidade');
  await webScreen(page, 'site/termos', '/termos');
  await webScreen(page, 'site/exclusao-de-conta', '/excluir-conta');
  await webScreen(page, 'site/licencas', '/licencas');
  await context.close();
}

async function captureLojista(browser) {
  // visitante: cadastro da conta do lojista
  {
    const { context, page } = await newWebContext(browser);
    watch(page, 'lojista-visitante');
    await webScreen(page, 'lojista/cadastro', '/lojista/cadastro');
    await context.close();
  }
  const { context, page } = await newWebContext(browser);
  watch(page, 'lojista');
  await page.goto(`${WEB}/lojista/entrar`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('lojista.login.email-input').fill(MERCHANT);
  await page.getByTestId('lojista.login.password-input').fill(SEED_PASSWORD);
  await page.getByTestId('lojista.login.submit').click();
  await page.waitForURL((url) => !url.pathname.includes('/entrar'), { timeout: 30_000 });
  await webScreen(page, 'lojista/inicio', '/lojista');
  await webScreen(page, 'lojista/pedidos-novos', '/lojista/pedidos');
  await webScreen(page, 'lojista/produtos', '/lojista/produtos');
  // formulário de produto: abre o primeiro produto e leva a linha "Você recebe" para dentro da janela
  await attempt(page, 'lojista/produto-voce-recebe', async () => {
    await page.setViewportSize(DESK);
    await page.goto(`${WEB}/lojista/produtos`, { waitUntil: 'domcontentloaded' });
    const row = page.locator('[data-testid^="lojista.produtos.row-"]:not([data-testid*="-stock"]):not([data-testid*="-switch"]):not([data-testid*="-low"]):not([data-testid*="-error"])').first();
    await row.waitFor({ timeout: 30_000 });
    const href = await row.locator('a').first().getAttribute('href');
    if (!href) throw new Error('a linha do produto não tem link');
    await webScreen(page, 'lojista/produto-voce-recebe', href, async (p) => {
      const line = p.getByTestId('lojista.produto.receive-line');
      await line.waitFor({ timeout: 30_000 });
      await p.getByTestId('lojista.produto.receive-value').waitFor({ timeout: 30_000 });
      await line.scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, 160)); // um pouco de contexto acima (preço) na janela
    });
  });
  await webScreen(page, 'lojista/trocas', '/lojista/trocas');
  await webScreen(page, 'lojista/avaliacoes', '/lojista/avaliacoes');
  await webScreen(page, 'lojista/financeiro', '/lojista/financeiro');
  await webScreen(page, 'lojista/minha-loja', '/lojista/loja');
  await context.close();

  // revisão do cadastro: loja em rascunho (estado temporário, desfeito ao terminar)
  if (demo.reviewStoreId) {
    setReviewStore('draft');
    const second = await newWebContext(browser);
    watch(second.page, 'lojista-revisao');
    await second.page.goto(`${WEB}/lojista/entrar`, { waitUntil: 'domcontentloaded' });
    await second.page.getByTestId('lojista.login.email-input').fill(REVIEW_STORE.email);
    await second.page.getByTestId('lojista.login.password-input').fill(SEED_PASSWORD);
    await second.page.getByTestId('lojista.login.submit').click();
    await second.page.waitForURL((url) => !url.pathname.includes('/entrar'), { timeout: 30_000 });
    await webScreen(second.page, 'lojista/revisao', '/lojista/onboarding/revisao');
    await second.context.close();
  } else {
    failed.push({ key: 'lojista/revisao', why: 'sem acesso ao banco local para deixar uma loja em rascunho' });
  }
}

// ---- admin: o super admin semeado tem TOTP; o segredo fica em arquivo temporário (mesmo caminho dos E2E reais), nunca no repositório
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totpAt(secret, at = Date.now()) {
  let bits = '';
  for (const ch of secret.toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
const TOTP_FILE = join(tmpdir(), 'webag-e2e-real', createHash('sha1').update(API).digest('hex').slice(0, 8), 'real-admin-totp.json');
const readTotp = () => (existsSync(TOTP_FILE) ? JSON.parse(readFileSync(TOTP_FILE, 'utf8')) : null);
const writeTotp = (state) => {
  mkdirSync(dirname(TOTP_FILE), { recursive: true });
  writeFileSync(TOTP_FILE, JSON.stringify(state));
};
async function adminSecret() {
  const known = readTotp();
  if (known) return known.secret;
  const json = { 'content-type': 'application/json' };
  const login = await (await fetch(`${API}/v1/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) })).json();
  if (!login.tokens) throw new Error('o super admin já tem TOTP e o segredo não está salvo (pasta temporária webag-e2e-real): informe-o com ADMIN_TOTP_SECRET ou recrie o banco local');
  const auth = { ...json, authorization: `Bearer ${login.tokens.accessToken}` };
  const setup = await (await fetch(`${API}/v1/admin/totp/setup`, { method: 'POST', headers: auth })).json();
  const confirm = await fetch(`${API}/v1/admin/totp/confirm`, { method: 'POST', headers: auth, body: JSON.stringify({ code: totpAt(setup.secret) }) });
  if (confirm.status !== 200) throw new Error(`matricular o TOTP do super admin: HTTP ${confirm.status}`);
  writeTotp({ secret: setup.secret, lastStep: Math.floor(Date.now() / 30_000) });
  return setup.secret;
}
/** Próximo código que o servidor ainda não viu (anti-replay: o mesmo passo de 30 s não vale duas vezes). */
async function freshAdminCode() {
  const secret = process.env.ADMIN_TOTP_SECRET || (await adminSecret());
  const state = readTotp() ?? { secret, lastStep: 0 };
  let step = Math.floor(Date.now() / 30_000);
  if (step <= state.lastStep) {
    await sleep((state.lastStep + 1) * 30_000 - Date.now() + 500);
    step = Math.floor(Date.now() / 30_000);
  }
  writeTotp({ secret, lastStep: step });
  return totpAt(secret);
}

async function captureAdmin(browser) {
  const { context, page } = await newWebContext(browser);
  watch(page, 'admin');
  const code = await freshAdminCode();
  await page.goto(`${WEB}/admin/entrar`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin.login.email-input').fill(ADMIN_EMAIL);
  await page.getByTestId('admin.login.password-input').fill(ADMIN_PASSWORD);
  await page.getByTestId('admin.login.submit').click();
  await page.getByTestId('admin.login.totp-input').waitFor();
  await page.getByLabel('Dígito 1 de 6').pressSequentially(code);
  await page.getByTestId('user-name').waitFor({ timeout: 30_000 });
  await webScreen(page, 'admin/inicio', '/admin');
  await webScreen(page, 'admin/alertas', '/admin/alertas');
  await webScreen(page, 'admin/usuarios', '/admin/usuarios');
  await webScreen(page, 'admin/pedidos', '/admin/pedidos');
  setReviewStore('in_review'); // a loja do cadastro entra na fila de aprovação
  await webScreen(page, 'admin/lojas', '/admin/lojas');
  await attempt(page, 'admin/loja-aprovacao', async () => {
    if (!demo.reviewStoreId) throw new Error('sem acesso ao banco local para deixar uma loja em análise');
    await webScreen(page, 'admin/loja-aprovacao', `/admin/lojas/${demo.reviewStoreId}`);
  });
  await webScreen(page, 'admin/logistica', '/admin/logistica');
  await webScreen(page, 'admin/parametros-entrega', '/admin/parametros/entrega');
  await webScreen(page, 'admin/comissoes', '/admin/comissoes');
  await webScreen(page, 'admin/relatorios', '/admin/relatorios');
  await webScreen(page, 'admin/manutencao', '/admin/manutencao');
  await context.close();
}

// ------------------------------------------------------------------------------------------------ índice (docs/telas/README.md)

function writeReadme() {
  const files = readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
  const rows = [];
  for (const spec of SPEC.values()) {
    const base = `${spec.n}-${spec.area}-${spec.slug}`;
    for (const file of [`${base}.png`, `${base}-desktop.png`, `${base}-mobile.png`].filter((f) => files.includes(f))) {
      const viewport = file.endsWith('-desktop.png') ? '1440x900' : '390x844';
      rows.push(`| [${file}](${file}) | ${spec.screen} | ${spec.profile} | ${viewport} | ${spec.shows} |`);
    }
  }
  const missing = [...SPEC.entries()].filter(([, spec]) => !files.some((f) => f.startsWith(`${spec.n}-${spec.area}-${spec.slug}`))).map(([key]) => key);
  const text = `# Capturas de tela

Capturas das telas principais do Webag, feitas em viewport (não fullPage) com a **API real local** e os dados de demonstração do seed
(\`pnpm run setup\`). Tudo é fictício. Geradas por \`scripts/capture-screens.mjs\`; não edite à mão, rode o script de novo.

- **App do cliente**: 390x844 (celular), app Expo exportado para web e aberto no Chrome. A aparência segue o app nativo; o que muda é o
  que só existe no aparelho (barra do sistema, teclado, permissões do sistema).
- **Painel do lojista, painel admin e site**: 1440x900 (\`-desktop\`) e 390x844 (\`-mobile\`).
- Numeração = ordem do catálogo no script; o número é estável quando só algumas áreas são regeradas.

## Como gerar

\`\`\`bash
pnpm run setup                         # infraestrutura, migrações e seed (uma vez)
pnpm dev                               # API (e o resto) no ar; ou só a API em :3000
node scripts/capture-screens.mjs       # tudo (cerca de 10 min, com os builds do site e do app)
ONLY=app,site node scripts/capture-screens.mjs   # só algumas áreas (não reescreve este índice)
\`\`\`

O script faz o build e sobe sozinho o site/painéis (\`next build\` e \`next start\`) e o app em versão web (\`expo export\` servido por um
servidor estático local) e encerra tudo no fim. Para usar o que já roda: \`WEB_URL\`, \`APP_URL\`. Outras variáveis (API_URL, REAL_DB_URL,
SEED_PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_TOTP_SECRET, OUT_DIR, PW_CHANNEL=chrome, REUSE_APP_BUILD=1, REUSE_WEB_BUILD=1) estão no cabeçalho do script.

Ajustes **temporários** de dados fictícios no banco local (desfeitos ao terminar): faixa de entrega de 2 pedidos do seed (um dentro do
prazo, um atrasado), data de entrega de 1 pedido (troca dentro do prazo), 1 cupom pessoal, o estado de 1 loja (rascunho e depois
"em análise") e o horário de 1 loja. Cria 2 clientes de demonstração fixos (\`telas.compra@\`, \`telas.exclusao@seed.webag.local\`) e 1 pedido
por execução. Só roda contra banco local (\`REAL_DB_URL\` em localhost).

## Limites conhecidos destas capturas

| Limite | Efeito |
|---|---|
| Sem armazenamento de objetos (S3) no ambiente da captura | Produtos, lojas e capas aparecem com a ilustração padrão, não com foto |
| Logística da entrega fora do horário | Quando a entrega está fechada, sacola e checkout seguem por **Retirada** (o app avisa e oferece retirar) |
| Horário comercial das lojas | Textos como "Loja fechada agora" e "Entrega volta amanhã" dependem da hora da captura |
| Sem Mailpit (e-mail) | O e-mail dos clientes de demonstração é marcado como confirmado direto no banco |
| Cartão | O cartão é digitado na página segura do Mercado Pago; o app só mostra o checkout com cartão escolhido |

## Índice

| Arquivo | Tela | Perfil | Viewport | O que mostra |
|---|---|---|---|---|
${rows.join('\n')}
${suspects.size ? `\n## Telas que mostraram erro nesta execução\n\nA captura registra o estado real: nestas telas apareceu uma mensagem de erro (normalmente a API devolveu falha ou faltou o arquivo no armazenamento de objetos). Corrija a causa e capture de novo.\n\n${[...suspects].map(([key, text]) => `- \`${key}\`: "${text}"`).join('\n')}\n` : ''}${missing.length ? `\n## Não capturadas nesta execução\n\n${missing.map((key) => `- \`${key}\`: ${failed.find((f) => f.key === key)?.why ?? 'não executada'}`).join('\n')}\n` : ''}`;
  writeFileSync(join(OUT, 'README.md'), text);
  log(`índice escrito em ${join(OUT, 'README.md')}`);
}

// ------------------------------------------------------------------------------------------------ principal

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (process.argv.includes('--readme')) {
    writeReadme(); // só reescreve o índice a partir das imagens que já estão na pasta
    return;
  }
  await ensureApi();
  if (ONLY.has('lojista') || ONLY.has('admin') || ONLY.has('site') || ONLY.has('app')) await ensureWeb();
  if (ONLY.has('app')) await ensureApp();
  prepareDemoData();
  const browser = await launch();
  const areas = { app: captureApp, site: captureSite, lojista: captureLojista, admin: captureAdmin };
  for (const [area, fn] of Object.entries(areas)) {
    if (!ONLY.has(area)) continue;
    try {
      await fn(browser);
    } catch (e) {
      const why = String(e.message).split('\n')[0].slice(0, 200);
      failed.push({ key: `${area}/*`, why });
      console.error(`[telas] ERRO em ${area}: ${why}`);
      mkdirSync(join(tmpdir(), 'webag-capture-fail'), { recursive: true });
      await lastPage?.screenshot({ path: join(tmpdir(), 'webag-capture-fail', `${area}-ERRO.png`) }).catch(() => undefined);
    }
  }
  await browser.close();
  if (problems.length) log(`avisos do navegador (5xx e erros de página):\n  ${[...new Set(problems)].slice(0, 12).join('\n  ')}`);
  if (['app', 'lojista', 'admin', 'site'].every((area) => ONLY.has(area))) writeReadme();
  log(`${taken.size} capturas em ${OUT}; ${failed.length} falha(s)`);
  for (const f of failed) log(`  falhou: ${f.key}: ${f.why}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`[telas] ${e.message}`);
  process.exit(1);
});

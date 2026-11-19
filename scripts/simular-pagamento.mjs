#!/usr/bin/env node
// Aprova o PIX simulado do pedido mais recente que ainda aguarda pagamento (só desenvolvimento, provedor `fake`).
// O app mostra o PIX e fica aguardando; este comando faz o papel do banco + Mercado Pago: dispara o MESMO caminho do webhook real.
// Uso: pnpm pagar            aprova o pedido aguardando pagamento mais recente
//      pnpm pagar recusar    simula a recusa    |   pnpm pagar expirar   simula o PIX vencido
// Precisa do Docker (lê o banco pelo container do compose) e da API rodando (pnpm dev).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const env = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
        .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
    )
  : {};
const API = (process.env.API_URL ?? `http://localhost:${env.API_PORT ?? 3000}`).replace(/\/+$/, '');
const action = { recusar: 'decline', expirar: 'expire' }[process.argv[2] ?? ''] ?? 'approve';

const sql = "select a.id || ' ' || o.number from payment_attempts a join orders o on o.id::text = a.external_reference where a.status = 'pending' and a.provider = 'fake' order by a.created_at desc limit 1";
const psql = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', env.POSTGRES_USER ?? 'webag', '-d', env.POSTGRES_DB ?? 'webag', '-tA', '-c', sql], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
if (psql.status !== 0) {
  console.error('Não consegui ler o banco pelo Docker. O compose está no ar (docker compose up -d)?\n' + psql.stderr);
  process.exit(1);
}
const [attemptId, orderNumber] = psql.stdout.trim().split(' ');
if (!attemptId) {
  console.log('Nenhum pagamento PIX pendente. Faça um pedido no app (ou na web) e rode de novo.');
  process.exit(0);
}

// A rota de simulação só exige uma sessão válida; usamos o cliente de demonstração.
const login = await fetch(`${API}/v1/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'cliente.ana@seed.webag.local', password: process.env.SMOKE_PASSWORD ?? 'webag-seed-lojista-2026' }),
});
const token = (await login.json())?.tokens?.accessToken;
if (!token) {
  console.error(`Login de demonstração falhou (HTTP ${login.status}). O seed rodou? (pnpm run setup)`);
  process.exit(1);
}
const response = await fetch(`${API}/v1/dev/payments/${attemptId}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}' });
if (response.status === 404) {
  console.error('Rota de simulação não existe: a API está com NODE_ENV diferente de development ou PAYMENT_PROVIDER diferente de fake.');
  process.exit(1);
}
console.log(response.ok ? `Pedido ${orderNumber}: pagamento ${{ approve: 'aprovado', decline: 'recusado', expire: 'expirado' }[action]}.` : `Falhou (HTTP ${response.status}): ${await response.text()}`);
process.exit(response.ok ? 0 : 1);

#!/usr/bin/env node
// Prepara o ambiente local do zero (Windows, macOS e Linux):
//   1. copia infra/env.example para .env se o .env não existir (nunca sobrescreve);
//   2. sobe a infra do docker compose (PostgreSQL+PostGIS, Redis, Mailpit, storage);
//   3. aplica as migrações e roda o seed (idempotentes: pode rodar de novo sem medo).
// Uso: `pnpm run setup` (o `pnpm setup` puro é um comando do próprio pnpm; veja o README).
// SKIP_DOCKER=1 pula o passo 2 (CI, ou quando Postgres/Redis já estão rodando).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const log = (message) => console.log(`[setup] ${message}`);
const fail = (message) => {
  console.error(`[setup] ERRO: ${message}`);
  process.exit(1);
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: isWindows, ...options });
  if (result.error) fail(`não consegui executar "${command}": ${result.error.message}`);
  if (result.status !== 0) fail(`"${command} ${args.join(' ')}" terminou com código ${result.status}`);
}

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) fail(`Node >= 22.12 é obrigatório (você tem ${process.versions.node})`);

// 1. .env
const envFile = resolve(root, '.env');
const envExample = resolve(root, 'infra/env.example');
if (existsSync(envFile)) {
  log('.env já existe: mantido como está');
} else {
  if (!existsSync(envExample)) fail('infra/env.example não encontrado');
  copyFileSync(envExample, envFile);
  log('.env criado a partir de infra/env.example (valores só de desenvolvimento)');
}

// 2. infra
if (process.env.SKIP_DOCKER === '1') {
  log('SKIP_DOCKER=1: usando Postgres e Redis que já estão rodando');
} else {
  const docker = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore', shell: isWindows });
  if (docker.status !== 0) fail('Docker Compose não encontrado. Instale o Docker Desktop (ou use SKIP_DOCKER=1 com Postgres/Redis próprios).');
  log('subindo PostgreSQL e Redis (aguarda ficarem saudáveis)...');
  run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis']);
  log('subindo Mailpit e storage...');
  run('docker', ['compose', 'up', '-d', 'mailpit', 'storage', 'storage-init']);
}

// 3. migrações e seed (o tsx lê o .env da raiz)
log('aplicando migrações...');
run('pnpm', ['--filter', '@webag/api', 'db:migrate']);
log('rodando seed...');
run('pnpm', ['--filter', '@webag/api', 'db:seed']);

// resumo
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
console.log(`
Pronto. Próximos passos:
  pnpm dev                       sobe API (http://localhost:${env.API_PORT ?? 3000}) e apps em modo desenvolvimento
  http://localhost:${env.API_PORT ?? 3000}/docs        contrato da API (Swagger)
  http://localhost:8025          Mailpit (e-mails de código e convite)
Admin inicial (DEV): ${env.SEED_ADMIN_EMAIL ?? '(não definido)'} / ${env.SEED_ADMIN_PASSWORD ?? '(não definido)'}
  -> no primeiro login o painel exige configurar o app autenticador (TOTP).
Pagamentos: PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER ?? 'fake'} (simulado; sem chaves do Mercado Pago).
`);

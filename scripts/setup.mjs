#!/usr/bin/env node
// Prepara o ambiente local do zero (Windows, macOS e Linux):
//   1. copia infra/env.example para .env se o .env não existir (nunca sobrescreve) e, nesse .env novo, troca as senhas de
//      desenvolvimento por valores aleatórios (Postgres, Redis, chaves S3 e senha do admin; SEC-190/192). Mantém os valores fixos
//      quando CI=true, WEBAG_FIXED_DEV_SECRETS=1, SKIP_DOCKER=1 (a infra não é nossa) ou quando já existe volume de dados do Postgres
//      (a senha antiga está gravada nele);
//   2. sobe a infra do docker compose (PostgreSQL+PostGIS, Redis, Mailpit, storage);
//   3. aplica as migrações e roda o seed (idempotentes: pode rodar de novo sem medo).
// Uso: `pnpm run setup` (o `pnpm setup` puro é um comando do próprio pnpm; veja o README).
// SKIP_DOCKER=1 pula o passo 2 (CI, ou quando Postgres/Redis já estão rodando).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDevSecrets, generateDevSecrets, useFixedDevSecrets } from './setup-secrets.mjs';

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

function readEnv(file) {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

// Porta ocupada no host? (Postgres e Redis instalados na máquina são comuns e fazem o docker compose falhar no bind.)
function isPortBusy(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', (error) => done(error.code === 'EADDRINUSE' || error.code === 'EACCES'));
    server.once('listening', () => server.close(() => done(false)));
    server.listen(port, '0.0.0.0');
  });
}

async function nextFreePort(start) {
  for (let port = start + 1; port < start + 50; port++) if (!(await isPortBusy(port))) return port;
  return fail(`nenhuma porta livre perto de ${start}`);
}

// Por que este .env novo ficaria com os valores fixos do infra/env.example? (texto vazio = pode gerar senhas aleatórias)
function fixedSecretsReason() {
  if (useFixedDevSecrets()) return 'CI ou WEBAG_FIXED_DEV_SECRETS=1';
  if (process.env.SKIP_DOCKER === '1') return 'SKIP_DOCKER=1: a infra já existente tem as próprias senhas';
  // Volume do Postgres de uma instalação anterior: a senha antiga (e o admin já semeado) está gravada nele; trocar só o .env quebraria o login.
  const volume = spawnSync('docker', ['volume', 'inspect', 'webag_postgres-data'], { stdio: 'ignore', shell: isWindows });
  if (volume.status === 0) return 'já existe um banco local de uma instalação anterior; para recomeçar com senhas novas: pnpm infra:down -v, apague o .env e rode o setup de novo (apaga os dados locais)';
  return '';
}

// 1. .env
let envCreatedNow = false;
let secretsGenerated = false;
const envFile = resolve(root, '.env');
const envExample = resolve(root, 'infra/env.example');
if (existsSync(envFile)) {
  log('.env já existe: mantido como está');
  const current = readEnv(envFile);
  if (current.POSTGRES_PASSWORD === 'webag_dev_only' || current.S3_SECRET_KEY === 'webag-dev-secret-only') {
    log('aviso: este .env usa as senhas de desenvolvimento públicas do repositório (Postgres/S3). As portas do banco, do Redis, do Mailpit e do console do storage só abrem em 127.0.0.1; a 9000 só abre na rede com `pnpm iphone`, então use-o só no Wi-Fi de casa (ou gere senhas novas: pnpm infra:down -v, apague o .env e rode o setup de novo; apaga os dados locais).');
  }
} else {
  if (!existsSync(envExample)) fail('infra/env.example não encontrado');
  copyFileSync(envExample, envFile);
  envCreatedNow = true;
  const fixedReason = fixedSecretsReason();
  if (fixedReason) {
    log(`.env criado a partir de infra/env.example (valores fixos de desenvolvimento: ${fixedReason})`);
  } else {
    writeFileSync(envFile, applyDevSecrets(readFileSync(envFile, 'utf8'), generateDevSecrets()));
    secretsGenerated = true;
    log('.env criado com senhas aleatórias (Postgres, Redis, chaves S3 e admin) só para este computador; o .env fica fora do git');
  }
}

// 2. infra
if (process.env.SKIP_DOCKER === '1') {
  log('SKIP_DOCKER=1: usando Postgres e Redis que já estão rodando');
} else {
  const docker = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore', shell: isWindows });
  if (docker.status !== 0) fail('Docker Compose não encontrado. Instale o Docker Desktop (ou use SKIP_DOCKER=1 com Postgres/Redis próprios).');
  const daemon = spawnSync('docker', ['info'], { stdio: 'ignore', shell: isWindows });
  if (daemon.status !== 0) fail('O Docker está instalado mas não está rodando. Abra o Docker Desktop (Windows/macOS) ou inicie o serviço (Linux: sudo systemctl start docker) e rode de novo.');

  // Portas do host: só confere as de serviços que ainda não estão rodando (rodar o setup de novo não pode falhar por causa de si mesmo).
  const running = spawnSync('docker', ['compose', 'ps', '--status', 'running', '--services'], { cwd: root, encoding: 'utf8', shell: isWindows });
  const alreadyUp = new Set((running.stdout ?? '').split(/\s+/).filter(Boolean));
  const env = readEnv(envFile);
  const checks = [
    { service: 'postgres', name: 'PostgreSQL', key: 'POSTGRES_PORT', port: Number(env.POSTGRES_PORT ?? 5432), urlKey: 'DATABASE_URL' },
    { service: 'redis', name: 'Redis', key: 'REDIS_PORT', port: Number(env.REDIS_PORT ?? 6379), urlKey: 'REDIS_URL' },
    { service: 'storage', name: 'armazenamento S3 (API)', port: 9000 },
    { service: 'storage', name: 'armazenamento S3 (console)', port: 9001 },
    { service: 'mailpit', name: 'Mailpit (SMTP)', port: 1025 },
    { service: 'mailpit', name: 'Mailpit (tela)', port: 8025 },
  ];
  let envText = readFileSync(envFile, 'utf8');
  let envChanged = false;
  const blocked = [];
  for (const check of checks) {
    if (alreadyUp.has(check.service) || !(await isPortBusy(check.port))) continue;
    if (check.key && envCreatedNow) {
      // .env novo: escolhe outra porta sozinho e registra no .env. .env antigo: não mexemos, só avisamos.
      const free = await nextFreePort(check.port);
      envText = envText.replace(new RegExp(`^${check.key}=.*$`, 'm'), `${check.key}=${free}`);
      envText = envText.replace(new RegExp(`^${check.urlKey}=(.*):${check.port}(/.*)?$`, 'm'), `${check.urlKey}=$1:${free}$2`);
      envChanged = true;
      log(`porta ${check.port} (${check.name}) já está em uso na sua máquina: usando ${free} (gravado no .env)`);
    } else {
      blocked.push(check);
    }
  }
  if (envChanged) writeFileSync(envFile, envText);
  if (blocked.length > 0) {
    const lines = blocked.map((check) =>
      check.key
        ? `  - porta ${check.port} (${check.name}): pare o que a usa, ou defina ${check.key}=<outra porta> e ajuste ${check.urlKey} no .env`
        : `  - porta ${check.port} (${check.name}): pare o programa que a usa (ex.: Linux/macOS: lsof -i :${check.port}; Windows: netstat -ano | findstr :${check.port})`,
    );
    fail(`portas já ocupadas na sua máquina:\n${lines.join('\n')}`);
  }

  log('subindo PostgreSQL e Redis (aguarda ficarem saudáveis)...');
  run('docker', ['compose', 'up', '-d', '--wait', 'postgres', 'redis']);
  log('subindo Mailpit e storage...');
  run('docker', ['compose', 'up', '-d', 'mailpit', 'storage']);
  // Espera os buckets existirem antes do seed (sem isso o seed roda cedo demais e as lojas ficam sem foto).
  log('criando os buckets de fotos (aguarda o storage responder)...');
  run('docker', ['compose', 'run', '--rm', '-T', 'storage-init']);
}

// 3. migrações e seed (o tsx lê o .env da raiz)
log('aplicando migrações...');
run('pnpm', ['--filter', '@webag/api', 'db:migrate']);
log('rodando seed...');
run('pnpm', ['--filter', '@webag/api', 'db:seed']);

// resumo
const env = readEnv(envFile);
console.log(`
Pronto. Próximos passos:
  pnpm dev                       sobe API (http://localhost:${env.API_PORT ?? 3000}) e apps em modo desenvolvimento
  http://localhost:${env.API_PORT ?? 3000}/docs        contrato da API (Swagger)
  http://localhost:8025          Mailpit (e-mails de código e convite)
Admin inicial (DEV): ${env.SEED_ADMIN_EMAIL ?? '(não definido)'} / ${env.SEED_ADMIN_PASSWORD ?? '(não definido)'}${secretsGenerated ? '\n  (senha gerada só para este computador; está em SEED_ADMIN_PASSWORD no .env)' : ''}
  -> no primeiro login o painel exige configurar o app autenticador (TOTP): cadastre-o LOGO, antes de abrir o Webag no Wi-Fi (SEC-192).
Horário das lojas de demonstração: SEED_HOURS=${env.SEED_HOURS ?? 'always_open'} (always_open = abertas 24 h, a qualquer hora; realistic = horário real; veja o README).
Pagamentos: PAYMENT_PROVIDER=${env.PAYMENT_PROVIDER ?? 'fake'} (simulado; sem chaves do Mercado Pago).
`);

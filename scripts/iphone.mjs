#!/usr/bin/env node
// `pnpm iphone`: deixa o Webag pronto para abrir no iPhone (Safari) pela rede Wi-Fi da sua casa e sobe tudo.
//   1. descobre o endereço (IPv4) deste computador na rede local (macOS, Windows e Linux; ignora Docker, VPN e redes virtuais);
//   2. grava no `.env` (com cópia do original em `.env.bak`, criada só uma vez, de forma idempotente) só os ENDEREÇOS que o celular precisa; nenhum segredo é lido nem escrito;
//   3. confere Docker, banco e portas 3000, 3001 e 8081 e abre na rede só a 9000 do armazenamento (fotos; STORAGE_BIND=0.0.0.0);
//   4. sobe API + site/painéis + app (reaproveita `pnpm dev`) e imprime o endereço para o Safari, os logins e como simular o pagamento.
// Uso: pnpm iphone [--ip 192.168.0.10] [--check] [--help]
//   --ip <IPv4>  usa este endereço em vez do detectado (se houver mais de uma rede, ou se a detecção errar)
//   --check      só confere tudo e mostra o que mudaria; NÃO altera o `.env` e não sobe o app (bom para testar)
// Variáveis: SKIP_DOCKER=1 (Postgres/Redis seus, como no `pnpm run setup`).
import { spawn, spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const WARMUP_MS = 4 * 60_000;
export const PORTS = { api: 3000, web: 3001, app: 8081, storage: 9000 };

/** Aviso fixo de segurança (SEC-191): impresso no início e no fim do `pnpm iphone`. */
export const SAFETY_NOTICE = [
  'ATENÇÃO: use SÓ no Wi-Fi da sua casa. Não use em Wi-Fi público, de convidados, de café, faculdade ou trabalho.',
  `Enquanto o Webag estiver rodando, qualquer aparelho deste Wi-Fi consegue abrir o ambiente de teste (portas ${PORTS.api} API, ${PORTS.web} site e painéis, ${PORTS.app} app, ${PORTS.storage} fotos).`,
  `Só essas portas (${PORTS.api}, ${PORTS.web}, ${PORTS.app} e ${PORTS.storage} das fotos) ficam na rede; banco, Redis, e-mail de teste e console do armazenamento só abrem neste computador.`,
  'Ao terminar: Ctrl+C nesta janela e, para desligar o banco, pnpm infra:down.',
];

/** Serviços de apoio do compose que o `pnpm iphone` precisa no ar. */
export const DOCKER_SERVICES = ['postgres', 'redis', 'mailpit', 'storage'];

/**
 * O que subir no Docker. Fora do `--check`, o armazenamento é SEMPRE recriado com STORAGE_BIND=0.0.0.0 (o `up -d` recria só se a
 * publicação da porta 9000 mudou), para o iPhone alcançar as fotos (SEC-190). Postgres, Redis, Mailpit e a 9001 não dependem da
 * variável e seguem em 127.0.0.1. No `--check` nada é aberto na rede: sobe só o que falta, com o padrão (127.0.0.1).
 */
export function dockerUpPlan({ running = new Set(), check = false } = {}) {
  const missing = DOCKER_SERVICES.filter((service) => !running.has(service));
  if (check) return { services: missing, env: {} };
  return { services: DOCKER_SERVICES.filter((service) => service === 'storage' || missing.includes(service)), env: { STORAGE_BIND: '0.0.0.0' } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Funções puras (testadas em scripts/iphone.test.mjs)
// ---------------------------------------------------------------------------------------------------------------------

/** Placas de rede que NÃO são o Wi-Fi/cabo da casa: Docker, VPN, máquinas virtuais, WSL, Bluetooth, túneis do macOS. */
const VIRTUAL_NAME =
  /^(lo\d*$|docker|br-|veth|virbr|vboxnet|vmnet|vmenet|vnic|lxc|lxd|cni|flannel|cali|kube|tun|tap|utun|wg|tailscale|zt|ppp|awdl|llw|bridge|anpi|ap\d|gif|stf|ipsec|dummy)|vethernet|virtualbox|vmware|hyper-v|wsl|loopback|bluetooth|tailscale|zerotier|vpn|openvpn|wireguard|nord|proton|docker|default switch|npcap|teredo|isatap|pseudo/i;
const WIFI_NAME = /wi-?fi|wlan|wlp|wlx|wireless|^en0$/i;
const CABLE_NAME = /ethernet|^eth|^enp|^eno|^ens|^en[1-9]$/i;

export function isValidIPv4(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function ipv4ToNumber(ip) {
  return ip.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

function inRange(ip, base, bits) {
  const size = 2 ** (32 - bits);
  const start = ipv4ToNumber(base);
  const value = ipv4ToNumber(ip);
  return value >= start && value < start + size;
}

/** Endereços que não servem para o celular alcançar o computador: loopback, link-local (169.254), CGNAT/VPN (100.64/10), benchmark (198.18/15). */
export function isUnusableAddress(ip) {
  return (
    !isValidIPv4(ip) ||
    inRange(ip, '127.0.0.0', 8) ||
    inRange(ip, '0.0.0.0', 8) ||
    inRange(ip, '169.254.0.0', 16) ||
    inRange(ip, '100.64.0.0', 10) ||
    inRange(ip, '198.18.0.0', 15) ||
    inRange(ip, '224.0.0.0', 3)
  );
}

/**
 * Lista as redes candidatas, da melhor para a pior. `interfaces` tem o formato de `os.networkInterfaces()`.
 * `routeIp` (opcional) é o endereço que o sistema usaria para sair para a internet: desempata a favor da rede "principal".
 */
export function rankCandidates(interfaces, routeIp) {
  const found = [];
  for (const [name, addresses] of Object.entries(interfaces ?? {})) {
    for (const address of addresses ?? []) {
      const family = address.family === 'IPv4' || address.family === 4;
      if (!family || address.internal || isUnusableAddress(address.address)) continue;
      if (VIRTUAL_NAME.test(name)) continue;
      let score = 0;
      if (inRange(address.address, '192.168.0.0', 16)) score += 30;
      else if (inRange(address.address, '10.0.0.0', 8)) score += 20;
      else if (inRange(address.address, '172.16.0.0', 12)) score += 10;
      if (WIFI_NAME.test(name)) score += 15;
      else if (CABLE_NAME.test(name)) score += 10;
      if (routeIp && address.address === routeIp) score += 25;
      found.push({ name, ip: address.address, score });
    }
  }
  return found.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Junta as origens que já existem com as que o celular precisa (sem repetir, mantendo a ordem do que o usuário já tinha). */
export function mergeCors(existing, ip) {
  const required = [
    'http://localhost:3001',
    'http://localhost:3101',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    `http://${ip}:3001`,
    `http://${ip}:8081`,
  ];
  const current = String(existing ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([...current, ...required])].join(',');
}

/** Endereços (só URLs; nada secreto) que o `.env` precisa ter para o celular falar com este computador. */
export function envUpdates(ip, currentCors, bucket = 'webag-public') {
  return {
    EXPO_PUBLIC_API_URL: `http://${ip}:${PORTS.api}`,
    EXPO_PUBLIC_WEB_URL: `http://${ip}:${PORTS.web}`,
    EXPO_PUBLIC_APP_ENV: 'development',
    // A API entrega ao app o endereço da página do cartão e do download de dados: precisa ser o mesmo que o app confere (EXPO_PUBLIC_WEB_URL).
    WEB_PUBLIC_URL: `http://${ip}:${PORTS.web}`,
    API_PUBLIC_URL: `http://${ip}:${PORTS.api}`,
    // Fotos das lojas: a API monta a URL na hora de responder; com `localhost` o iPhone não carrega nenhuma imagem.
    S3_PUBLIC_URL: `http://${ip}:${PORTS.storage}/${bucket}`,
    CORS_ORIGINS: mergeCors(currentCors, ip),
  };
}

/** Lê `CHAVE=valor` de um texto de .env (ignora comentários). Última ocorrência vence, como no dotenv. */
export function parseEnv(text) {
  const result = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (match) result[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return result;
}

/**
 * Grava as chaves no texto do .env: troca a linha ativa se existir (todas as repetições), senão acrescenta ao final num bloco.
 * Não mexe em nenhuma outra linha. Rodar duas vezes com os mesmos valores não muda nada.
 */
export function mergeEnvText(text, updates) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.length === 0 ? [] : text.split(/\r?\n/);
  const changed = [];
  const missing = [];
  for (const [key, value] of Object.entries(updates)) {
    const pattern = new RegExp(`^\\s*${key}\\s*=`);
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      if (!pattern.test(lines[i])) continue;
      found = true;
      const next = `${key}=${value}`;
      if (lines[i] !== next) {
        lines[i] = next;
        if (!changed.includes(key)) changed.push(key);
      }
    }
    if (!found) missing.push(key);
  }
  if (missing.length > 0) {
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    lines.push('', '# --- Rede local para o iPhone (gerado por `pnpm iphone`; para voltar ao normal, restaure o .env.bak) ---');
    for (const key of missing) lines.push(`${key}=${updates[key]}`);
    changed.push(...missing);
  }
  const out = lines.join(eol);
  return { text: out.endsWith(eol) || out === '' ? out : out + eol, changed };
}

export function parseArgs(argv) {
  const options = { ip: undefined, check: false, help: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') options.check = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--ip') options.ip = argv[++i];
    else if (arg.startsWith('--ip=')) options.ip = arg.slice(5);
    else options.errors.push(`opção desconhecida: ${arg}`);
  }
  if (options.ip !== undefined && (!isValidIPv4(options.ip) || isUnusableAddress(options.ip))) {
    options.errors.push(`--ip "${options.ip ?? ''}" não é um endereço IPv4 de rede local válido (exemplo: --ip 192.168.0.10)`);
  }
  return options;
}

export function buildBanner({ ip, expoSdk, adminPassword, withExpoGo = true, qrSafari = '', qrExpo = '', platform = process.platform, title = 'WEBAG PRONTO. ABRA NO IPHONE (celular e computador no MESMO Wi-Fi)' }) {
  const indent = (qr) => (qr ? ['', ...qr.trimEnd().split('\n').map((row) => `        ${row}`), ''] : []);
  const web = `http://${ip}:${PORTS.app}`;
  const line = '='.repeat(72);
  const out = [
    '',
    line,
    `  ${title}`,
    line,
    '',
    '  1) No SAFARI do iPhone, digite este endereço:',
    '',
    `        ${web}`,
    ...indent(qrSafari),
    '     (ou aponte a câmera do iPhone para o QR code acima e toque em "Abrir no Safari")',
    '',
    '     Para ter o ícone do Webag na tela: botão Compartilhar (quadrado com seta)',
    '     > Adicionar à Tela de Início > Adicionar.',
    '     A 1ª abertura demora (o app é montado na hora); as seguintes são mais rápidas.',
    '',
  ];
  if (withExpoGo) {
    out.push(
      `  2) OPCIONAL, Expo Go (só se o Expo Go da App Store aceitar o SDK ${expoSdk}; senão ele avisa "incompatível" e você usa o Safari):`,
      '',
      `        exp://${ip}:${PORTS.app}`,
      ...indent(qrExpo),
      '     (abra o Expo Go e escaneie o QR code acima; o Expo Go precisa ser a versão que aceita o SDK do projeto)',
      '',
    );
  }
  out.push(
    '  3) Logins de demonstração (só desenvolvimento):',
    '        Cliente   cliente.ana@seed.webag.local            senha: webag-seed-lojista-2026',
    '        Lojista   lojista.mercadinho-boa-compra@seed.webag.local   mesma senha',
    '        (as senhas de cliente e lojista são públicas, só de demonstração)',
    `        Painéis   http://${ip}:${PORTS.web}/lojista/entrar   e   http://${ip}:${PORTS.web}/admin/entrar`,
    adminPassword
      ? `        Admin     admin@webag.local   senha: ${adminPassword}   (aleatória; também está em SEED_ADMIN_PASSWORD no .env)`
      : '        Admin     admin@webag.local   senha: a SEED_ADMIN_PASSWORD do seu .env (aleatória, gerada pelo setup)',
    '                  Cadastre o 2º fator (autenticador) JÁ NO PRIMEIRO login: sem isso, quem estiver no Wi-Fi pode cadastrar o dele antes de você. Passo a passo no README.',
    '',
    '  4) Como concluir uma compra de mentira (nada é cobrado):',
    '        Escolha a cidade > uma loja > produto > sacola > finalizar com PIX.',
    '        Na tela do PIX toque em "Simular pagamento": o pedido vira "Recebido".',
    '        (Alternativa pelo computador, em outro terminal: pnpm pagar)',
    '',
    '  Notas: a localização do iPhone não funciona em http (use a cidade ou o CEP); em Safari/atalho a sessão fica só na memória,',
    '  então ao recarregar a página você entra de novo. Para PARAR: Ctrl+C nesta janela.',
    '',
    '  Se o iPhone não abrir o endereço (fica carregando): confira o Wi-Fi (o mesmo do computador, não o de convidados nem dados móveis) e o firewall.',
    ...firewallHelp(platform),
    '',
    ...SAFETY_NOTICE.map((text) => `  ${text}`),
    line,
    '',
  );
  return out.join('\n');
}

/**
 * Opções do `spawn`. No Windows, `.cmd` (pnpm) exige shell; `docker` é `.exe` e NÃO deve passar pelo shell, porque o Node junta os
 * argumentos sem aspas e um argumento com espaço (ex.: a consulta do psql) vira vários. Com shell, argumento com espaço/aspas é erro.
 */
export function spawnOptions(command, args, platform = process.platform, extra = {}) {
  const shell = platform === 'win32' && command !== 'docker';
  if (shell) {
    const bad = args.find((arg) => /[\s"'&|<>^%()]/.test(String(arg)));
    if (bad !== undefined) throw new Error(`argumento inseguro para o shell do Windows em "${command}": ${JSON.stringify(bad)}`);
  }
  return { encoding: 'utf8', shell, ...extra };
}

/** `spawnSync` com as opções acima. `impl` e `platform` existem para o teste simular o Windows. */
export function makeRunner(impl = spawnSync, platform = process.platform, cwd = root) {
  return (command, args, options = {}) => impl(command, args, spawnOptions(command, args, platform, { cwd, ...options }));
}

/** O `.env` só é gravado fora do `--check`; a cópia `.env.bak` guarda o ORIGINAL e não é sobrescrita nas execuções seguintes. */
export function planEnvWrite({ check, changed, backupExists }) {
  const write = !check && changed.length > 0;
  return { write, backup: write && !backupExists };
}

/** Caminhos relativos dos scripts da página inicial do app (o bundle), para "esquentar" a montagem antes do aviso de pronto. */
export function findBundlePaths(html) {
  const paths = [];
  for (const match of String(html ?? '').matchAll(/<script\b[^>]*?\ssrc=["']([^"']+)["']/gi)) {
    const src = match[1].replace(/&amp;/g, '&');
    if (src.startsWith('/') && !src.startsWith('//')) paths.push(src);
  }
  return paths;
}

/** True se este arquivo é o executado (compara caminhos reais: link simbólico, junction e maiúscula da letra do drive no Windows). */
export function isMainModule(argv1, metaUrl, platform = process.platform) {
  if (!argv1) return false;
  try {
    const norm = (p) => (platform === 'win32' ? p.toLowerCase() : p);
    return norm(realpathSync.native(resolve(argv1))) === norm(realpathSync.native(fileURLToPath(metaUrl)));
  } catch {
    return false;
  }
}

/** Ajuda para porta ocupada. EACCES/EPERM no Windows quase sempre é faixa reservada pelo Hyper-V/WSL/Docker, que o netstat não mostra. */
export function portHelpLines(port, code, windows = isWindows) {
  if (windows && (code === 'EACCES' || code === 'EPERM')) {
    return [
      `A porta ${port} não está "em uso": o Windows a reservou (comum com Hyper-V, WSL e Docker Desktop), por isso o netstat não mostra nada.`,
      'Veja as faixas reservadas: netsh interface ipv4 show excludedportrange protocol=tcp',
      `Se a ${port} estiver numa faixa, abra o Prompt de Comando COMO ADMINISTRADOR e rode: net stop winnat  e depois  net start winnat   (depois reinicie o Docker Desktop e rode de novo).`,
    ];
  }
  return windows
    ? [`Para ver quem usa a porta ${port}: netstat -ano | findstr :${port}   (o último número é o PID; encerre com: taskkill /PID <número> /F)`]
    : [`Para ver quem usa a porta ${port}: lsof -nP -iTCP:${port} -sTCP:LISTEN   (encerre com: kill <PID>)`];
}

/** Como liberar o iPhone no firewall SEM abrir para outras redes (SEC-191). Nunca sugerir desligar o firewall. */
export function firewallHelp(platform = process.platform) {
  return platform === 'win32'
    ? [
        '  Windows: no aviso do Firewall marque só "Redes privadas". Se não abrir, no PowerShell COMO ADMINISTRADOR:',
        `    New-NetFirewallRule -DisplayName "Webag" -Direction Inbound -Protocol TCP -LocalPort ${Object.values(PORTS).join(',')} -Action Allow -Profile Private -RemoteAddress LocalSubnet`,
        '  ("Privada" é só para o Wi-Fi da sua casa; a regra acima só aceita aparelhos da sua rede local.)',
      ]
    : [
        '  macOS: Ajustes do Sistema > Rede > Firewall > Opções: permita conexões de entrada para o "node" (não desligue o firewall).',
        '  Se o macOS perguntar "Deseja permitir que o node aceite conexões de entrada?", clique em Permitir.',
      ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------------------------------------------------

const say = (message = '') => console.log(message);
const step = (message) => console.log(`[iphone] ${message}`);
const fail = (title, lines = []) => {
  console.error(`\n[iphone] PROBLEMA: ${title}`);
  for (const line of lines) console.error(`  ${line}`);
  console.error('');
  process.exit(1);
};

const run = makeRunner();

/** Endereço que o sistema usa para sair para a internet. Não envia nada: só pergunta ao sistema qual placa usaria. */
function detectRouteIp() {
  return new Promise((done) => {
    let finished = false;
    const socket = createSocket('udp4');
    const end = (value) => {
      if (finished) return;
      finished = true;
      try {
        socket.close();
      } catch {
        // já fechado
      }
      done(value);
    };
    const timer = setTimeout(() => end(undefined), 1500);
    socket.on('error', () => end(undefined));
    try {
      socket.connect(53, '1.1.1.1', () => {
        clearTimeout(timer);
        end(socket.address().address);
      });
    } catch {
      end(undefined);
    }
  });
}

/** QR code para o terminal (usa o pacote `qrcode` que o apps/web já tem; sem ele, o endereço em texto basta). */
async function makeQr(text) {
  try {
    const qrcode = createRequire(resolve(root, 'apps/web/package.json'))('qrcode');
    return await qrcode.toString(text, { type: 'terminal', small: true });
  } catch {
    return '';
  }
}

/** Devolve `{ free: true }` ou `{ free: false, code }` (EADDRINUSE = em uso; EACCES = reservada pelo sistema, comum no Windows). */
function checkPort(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', (error) => done({ free: false, code: error?.code }));
    server.once('listening', () => server.close(() => done({ free: true })));
    server.listen(port, '0.0.0.0');
  });
}

function httpGet(url, timeout = 2000) {
  return new Promise((done) => {
    const req = request(url, { method: 'GET', timeout }, (res) => {
      res.resume();
      done(res.statusCode ?? 0);
    });
    req.on('timeout', () => {
      req.destroy();
      done(0);
    });
    req.on('error', () => done(0));
    req.end();
  });
}

/** GET que devolve o texto (para a página inicial do app, que é pequena). */
function httpGetText(url, timeout = 60_000) {
  return new Promise((done) => {
    const req = request(url, { method: 'GET', timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (body.length < 200_000) body += chunk;
      });
      res.on('end', () => done({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => {
      req.destroy();
      done({ status: 0, body: '' });
    });
    req.on('error', () => done({ status: 0, body: '' }));
    req.end();
  });
}

/** Pede a página e o bundle do app uma vez, para o Metro montá-lo ANTES de o Safari pedir (a 1ª montagem leva minutos). */
async function warmUpApp(limitMs) {
  const deadline = Date.now() + limitMs;
  const base = `http://127.0.0.1:${PORTS.app}`;
  const page = await httpGetText(`${base}/`, limitMs);
  if (page.status !== 200) return false;
  const paths = findBundlePaths(page.body).slice(0, 3);
  if (paths.length === 0) return false;
  for (const path of paths) {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    const status = await httpGet(`${base}${path}`, left);
    if (status !== 200) return false;
  }
  return true;
}

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    say('Uso: pnpm iphone [--ip 192.168.0.10] [--check]\n  --ip <IPv4>  usa este endereço em vez do detectado\n  --check      só confere tudo e mostra o que mudaria; NÃO altera o .env nem sobe nada');
    return;
  }
  if (options.errors.length > 0) fail(options.errors[0], ['Uso: pnpm iphone [--ip 192.168.0.10] [--check]']);
  say('');
  for (const text of SAFETY_NOTICE) say(`[iphone] ${text}`);
  say('');

  // 1. Pré-requisitos
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    fail(`o Node é muito antigo (${process.versions.node}); o Webag pede 22.12 ou mais novo (o recomendado é o 24).`, ['Instale o Node 24 em https://nodejs.org (escolha a versão 24 explicitamente) e abra um terminal novo.']);
  }
  if (!existsSync(resolve(root, 'node_modules'))) fail('as dependências ainda não foram instaladas.', ['Rode: pnpm install', 'Depois: pnpm run setup']);
  const envFile = resolve(root, '.env');
  if (!existsSync(envFile)) fail('o arquivo .env não existe: o setup ainda não foi feito.', ['Rode: pnpm run setup   (uma vez só)', 'Depois: pnpm iphone']);

  // 2. Endereço da máquina na rede local
  let ip = options.ip;
  if (ip) {
    step(`usando o endereço informado: ${ip}`);
  } else {
    const candidates = rankCandidates(networkInterfaces(), await detectRouteIp());
    if (candidates.length === 0) {
      fail('não achei o endereço deste computador na rede local (sem Wi-Fi/cabo conectado?).', [
        'Conecte o computador ao mesmo Wi-Fi do iPhone e rode de novo.',
        'Se você sabe o endereço, informe: pnpm iphone --ip 192.168.0.10',
        isWindows ? 'Para descobrir: ipconfig  (linha "Endereço IPv4" do Wi-Fi)' : 'Para descobrir: macOS: ipconfig getifaddr en0   Linux: hostname -I',
      ]);
    }
    ip = candidates[0].ip;
    step(`rede escolhida: ${ip} (${candidates[0].name})`);
    if (candidates.length > 1) {
      step(`atenção: há outras redes (${candidates.slice(1).map((c) => `${c.ip} em ${c.name}`).join('; ')}). Se o iPhone não abrir, rode: pnpm iphone --ip <o endereço do seu Wi-Fi>`);
    }
  }

  // 3. .env: só endereços, com backup e sem sobrescrever o resto
  const before = readFileSync(envFile, 'utf8');
  const current = parseEnv(before);
  const { text: after, changed } = mergeEnvText(before, envUpdates(ip, current.CORS_ORIGINS, current.S3_BUCKET_PUBLIC));
  const backupFile = resolve(root, '.env.bak');
  const plan = planEnvWrite({ check: options.check, changed, backupExists: existsSync(backupFile) });
  if (plan.write) {
    if (plan.backup) copyFileSync(envFile, backupFile);
    writeFileSync(envFile, after);
    step(`.env atualizado (${plan.backup ? 'cópia do original em .env.bak' : '.env.bak já guarda o original e foi mantido'}): ${changed.join(', ')}`);
  } else if (changed.length > 0) {
    step(`--check: o .env NÃO foi alterado. O "pnpm iphone" vai atualizar: ${changed.join(', ')}`);
  } else {
    step('.env já estava certo para este endereço');
  }
  if ((current.PAYMENT_PROVIDER ?? 'fake') !== 'fake') {
    step('AVISO: PAYMENT_PROVIDER no .env não é "fake"; o botão "Simular pagamento" só funciona com o provedor simulado.');
  }

  // 4. Docker e banco
  if (process.env.SKIP_DOCKER === '1') {
    step('SKIP_DOCKER=1: usando Postgres e Redis que já estão rodando');
  } else {
    if (run('docker', ['compose', 'version'], { stdio: 'ignore' }).status !== 0) {
      fail('o Docker não está instalado.', ['Instale o Docker Desktop (https://www.docker.com/products/docker-desktop/), abra o programa e espere ele ficar pronto.', 'Depois rode de novo: pnpm iphone']);
    }
    if (run('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
      fail('o Docker está instalado, mas fechado.', [
        isWindows || process.platform === 'darwin'
          ? 'Abra o Docker Desktop e espere o ícone da baleia parar de se mexer (1 a 2 minutos); depois rode de novo: pnpm iphone'
          : 'Inicie o serviço: sudo systemctl start docker; depois rode de novo: pnpm iphone',
      ]);
    }
    const running = new Set((run('docker', ['compose', 'ps', '--status', 'running', '--services']).stdout ?? '').split(/\s+/).filter(Boolean));
    const plan = dockerUpPlan({ running, check: options.check });
    if (plan.services.length > 0) {
      step(`subindo no Docker: ${plan.services.join(', ')} (os dados anteriores são mantidos${plan.env.STORAGE_BIND ? '; o armazenamento é recriado para abrir só a porta 9000 de fotos na rede' : ''})...`);
      const up = run('docker', ['compose', 'up', '-d', '--wait', ...plan.services], { stdio: 'inherit', env: { ...process.env, ...plan.env } });
      if (up.status !== 0) {
        fail('o Docker não conseguiu subir o banco e os serviços de apoio.', [
          'Veja a mensagem acima. Causa mais comum: a porta 5432 (Postgres) ou 6379 (Redis) já é usada por outro programa.',
          'Se for a primeira vez neste computador, rode antes: pnpm run setup',
        ]);
      }
    }
    const users = run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', current.POSTGRES_USER ?? 'webag', '-d', current.POSTGRES_DB ?? 'webag', '-tAc', 'select count(*) from users']);
    if (users.status !== 0 || Number((users.stdout ?? '').trim()) < 1) {
      fail('o banco está vazio (o setup ainda não foi feito neste computador).', ['Rode: pnpm run setup', 'Depois: pnpm iphone']);
    }
    if (plan.env.STORAGE_BIND) {
      const published = (run('docker', ['compose', 'port', 'storage', '9000']).stdout ?? '').trim();
      if (published && !/^(0\.0\.0\.0|\[::\]):9000/.test(published)) {
        step(`AVISO: a porta 9000 (fotos) ainda está publicada só em ${published}; as fotos das lojas não vão carregar no iPhone. Rode: pnpm infra:down e depois pnpm iphone de novo.`);
      }
    }
    step('Docker e banco de dados no ar, com os dados de demonstração');
  }

  // Migrações pendentes (depois de um `git pull` o banco pode estar atrás do código; é seguro repetir)
  step('conferindo as migrações do banco...');
  const migrate = run('pnpm', ['--filter', '@webag/api', 'db:migrate'], { stdio: 'pipe' });
  if (migrate.status !== 0) {
    fail('não consegui atualizar o banco de dados.', [(migrate.stderr || migrate.stdout || '').trim().split('\n').slice(-6).join('\n  '), 'Se for a primeira vez neste computador, rode antes: pnpm run setup']);
  }

  // 5. Portas
  const busy = [];
  for (const label of ['api', 'web', 'app']) {
    const result = await checkPort(PORTS[label]);
    if (!result.free) busy.push({ label, port: PORTS[label], code: result.code });
  }
  if (busy.length > 0) {
    const names = { api: 'a API', web: 'o site e os painéis', app: 'o app (Metro)' };
    const alive = await httpGet(`http://127.0.0.1:${PORTS.api}/health`);
    const reserved = busy.some((b) => b.code === 'EACCES' || b.code === 'EPERM');
    fail(`as portas ${busy.map((b) => b.port).join(', ')} já estão em uso ou bloqueadas (${busy.map((b) => names[b.label]).join(', ')}).`, [
      alive === 200 ? 'Provavelmente o Webag já está rodando em outra janela (um `pnpm dev` ou `pnpm iphone` anterior). Feche essa janela (Ctrl+C) e rode de novo.' : reserved ? 'O sistema não deixou o Webag usar essas portas.' : 'Outro programa está usando essas portas. Feche-o e rode de novo.',
      ...portHelpLines(busy[0].port, busy[0].code),
    ]);
  }
  step('portas 3000, 3001 e 8081 livres');

  const expoSdk = String(JSON.parse(readFileSync(resolve(root, 'apps/mobile/package.json'), 'utf8')).dependencies?.expo ?? '').replace(/^\D*(\d+).*/, '$1');

  const qrSafari = await makeQr(`http://${ip}:${PORTS.app}`);
  const qrExpo = await makeQr(`exp://${ip}:${PORTS.app}`);

  if (options.check) {
    say(buildBanner({ ip, expoSdk, adminPassword: current.SEED_ADMIN_PASSWORD, qrSafari, qrExpo, title: 'CONFERIDO (nada foi iniciado). Quando subir, o endereço do iPhone será este:' }));
    step('--check: tudo conferido; nada foi iniciado. Para subir: pnpm iphone');
    return;
  }

  // 6. Sobe tudo (mesmo caminho do `pnpm dev`)
  step('subindo API, site/painéis e app... (a primeira vez demora; aguarde a mensagem "WEBAG PRONTO")');
  const devArgs = ['dev', '--env-mode=loose'];
  const child = spawn('pnpm', devArgs, {
    ...spawnOptions('pnpm', devArgs),
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Metro mostra o endereço da rede (e não "localhost") no QR do Expo Go.
      REACT_NATIVE_PACKAGER_HOSTNAME: ip,
      // O painel (Next) não lê o .env da raiz: o tempo real do lojista e a liberação do acesso pelo IP vão por aqui.
      REALTIME_URL: `http://${ip}:${PORTS.api}`,
      STORAGE_ORIGIN: `http://${ip}:${PORTS.storage}`,
      WEBAG_DEV_HOST: ip,
    },
  });
  let stopping = false;
  child.on('error', (error) => fail(`não consegui executar o "pnpm": ${error.message}`, ['Confirme com: pnpm --version (instale com: npm install -g pnpm@10.28.0)']));
  child.on('exit', (code) => {
    say(`\n[iphone] Webag parado${stopping ? '' : ` (código ${code ?? '?'})`}. O banco continua no Docker; para desligá-lo: pnpm infra:down`);
    process.exit(stopping ? 0 : (code ?? 1));
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stopping = true;
      child.kill(signal);
    });
  }

  // 7. Espera ficar pronto e imprime o recado final
  const until = Date.now() + 5 * 60_000;
  const ready = { api: false, web: false, app: false };
  while (Date.now() < until && !Object.values(ready).every(Boolean)) {
    await sleep(2000);
    ready.api ||= (await httpGet(`http://127.0.0.1:${PORTS.api}/health`)) === 200;
    ready.web ||= (await httpGet(`http://127.0.0.1:${PORTS.web}/`, 8000)) > 0;
    ready.app ||= (await httpGet(`http://127.0.0.1:${PORTS.app}/status`)) === 200;
  }
  if (!Object.values(ready).every(Boolean)) {
    const waiting = Object.entries(ready).filter(([, ok]) => !ok).map(([name]) => ({ api: 'API (3000)', web: 'site (3001)', app: 'app (8081)' })[name]);
    say(`\n[iphone] AVISO: depois de 5 minutos ainda não responderam: ${waiting.join(', ')}. Veja as mensagens de erro acima.`);
    return;
  }
  // "PRONTO" só depois de o bundle do app estar montado: o 1º pedido do Safari dispararia a montagem (minutos) e a página ficaria em branco.
  step('montando o app para o Safari (na 1ª vez leva de 1 a 4 minutos; só depois aparece o recado "WEBAG PRONTO")...');
  const warmed = await warmUpApp(WARMUP_MS);
  if (!warmed) {
    say(`\n[iphone] AVISO: o app ainda não terminou de ser montado (passaram ${WARMUP_MS / 60_000} minutos ou ele deu erro; veja as mensagens acima). A 1ª abertura no iPhone pode demorar ou ficar em branco: espere um pouco e recarregue a página.`);
  }
  say(buildBanner({ ip, expoSdk, adminPassword: current.SEED_ADMIN_PASSWORD, qrSafari, qrExpo, title: warmed ? undefined : 'WEBAG NO AR (o app ainda pode estar sendo montado). ABRA NO IPHONE (celular e computador no MESMO Wi-Fi)' }));
}

if (isMainModule(process.argv[1], import.meta.url)) {
  main().catch((error) => fail(`erro inesperado: ${error?.message ?? error}`));
}

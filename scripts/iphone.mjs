#!/usr/bin/env node
// `pnpm iphone`: deixa o Webag pronto para abrir no iPhone (Safari) pela rede Wi-Fi da sua casa e sobe tudo.
//   1. descobre o endereço (IPv4) deste computador na rede local (macOS, Windows e Linux; ignora Docker, VPN e redes virtuais);
//   2. grava no `.env` (com cópia em `.env.bak`, de forma idempotente) só os ENDEREÇOS que o celular precisa; nenhum segredo é lido nem escrito;
//   3. confere Docker, banco e portas 3000, 3001 e 8081;
//   4. sobe API + site/painéis + app (reaproveita `pnpm dev`) e imprime o endereço para o Safari, os logins e como simular o pagamento.
// Uso: pnpm iphone [--ip 192.168.0.10] [--check] [--help]
//   --ip <IPv4>  usa este endereço em vez do detectado (se houver mais de uma rede, ou se a detecção errar)
//   --check      só prepara o `.env` e confere tudo; não sobe nada (bom para testar)
// Variáveis: SKIP_DOCKER=1 (Postgres/Redis seus, como no `pnpm run setup`).
import { spawn, spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
export const PORTS = { api: 3000, web: 3001, app: 8081, storage: 9000 };

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

export function buildBanner({ ip, expoSdk, withExpoGo = true, qrSafari = '', qrExpo = '', title = 'WEBAG PRONTO. ABRA NO IPHONE (celular e computador no MESMO Wi-Fi)' }) {
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
    `        Painéis   http://${ip}:${PORTS.web}/lojista/entrar   e   /admin/entrar (admin@webag.local, pede 2º fator: veja o README)`,
    '',
    '  4) Como concluir uma compra de mentira (nada é cobrado):',
    '        Escolha a cidade > uma loja > produto > sacola > finalizar com PIX.',
    '        Na tela do PIX toque em "Simular pagamento": o pedido vira "Recebido".',
    '        (Alternativa pelo computador, em outro terminal: pnpm pagar)',
    '',
    '  Notas: a localização do iPhone não funciona em http (use a cidade ou o CEP); em Safari/atalho a sessão fica só na memória,',
    '  então ao recarregar a página você entra de novo. Para PARAR: Ctrl+C nesta janela.',
    line,
    '',
  );
  return out.join('\n');
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

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: isWindows, ...options });
}

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

function isPortFree(port) {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.once('listening', () => server.close(() => done(true)));
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

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function portHelp(port) {
  return isWindows
    ? [`Para ver quem usa a porta ${port}: netstat -ano | findstr :${port}   (o último número é o PID; encerre com: taskkill /PID <número> /F)`]
    : [`Para ver quem usa a porta ${port}: lsof -nP -iTCP:${port} -sTCP:LISTEN   (encerre com: kill <PID>)`];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    say('Uso: pnpm iphone [--ip 192.168.0.10] [--check]\n  --ip <IPv4>  usa este endereço em vez do detectado\n  --check      só prepara o .env e confere tudo; não sobe nada');
    return;
  }
  if (options.errors.length > 0) fail(options.errors[0], ['Uso: pnpm iphone [--ip 192.168.0.10] [--check]']);

  // 1. Pré-requisitos
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    fail(`o Node é muito antigo (${process.versions.node}); o Webag pede 22.12 ou mais novo (o recomendado é o 24).`, ['Instale o Node LTS em https://nodejs.org e abra um terminal novo.']);
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
  if (changed.length > 0) {
    copyFileSync(envFile, resolve(root, '.env.bak'));
    writeFileSync(envFile, after);
    step(`.env atualizado (cópia do anterior em .env.bak): ${changed.join(', ')}`);
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
    const needed = ['postgres', 'redis', 'mailpit', 'storage'].filter((service) => !running.has(service));
    if (needed.length > 0) {
      step(`subindo no Docker: ${needed.join(', ')} (os dados anteriores são mantidos)...`);
      const up = run('docker', ['compose', 'up', '-d', '--wait', ...needed], { stdio: 'inherit' });
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
  for (const label of ['api', 'web', 'app']) if (!(await isPortFree(PORTS[label]))) busy.push({ label, port: PORTS[label] });
  if (busy.length > 0) {
    const names = { api: 'a API', web: 'o site e os painéis', app: 'o app (Metro)' };
    const alive = await httpGet(`http://127.0.0.1:${PORTS.api}/health`);
    fail(`as portas ${busy.map((b) => b.port).join(', ')} já estão em uso (${busy.map((b) => names[b.label]).join(', ')}).`, [
      alive === 200 ? 'Provavelmente o Webag já está rodando em outra janela (um `pnpm dev` ou `pnpm iphone` anterior). Feche essa janela (Ctrl+C) e rode de novo.' : 'Outro programa está usando essas portas. Feche-o e rode de novo.',
      ...portHelp(busy[0].port),
    ]);
  }
  step('portas 3000, 3001 e 8081 livres');

  const expoSdk = String(JSON.parse(readFileSync(resolve(root, 'apps/mobile/package.json'), 'utf8')).dependencies?.expo ?? '').replace(/^\D*(\d+).*/, '$1');

  const qrSafari = await makeQr(`http://${ip}:${PORTS.app}`);
  const qrExpo = await makeQr(`exp://${ip}:${PORTS.app}`);

  if (options.check) {
    say(buildBanner({ ip, expoSdk, qrSafari, qrExpo, title: 'CONFERIDO (nada foi iniciado). Quando subir, o endereço do iPhone será este:' }));
    step('--check: tudo conferido; nada foi iniciado. Para subir: pnpm iphone');
    return;
  }

  // 6. Sobe tudo (mesmo caminho do `pnpm dev`)
  step('subindo API, site/painéis e app... (a primeira vez demora; aguarde a mensagem "WEBAG PRONTO")');
  const child = spawn('pnpm', ['dev', '--env-mode=loose'], {
    cwd: root,
    stdio: 'inherit',
    shell: isWindows,
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
  child.on('error', (error) => fail(`não consegui executar o "pnpm": ${error.message}`, ['Confirme com: pnpm --version (instale com: corepack enable)']));
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
  say(buildBanner({ ip, expoSdk, qrSafari, qrExpo }));
  say('Se o iPhone não abrir o endereço (fica carregando): confira o Wi-Fi e o firewall.');
  say(
    isWindows
      ? '  Windows: Segurança do Windows > Firewall > Permitir um aplicativo > Node.js, marcando "Privada"; ou, no PowerShell como administrador:\n    New-NetFirewallRule -DisplayName "Webag" -Direction Inbound -Protocol TCP -LocalPort 3000,3001,8081,9000 -Action Allow -Profile Private'
      : '  macOS: Ajustes do Sistema > Rede > Firewall: permitir conexões de entrada para o "node" (ou desligue o firewall só durante o teste).',
  );
  say('  Também confira: iPhone no MESMO Wi-Fi (não use "Wi-Fi de convidados" nem dados móveis) e o Wi-Fi do computador como rede "Privada".\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(`erro inesperado: ${error?.message ?? error}`));
}

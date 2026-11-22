// Testes das funções puras do `pnpm iphone`. Rodar: node --test scripts/iphone.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SAFETY_NOTICE,
  buildBanner,
  dockerUpPlan,
  envUpdates,
  findBundlePaths,
  firewallHelp,
  isMainModule,
  isUnusableAddress,
  isValidIPv4,
  makeRunner,
  mergeCors,
  mergeEnvText,
  parseArgs,
  parseEnv,
  planEnvWrite,
  portHelpLines,
  rankCandidates,
  spawnOptions,
} from './iphone.mjs';

const nic = (address, internal = false) => ({ address, family: 'IPv4', internal });

test('escolhe o Wi-Fi da casa e ignora Docker, VPN, WSL e túneis', () => {
  const interfaces = {
    lo: [nic('127.0.0.1', true)],
    docker0: [nic('172.17.0.1')],
    'br-1a2b3c': [nic('172.18.0.1')],
    tailscale0: [nic('100.101.102.103')],
    utun4: [nic('10.8.0.2')],
    'vEthernet (WSL)': [nic('172.28.64.1')],
    'VirtualBox Host-Only Network': [nic('192.168.56.1')],
    'Wi-Fi': [nic('192.168.0.15')],
    en5: [nic('169.254.10.2')],
  };
  const ranked = rankCandidates(interfaces, undefined);
  assert.deepEqual(ranked.map((c) => c.ip), ['192.168.0.15']);
});

test('macOS: en0 vence en1 e a rota principal desempata', () => {
  const interfaces = { en0: [nic('192.168.1.20')], en1: [nic('10.0.0.5')] };
  assert.equal(rankCandidates(interfaces)[0].ip, '192.168.1.20');
  assert.equal(rankCandidates(interfaces, '10.0.0.5')[0].ip, '10.0.0.5');
});

test('Windows com Wi-Fi e Ethernet: Wi-Fi na frente; sem candidatos devolve lista vazia', () => {
  const interfaces = { Ethernet: [nic('192.168.0.9')], 'Wi-Fi': [nic('192.168.0.15')], 'Local Area Connection': [nic('10.1.1.1')] };
  const ranked = rankCandidates(interfaces);
  assert.equal(ranked[0].name, 'Wi-Fi');
  assert.ok(ranked.some((c) => c.name === 'Local Area Connection'));
  assert.deepEqual(rankCandidates({ lo: [nic('127.0.0.1', true)] }), []);
});

test('endereços válidos e inválidos', () => {
  assert.ok(isValidIPv4('192.168.0.10'));
  assert.ok(!isValidIPv4('192.168.0'));
  assert.ok(!isValidIPv4('300.1.1.1'));
  assert.ok(isUnusableAddress('127.0.0.1'));
  assert.ok(isUnusableAddress('169.254.1.1'));
  assert.ok(!isUnusableAddress('192.168.0.10'));
  assert.ok(!isUnusableAddress('172.20.0.4'));
});

test('argumentos', () => {
  assert.equal(parseArgs(['--ip', '192.168.0.10']).ip, '192.168.0.10');
  assert.equal(parseArgs(['--ip=10.0.0.4', '--check']).check, true);
  assert.equal(parseArgs(['--ip', 'abc']).errors.length, 1);
  assert.equal(parseArgs(['--ip', '127.0.0.1']).errors.length, 1);
  assert.equal(parseArgs(['--foo']).errors.length, 1);
});

test('CORS: mantém o que já existe e acrescenta o do iPhone, sem repetir', () => {
  const once = mergeCors('http://localhost:3001,https://meu.site', '192.168.0.10');
  assert.ok(once.startsWith('http://localhost:3001,https://meu.site'));
  for (const origin of ['http://192.168.0.10:8081', 'http://192.168.0.10:3001', 'http://localhost:8081', 'http://localhost:3101']) assert.ok(once.split(',').includes(origin), origin);
  assert.equal(mergeCors(once, '192.168.0.10'), once);
});

test('.env: troca as linhas, acrescenta o que falta, preserva o resto e é idempotente', () => {
  const original = ['# comentário', 'JWT_ACCESS_SECRET=nao-mexer', 'EXPO_PUBLIC_API_URL=http://localhost:3000', '# EXPO_PUBLIC_WEB_URL=http://localhost:3001', 'CORS_ORIGINS=http://localhost:3001', ''].join('\n');
  const updates = envUpdates('192.168.0.10', parseEnv(original).CORS_ORIGINS);
  const first = mergeEnvText(original, updates);
  assert.ok(first.text.includes('JWT_ACCESS_SECRET=nao-mexer'));
  assert.ok(first.text.includes('# EXPO_PUBLIC_WEB_URL=http://localhost:3001'));
  const parsed = parseEnv(first.text);
  assert.equal(parsed.EXPO_PUBLIC_API_URL, 'http://192.168.0.10:3000');
  assert.equal(parsed.EXPO_PUBLIC_WEB_URL, 'http://192.168.0.10:3001');
  assert.equal(parsed.WEB_PUBLIC_URL, 'http://192.168.0.10:3001');
  assert.ok(parsed.CORS_ORIGINS.includes('http://192.168.0.10:8081'));
  const second = mergeEnvText(first.text, envUpdates('192.168.0.10', parseEnv(first.text).CORS_ORIGINS));
  assert.equal(second.text, first.text);
  assert.deepEqual(second.changed, []);
});

test('.env com final de linha do Windows (CRLF) continua CRLF', () => {
  const merged = mergeEnvText('A=1\r\nEXPO_PUBLIC_API_URL=x\r\n', { EXPO_PUBLIC_API_URL: 'y', NOVO: 'z' });
  assert.ok(!/[^\r]\n/.test(merged.text));
  assert.equal(parseEnv(merged.text).EXPO_PUBLIC_API_URL, 'y');
  assert.equal(parseEnv(merged.text).NOVO, 'z');
});

test('recado final traz o endereço do Safari, logins e o botão de simular', () => {
  const banner = buildBanner({ ip: '192.168.0.10', expoSdk: '58' });
  assert.ok(banner.includes('http://192.168.0.10:8081'));
  assert.ok(banner.includes('cliente.ana@seed.webag.local'));
  assert.ok(banner.includes('Simular pagamento'));
  assert.ok(banner.includes('exp://192.168.0.10:8081'));
});

test('Windows: docker roda SEM shell e a consulta do psql chega como 1 argumento só', () => {
  const calls = [];
  const run = makeRunner((command, args, options) => (calls.push({ command, args, options }), { status: 0, stdout: '1' }), 'win32', 'C:\\webag');
  const query = 'select count(*) from users';
  run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'webag', '-d', 'webag', '-tAc', query]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].args.filter((arg) => arg === query).length, 1);
  run('pnpm', ['--filter', '@webag/api', 'db:migrate']);
  assert.equal(calls[1].options.shell, true);
});

test('Windows: nenhuma chamada com shell recebe argumento com espaço ou aspas', () => {
  assert.throws(() => spawnOptions('pnpm', ['run', 'select count(*) from users'], 'win32'), /inseguro/);
  assert.throws(() => spawnOptions('pnpm', ['say "oi"'], 'win32'), /inseguro/);
  assert.equal(spawnOptions('pnpm', ['dev', '--env-mode=loose'], 'win32').shell, true);
  assert.equal(spawnOptions('docker', ['exec', 'a b'], 'win32').shell, false);
  assert.equal(spawnOptions('pnpm', ['dev'], 'linux').shell, false);
  assert.equal(spawnOptions('pnpm', ['x y'], 'darwin').shell, false);
});

test('--check não grava o .env; fora do --check grava e só cria .env.bak uma vez', () => {
  assert.deepEqual(planEnvWrite({ check: true, changed: ['A'], backupExists: false }), { write: false, backup: false });
  assert.deepEqual(planEnvWrite({ check: false, changed: [], backupExists: false }), { write: false, backup: false });
  assert.deepEqual(planEnvWrite({ check: false, changed: ['A'], backupExists: false }), { write: true, backup: true });
  assert.deepEqual(planEnvWrite({ check: false, changed: ['A'], backupExists: true }), { write: true, backup: false });
});

test('guard de execução funciona por link simbólico e recusa outro arquivo', () => {
  const self = fileURLToPath(new URL('./iphone.mjs', import.meta.url));
  const dir = mkdtempSync(join(tmpdir(), 'webag-iphone-'));
  try {
    const link = join(dir, 'iphone-link.mjs');
    symlinkSync(self, link);
    assert.ok(isMainModule(self, import.meta.url.replace('iphone.test.mjs', 'iphone.mjs')));
    assert.ok(isMainModule(link, new URL('./iphone.mjs', import.meta.url).href));
    assert.ok(!isMainModule(fileURLToPath(import.meta.url), new URL('./iphone.mjs', import.meta.url).href));
    assert.ok(!isMainModule(undefined, import.meta.url));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('porta reservada no Windows (EACCES) aponta o netsh; porta em uso aponta o netstat', () => {
  const reserved = portHelpLines(8081, 'EACCES', true).join('\n');
  assert.ok(reserved.includes('netsh interface ipv4 show excludedportrange protocol=tcp'));
  assert.ok(portHelpLines(8081, 'EADDRINUSE', true).join('\n').includes('netstat'));
  assert.ok(portHelpLines(8081, 'EADDRINUSE', false).join('\n').includes('lsof'));
});

test('acha o bundle na página do app (só caminhos do próprio Metro)', () => {
  const html = '<script src="/node_modules/expo-router/entry.bundle?platform=web&amp;dev=true" defer></script><script src="https://cdn.exemplo/x.js"></script><script>1</script>';
  assert.deepEqual(findBundlePaths(html), ['/node_modules/expo-router/entry.bundle?platform=web&dev=true']);
  assert.deepEqual(findBundlePaths(''), []);
});

test('SEC-191: aviso de "só no Wi-Fi de casa" com as portas no recado final; firewall restrito, sem "desligue"', () => {
  assert.ok(SAFETY_NOTICE.join(' ').includes('SÓ no Wi-Fi da sua casa'));
  for (const platform of ['win32', 'darwin']) {
    const banner = buildBanner({ ip: '192.168.0.10', expoSdk: '58', platform });
    assert.ok(banner.includes('SÓ no Wi-Fi da sua casa'));
    assert.ok(banner.includes('3000') && banner.includes('9000'));
    assert.ok(!/(?<!não )desligue o firewall/i.test(banner));
  }
  assert.ok(firewallHelp('win32').join('\n').includes('-Profile Private -RemoteAddress LocalSubnet'));
  assert.ok(firewallHelp('darwin').join('\n').includes('"node"'));
});

test('SEC-190: fora do --check o armazenamento é sempre recriado com STORAGE_BIND=0.0.0.0; no --check nada abre na rede', () => {
  const all = new Set(['postgres', 'redis', 'mailpit', 'storage']);
  assert.deepEqual(dockerUpPlan({ running: all }), { services: ['storage'], env: { STORAGE_BIND: '0.0.0.0' } });
  assert.deepEqual(dockerUpPlan({ running: new Set() }).services, ['postgres', 'redis', 'mailpit', 'storage']);
  assert.deepEqual(dockerUpPlan({ running: new Set(['postgres', 'storage']) }).services, ['redis', 'mailpit', 'storage']);
  assert.deepEqual(dockerUpPlan({ running: all, check: true }), { services: [], env: {} });
  assert.deepEqual(dockerUpPlan({ running: new Set(['redis']), check: true }), { services: ['postgres', 'mailpit', 'storage'], env: {} });
});

test('SEC-190: o aviso diz que só 3000, 3001, 8081 e 9000 ficam na rede', () => {
  assert.ok(SAFETY_NOTICE.join(' ').includes('banco, Redis, e-mail de teste e console do armazenamento só abrem neste computador'));
});

test('SEC-192: recado mostra a senha aleatória do admin, o 2º fator no 1º login e as senhas públicas de lojista e cliente', () => {
  const banner = buildBanner({ ip: '192.168.0.10', expoSdk: '58', adminPassword: 'Wb-exemplo-7' });
  assert.ok(banner.includes('senha: Wb-exemplo-7'));
  assert.ok(banner.includes('SEED_ADMIN_PASSWORD'));
  assert.ok(banner.includes('2º fator'));
  assert.ok(banner.includes('públicas'));
  assert.ok(!banner.includes('Webag-Admin-Dev-2026'));
  const sem = buildBanner({ ip: '192.168.0.10', expoSdk: '58' });
  assert.ok(sem.includes('SEED_ADMIN_PASSWORD do seu .env'));
});

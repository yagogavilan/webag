// Testes das funções puras do `pnpm iphone`. Rodar: node --test scripts/iphone.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBanner, envUpdates, isUnusableAddress, isValidIPv4, mergeCors, mergeEnvText, parseArgs, parseEnv, rankCandidates } from './iphone.mjs';

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

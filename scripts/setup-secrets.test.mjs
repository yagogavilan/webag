// Testes dos segredos do setup. Rodar: node --test scripts/setup-secrets.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { applyDevSecrets, generateDevSecrets, useFixedDevSecrets } from './setup-secrets.mjs';

const example = readFileSync(new URL('../infra/env.example', import.meta.url), 'utf8');
const value = (text, key) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1];

test('gera segredos diferentes a cada chamada, só com caracteres seguros para URL e .env', () => {
  const a = generateDevSecrets();
  const b = generateDevSecrets();
  for (const key of Object.keys(a)) {
    assert.notEqual(a[key], b[key], key);
    assert.match(a[key], /^[A-Za-z0-9_-]+$/, key);
  }
  assert.ok(a.postgresPassword.length >= 32 && a.s3SecretKey.length >= 32 && a.adminPassword.length >= 24);
  assert.match(a.adminPassword, /[A-Z]/);
  assert.match(a.adminPassword, /[a-z]/);
  assert.match(a.adminPassword, /\d/);
  assert.match(a.adminPassword, /-/);
});

test('troca as credenciais fixas do env.example e mantém o resto da URL', () => {
  const secrets = generateDevSecrets();
  const out = applyDevSecrets(example, secrets);
  assert.equal(value(out, 'POSTGRES_PASSWORD'), secrets.postgresPassword);
  assert.equal(value(out, 'DATABASE_URL'), `postgresql://webag:${secrets.postgresPassword}@localhost:5432/webag`);
  assert.equal(value(out, 'REDIS_PASSWORD'), secrets.redisPassword);
  assert.equal(value(out, 'REDIS_URL'), `redis://:${secrets.redisPassword}@localhost:6379`);
  assert.equal(value(out, 'S3_ACCESS_KEY'), secrets.s3AccessKey);
  assert.equal(value(out, 'S3_SECRET_KEY'), secrets.s3SecretKey);
  assert.equal(value(out, 'SEED_ADMIN_PASSWORD'), secrets.adminPassword);
  assert.ok(!out.includes('webag_dev_only') && !out.includes('webag-dev-secret-only') && !out.includes('Webag-Admin-Dev-2026'));
  // o que não é segredo não muda
  assert.equal(value(out, 'S3_ENDPOINT'), 'http://localhost:9000');
  assert.equal(value(out, 'SEED_ADMIN_EMAIL'), 'admin@webag.local');
});

test('acrescenta a chave que faltar e não duplica ao aplicar de novo', () => {
  const secrets = generateDevSecrets();
  const once = applyDevSecrets('REDIS_URL=redis://localhost:6379\n', secrets);
  assert.equal(value(once, 'REDIS_PASSWORD'), secrets.redisPassword);
  const twice = applyDevSecrets(once, secrets);
  assert.equal(twice.match(/^REDIS_PASSWORD=/gm)?.length, 1);
  assert.equal(value(twice, 'REDIS_URL'), `redis://:${secrets.redisPassword}@localhost:6379`);
});

test('CI e WEBAG_FIXED_DEV_SECRETS=1 mantêm os valores fixos', () => {
  assert.equal(useFixedDevSecrets({}), false);
  assert.equal(useFixedDevSecrets({ CI: 'true' }), true);
  assert.equal(useFixedDevSecrets({ CI: '1' }), true);
  assert.equal(useFixedDevSecrets({ WEBAG_FIXED_DEV_SECRETS: '1' }), true);
  assert.equal(useFixedDevSecrets({ CI: 'false' }), false);
});

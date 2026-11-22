// Testes do servidor estático do app compilado. Rodar: node --test scripts/perf/static-server.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { cacheControlFor, fontPreloadTags, pickEncoding, startStaticServer } from './static-server.mjs';

const fontPath = 'assets/__node_modules/.pnpm/@expo-google-fonts+figtree@0.4.1/node_modules/@expo-google-fonts/figtree/400Regular/Figtree_400Regular.abcdef0123456789abcdef0123456789.ttf';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'webag-static-'));
  const put = (rel, content) => {
    const full = join(dir, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  };
  put('index.html', `<html><head><title>x</title></head><body>${'a'.repeat(2000)}</body></html>`);
  put('_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js', 'console.log(1);'.repeat(500));
  put(fontPath, 'FONT'.repeat(300));
  return dir;
}

function get(port, path, headers = {}) {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', fail);
    req.end();
  });
}

test('cache imutável só nos arquivos com hash; HTML revalida', () => {
  assert.equal(cacheControlFor('_expo/static/js/web/entry-abc.js'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControlFor('assets/x.png'), 'public, max-age=31536000, immutable');
  assert.equal(cacheControlFor('index.html'), 'no-cache');
  assert.equal(cacheControlFor('manifest.json'), 'no-cache');
});

test('negociação: brotli > gzip > nada', () => {
  assert.equal(pickEncoding('gzip, deflate, br'), 'br');
  assert.equal(pickEncoding('gzip'), 'gzip');
  assert.equal(pickEncoding('identity'), null);
  assert.equal(pickEncoding(undefined), null);
});

test('pré-carga só das fontes do app, com o mesmo endereço que o expo-font pede', () => {
  const tags = fontPreloadTags([fontPath, 'assets/outra/Roboto_400.ttf', 'assets/img.png']);
  assert.match(tags, /rel="preload"/);
  assert.ok(tags.includes(`href="/${fontPath}"`));
  assert.doesNotMatch(tags, /Roboto/);
  assert.match(tags, /crossorigin/);
});

test('serve comprimido, com cache certo, SPA, 304 por ETag e sem sair da pasta', async () => {
  const dir = fixture();
  const server = await startStaticServer({ dir, port: 0, host: '127.0.0.1', quiet: true });
  try {
    const js = await get(server.port, '/_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js', { 'accept-encoding': 'br, gzip' });
    assert.equal(js.status, 200);
    assert.equal(js.headers['content-encoding'], 'br');
    assert.equal(js.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(brotliDecompressSync(js.body).toString(), 'console.log(1);'.repeat(500));
    const gz = await get(server.port, '/_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js', { 'accept-encoding': 'gzip' });
    assert.equal(gunzipSync(gz.body).toString().length, 'console.log(1);'.length * 500);

    const plain = await get(server.port, '/_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js');
    assert.equal(plain.headers['content-encoding'], undefined);

    const home = await get(server.port, '/');
    assert.equal(home.headers['cache-control'], 'no-cache');
    assert.match(home.body.toString(), /rel="preload"[^>]*Figtree_400Regular/);
    const deep = await get(server.port, '/store/s1');
    assert.equal(deep.status, 200);
    assert.equal(deep.body.toString(), home.body.toString());
    const revalidated = await get(server.port, '/', { 'if-none-match': home.headers.etag });
    assert.equal(revalidated.status, 304);

    assert.equal((await get(server.port, '/nao-existe.js')).status, 404);
    const traversal = await get(server.port, '/..%2f..%2fetc%2fpasswd');
    assert.ok([400, 200].includes(traversal.status));
    assert.doesNotMatch(traversal.body.toString(), /root:/);
  } finally {
    await server.close();
  }
});

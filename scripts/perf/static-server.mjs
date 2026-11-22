// Servidor estático do app web exportado (`expo export -p web`), para testar velocidade de verdade: arquivos comprimidos
// (brotli para quem aceita, senão gzip), `Cache-Control: immutable` nos arquivos com hash (_expo/static e assets) e revalidação
// (ETag) no HTML e nos demais. Usado por `pnpm iphone --producao` e por `pnpm perf:app`. Só serve arquivos de dentro da pasta.
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
};
// Texto e fontes TTF comprimem bem; PNG/WebP/WOFF2 já são comprimidos (comprimir de novo só gasta CPU).
const COMPRESSIBLE = new Set(['.html', '.js', '.json', '.css', '.svg', '.ttf', '.otf', '.xml', '.txt', '.ico', '.map']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Cache imutável só onde o nome muda com o conteúdo (hash no nome): bundles em _expo/static e assets. */
export function cacheControlFor(relPath) {
  if (/^(_expo\/static\/|assets\/)/.test(relPath) && /[.-][0-9a-f]{16,}\.[a-z0-9]+$/i.test(relPath.replace(/\.(gz|br)$/, ''))) return 'public, max-age=31536000, immutable';
  if (relPath.startsWith('assets/') || relPath.startsWith('_expo/static/')) return 'public, max-age=31536000, immutable';
  return 'no-cache';
}

/** `Accept-Encoding` -> 'br' | 'gzip' | null. */
export function pickEncoding(header) {
  const h = String(header ?? '').toLowerCase();
  if (/\bbr\b/.test(h)) return 'br';
  if (/\bgzip\b/.test(h)) return 'gzip';
  return null;
}

/**
 * Carrega a pasta na memória (já comprimida) e serve. `spa`: caminho sem arquivo (rota do Expo Router) devolve o index.html.
 * Devolve `{ port, close, stats }`.
 */
export async function startStaticServer({ dir, port = 8081, host = '0.0.0.0', compress = true, spa = true, quiet = false }) {
  const base = resolve(dir);
  const files = new Map();
  const t0 = Date.now();
  for (const full of walk(base)) {
    const rel = full.slice(base.length + 1).split(sep).join('/');
    const raw = readFileSync(full);
    const ext = extname(rel).toLowerCase();
    const entry = { raw, type: TYPES[ext] ?? 'application/octet-stream', cache: cacheControlFor(rel), etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"` };
    if (compress && COMPRESSIBLE.has(ext) && raw.length > 512) {
      entry.gzip = gzipSync(raw, { level: 9 });
      entry.br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9, [constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
    }
    files.set(rel, entry);
  }
  if (!files.has('index.html')) throw new Error(`index.html não encontrado em ${base}: rode "expo export -p web" antes`);
  const stats = { requests: 0 };

  const server = createServer((req, res) => {
    stats.requests++;
    let rel;
    try {
      rel = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^[/\\]+/, '').split(sep).join('/');
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (rel.startsWith('..') || rel.includes('\0')) {
      res.writeHead(400).end();
      return;
    }
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    let entry = files.get(rel);
    if (!entry && spa && !extname(rel)) entry = files.get('index.html');
    if (!entry) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado');
      return;
    }
    const headers = { 'content-type': entry.type, 'cache-control': entry.cache, etag: entry.etag, vary: 'Accept-Encoding', 'x-content-type-options': 'nosniff' };
    if (req.headers['if-none-match'] === entry.etag) {
      res.writeHead(304, headers).end();
      return;
    }
    const encoding = compress ? pickEncoding(req.headers['accept-encoding']) : null;
    const body = encoding === 'br' && entry.br ? entry.br : encoding === 'gzip' && entry.gzip ? entry.gzip : entry.raw;
    if (body !== entry.raw) headers['content-encoding'] = body === entry.br ? 'br' : 'gzip';
    headers['content-length'] = body.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  });
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, done);
  });
  if (!quiet) console.log(`[static] ${files.size} arquivos de ${base} prontos em ${Date.now() - t0} ms (${compress ? 'brotli/gzip' : 'sem compressão'})`);
  return { port: server.address().port, stats, close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }) };
}

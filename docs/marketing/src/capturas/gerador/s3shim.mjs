// S3 minimo para o seed/API de marketing: guarda objetos em disco, sem autenticacao.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
const ROOT = '/tmp/webag-mkt/s3';
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(ROOT, path);
  const ct = () => (existsSync(file + '.ct') ? readFileSync(file + '.ct', 'utf8') : 'application/octet-stream');
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  if (req.method === 'PUT') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (path.split('/').filter(Boolean).length > 1) {
        mkdirSync(dirname(file), { recursive: true });
        let body = Buffer.concat(chunks);
        writeFileSync(file, body);
        writeFileSync(file + '.ct', req.headers['content-type'] ?? 'application/octet-stream');
      }
      res.writeHead(200, { ...cors, etag: '"x"' }).end();
    });
    return;
  }
  if (req.method === 'DELETE') { rmSync(file, { force: true }); return res.writeHead(204, cors).end(); }
  if ((req.method === 'GET' || req.method === 'HEAD') && existsSync(file) && !file.endsWith('/')) {
    const b = readFileSync(file);
    res.writeHead(200, { ...cors, 'content-type': ct(), 'content-length': b.length, 'cache-control': 'public, max-age=3600' });
    return res.end(req.method === 'HEAD' ? undefined : b);
  }
  res.writeHead(404, cors).end('<Error><Code>NoSuchKey</Code></Error>');
}).listen(19000, '127.0.0.1');

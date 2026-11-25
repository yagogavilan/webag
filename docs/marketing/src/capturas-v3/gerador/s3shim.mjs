// S3 minimo para capturas v3: igual ao de capturas/gerador/s3shim.mjs, mais POST multipart (upload pelo navegador via URL pre-assinada).
// Guarda objetos em /tmp/webag-mkt/s3, sem autenticacao. Porta 19000. Troque o processo antigo por este.
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
const ROOT = '/tmp/webag-mkt/s3';
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
function put(file, body, ct) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, body); writeFileSync(`${file}.ct`, ct ?? 'application/octet-stream'); }
function parseMultipart(buf, boundary) {
  const fields = {}; let file = null;
  const sep = Buffer.from(`--${boundary}`);
  let pos = buf.indexOf(sep);
  while (pos !== -1) {
    const next = buf.indexOf(sep, pos + sep.length);
    if (next === -1) break;
    const part = buf.subarray(pos + sep.length + 2, next - 2); // tira CRLF antes e depois
    const headEnd = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, headEnd).toString('utf8');
    const body = part.subarray(headEnd + 4);
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (/filename=/.test(head)) file = body; else if (name) fields[name] = body.toString('utf8');
    pos = next;
  }
  return { fields, file };
}
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(ROOT, path);
  const ct = () => (existsSync(`${file}.ct`) ? readFileSync(`${file}.ct`, 'utf8') : 'application/octet-stream');
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  const chunks = [];
  if (req.method === 'PUT' || req.method === 'POST') {
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      if (req.method === 'PUT') { if (path.split('/').filter(Boolean).length > 1) put(file, body, req.headers['content-type']); return res.writeHead(200, { ...cors, etag: '"x"' }).end(); }
      const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] ?? '')?.[1];
      const { fields, file: data } = boundary ? parseMultipart(body, boundary) : { fields: {}, file: null };
      if (fields.key && data) put(join(ROOT, path, fields.key), data, fields['Content-Type'] ?? fields['content-type']);
      res.writeHead(204, { ...cors, etag: '"x"' }).end();
    });
    return;
  }
  if (req.method === 'DELETE') { rmSync(file, { force: true }); return res.writeHead(204, cors).end(); }
  if ((req.method === 'GET' || req.method === 'HEAD') && existsSync(file) && !file.endsWith('/')) {
    const b = readFileSync(file);
    res.writeHead(200, { ...cors, 'content-type': ct(), 'content-length': b.length, 'cache-control': 'public, max-age=3600', etag: '"x"' });
    return res.end(req.method === 'HEAD' ? undefined : b);
  }
  res.writeHead(404, cors).end('<Error><Code>NoSuchKey</Code></Error>');
}).listen(19000, '127.0.0.1');

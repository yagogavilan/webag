#!/usr/bin/env node
// Substituto MÍNIMO do Mailpit para rodar os retestes (`docs/qa/retestes/*.mjs`) em máquina SEM Docker. Não é produto: é ferramenta de QA.
// Faz só o que os retestes usam: recebe SMTP (EHLO, MAIL, RCPT, DATA, QUIT, sem autenticação) e responde
//   GET /api/v1/search?query=to:<email>   -> { messages: [{ ID, Subject, Created, To }] }
//   GET /api/v1/message/<id>              -> { ID, Subject, Text, HTML }
// Uso:  SMTP_PORT=1026 HTTP_PORT=8026 node docs/qa/retestes/mailpit-fake.mjs
//       API com SMTP_HOST=127.0.0.1 SMTP_PORT=1026 e os retestes com MAILPIT_URL=http://127.0.0.1:8026
// Limites: não valida nada, não guarda em disco (memória do processo), decodifica assunto RFC 2047 (B e Q) e corpo quoted-printable/base64 de forma simples.
import http from 'node:http';
import net from 'node:net';

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 1026);
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 8026);
const messages = [];

const decodeWords = (value) =>
  value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _charset, enc, text) =>
    enc.toUpperCase() === 'B'
      ? Buffer.from(text, 'base64').toString('utf8')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'),
  );
const qp = (text) => Buffer.from(text.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_x, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');

function parse(raw, to) {
  const split = raw.indexOf('\r\n\r\n');
  const head = raw.slice(0, split).replace(/\r\n[ \t]+/g, ' ');
  const body = raw.slice(split + 4);
  const subject = decodeWords(/^Subject:\s*(.*)$/im.exec(head)?.[1] ?? '');
  const text = (parts) => parts.map((p) => (/quoted-printable/i.test(p.head) ? qp(p.body) : /base64/i.test(p.head) ? Buffer.from(p.body.replace(/\s+/g, ''), 'base64').toString('utf8') : p.body)).join('\n');
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(raw.slice(0, split + 4000))?.[1];
  const parts = boundary
    ? body.split(`--${boundary}`).slice(1, -1).map((p) => { const i = p.indexOf('\r\n\r\n'); return { head: p.slice(0, i), body: p.slice(i + 4) }; })
    : [{ head, body }];
  const all = text(parts);
  return { ID: String(messages.length + 1), Subject: subject, Created: new Date().toISOString(), To: to.map((address) => ({ Address: address })), Text: all, HTML: all };
}

net
  .createServer((socket) => {
    let rcpt = [];
    let data = null;
    let buffer = '';
    socket.write('220 mailpit-fake ESMTP\r\n');
    socket.on('error', () => undefined);
    socket.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      for (;;) {
        if (data !== null) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          messages.push(parse(data, rcpt));
          data = null;
          socket.write('250 OK queued\r\n');
          continue;
        }
        const eol = buffer.indexOf('\r\n');
        if (eol < 0) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250 mailpit-fake\r\n');
        else if (cmd === 'MAIL') { rcpt = []; socket.write('250 OK\r\n'); }
        else if (cmd === 'RCPT') { rcpt.push(/<([^>]*)>/.exec(line)?.[1] ?? ''); socket.write('250 OK\r\n'); }
        else if (cmd === 'DATA') { data = ''; socket.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { socket.end('221 bye\r\n'); return; }
        else socket.write('250 OK\r\n');
      }
    });
  })
  .listen(SMTP_PORT, '127.0.0.1');

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const send = (body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
    if (url.pathname === '/api/v1/search') {
      const to = /to:(\S+)/i.exec(url.searchParams.get('query') ?? '')?.[1]?.toLowerCase();
      // O Mailpit real lista a mais NOVA primeiro; os retestes usam `find` e dependem dessa ordem.
      const found = messages.filter((m) => !to || m.To.some((t) => t.Address.toLowerCase() === to)).reverse();
      return send({ total: found.length, messages: found.map(({ Text: _t, HTML: _h, ...rest }) => rest) });
    }
    const one = /^\/api\/v1\/message\/(\d+)$/.exec(url.pathname);
    if (one) return send(messages[Number(one[1]) - 1] ?? {});
    res.statusCode = 404;
    res.end('{}');
  })
  .listen(HTTP_PORT, '127.0.0.1');
console.log(`mailpit-fake: SMTP ${SMTP_PORT}, HTTP ${HTTP_PORT}`);

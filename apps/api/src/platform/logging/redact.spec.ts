import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS } from './redact.js';

describe('redact do log de acesso', () => {
  it('VA-24: X-View-As, Authorization e cookie saem como [redacted] (pino real)', () => {
    const lines: string[] = [];
    const logger = pino({ redact: { paths: [...LOG_REDACT_PATHS], censor: '[redacted]' } }, new Writable({ write(chunk: Buffer, _enc, cb) { lines.push(chunk.toString()); cb(); } }));
    const token = `vas_${'B'.repeat(43)}`;
    logger.info({ req: { method: 'GET', url: '/v1/stores/x', headers: { 'x-view-as': token, authorization: 'Bearer segredo', cookie: 'sid=1', accept: 'application/json' }, body: { a: 1 } } }, 'request completed');
    const out = lines.join('');
    expect(out).not.toContain('vas_');
    expect(out).not.toContain('segredo');
    expect(out).not.toContain('sid=1');
    expect(out).toContain('[redacted]');
    expect(out).toContain('application/json');
  });
});

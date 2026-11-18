import { signedWebhookHeaders, validateWebhookSignature, buildManifest } from './webhook-signature.js';

describe('assinatura de webhook (SEC-032)', () => {
  const secret = 'segredo-de-teste-do-webhook';
  const now = 1_760_000_000_000;
  const check = (over: Partial<Parameters<typeof validateWebhookSignature>[0]> = {}) => {
    const headers = signedWebhookHeaders(secret, 'fk123abc', 'req-1', now);
    return validateWebhookSignature({
      secret,
      signatureHeader: headers['x-signature'],
      requestId: 'req-1',
      dataId: 'fk123abc',
      nowMs: now,
      ...over,
    });
  };

  it('aceita assinatura válida', () => {
    expect(check()).toEqual({ ok: true, tsMs: now });
  });

  it('manifesto segue o formato do MP', () => {
    expect(buildManifest({ dataId: 'ABC123', requestId: 'r', ts: '10' })).toBe('id:abc123;request-id:r;ts:10;');
    expect(buildManifest({ dataId: 'a-b', requestId: null, ts: '10' })).toBe('id:a-b;ts:10;');
  });

  it.each([
    ['segredo errado', { secret: 'outro-segredo' }, 'mismatch'],
    ['data.id diferente do assinado', { dataId: 'fk999' }, 'mismatch'],
    ['x-request-id diferente', { requestId: 'req-2' }, 'mismatch'],
    ['sem header (IPN legado)', { signatureHeader: undefined }, 'missing'],
    ['header malformado', { signatureHeader: 'lixo' }, 'malformed'],
    ['ts de 10 minutos atrás', { nowMs: now + 10 * 60_000 }, 'stale'],
    ['ts do futuro além da tolerância', { nowMs: now - 10 * 60_000 }, 'stale'],
    ['sem data.id', { dataId: undefined }, 'malformed'],
  ])('recusa: %s', (_name, over, reason) => {
    expect(check(over)).toEqual({ ok: false, reason });
  });

  it('aceita ts em segundos e dentro da tolerância de 300 s', () => {
    const ts = String(Math.floor(now / 1000));
    const headers = signedWebhookHeaders(secret, 'fk123abc', 'req-1', now);
    const v1 = /v1=([0-9a-f]+)/.exec(headers['x-signature'] ?? '')?.[1];
    expect(v1).toBeDefined();
    // assinatura calculada sobre o ts em ms não vale para ts em segundos (manifesto muda)
    expect(check({ signatureHeader: `ts=${ts},v1=${v1}` })).toEqual({ ok: false, reason: 'mismatch' });
    expect(check({ nowMs: now + 299_000 }).ok).toBe(true);
    expect(check({ nowMs: now + 301_000 }).ok).toBe(false);
  });
});

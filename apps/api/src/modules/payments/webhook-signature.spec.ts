import { WebhookSignatureValidator } from 'mercadopago/dist/utils/webhook/index.js';
import { signedWebhookHeaders, signManifest, validateWebhookSignature, buildManifest, WEBHOOK_TOLERANCE_SECONDS } from './webhook-signature.js';

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

/** SEC-137: teste diferencial contra o validador oficial do SDK (mesmas entradas, mesmo veredito). */
describe('assinatura de webhook: diferencial com o WebhookSignatureValidator do SDK (SEC-137)', () => {
  const secret = 'segredo-de-teste-do-webhook';
  const now = 1_760_000_000_000;
  const rand = (seed: number) => () => ((seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296);
  const pick = (r: () => number, chars: string, n: number) => Array.from({ length: n }, () => chars[Math.floor(r() * chars.length)]).join('');

  const sdkAccepts = (input: { sig: string; requestId: string; dataId: string }): boolean => {
    try {
      WebhookSignatureValidator.validate({ xSignature: input.sig, xRequestId: input.requestId, dataId: input.dataId, secret, toleranceSeconds: WEBHOOK_TOLERANCE_SECONDS, now: () => now });
      return true;
    } catch {
      return false;
    }
  };
  const ownAccepts = (input: { sig: string; requestId: string; dataId: string }): boolean =>
    validateWebhookSignature({ secret, signatureHeader: input.sig, requestId: input.requestId, dataId: input.dataId, nowMs: now, toleranceSeconds: WEBHOOK_TOLERANCE_SECONDS }).ok;

  it('100 entradas aleatórias (válidas, adulteradas, vencidas, malformadas): o veredito é o mesmo', () => {
    const r = rand(42);
    let accepted = 0;
    for (let i = 0; i < 100; i++) {
      const dataId = i % 2 === 0 ? pick(r, '0123456789', 10) : pick(r, 'abcdef0123456789', 12);
      const requestId = pick(r, 'abcdef0123456789-', 20);
      const ageSeconds = i % 10 === 3 ? 4_000 : Math.floor(r() * 200); // 10%: fora da tolerância
      const ts = String(Math.floor(now / 1000) - ageSeconds);
      const good = signManifest(secret, buildManifest({ dataId, requestId, ts }));
      const variant = i % 7;
      const v1 = variant === 1 ? good.slice(0, 63) + (good.endsWith('0') ? '1' : '0') : variant === 2 ? 'zz' : good; // adulterada / malformada
      const sig = variant === 3 ? `v1=${good}` : variant === 4 ? `ts=${ts}` : `ts=${ts},v1=${v1}`;
      const sentDataId = variant === 5 ? dataId + '0' : dataId; // outro id que o assinado
      const input = { sig, requestId, dataId: sentDataId };
      expect(ownAccepts(input), JSON.stringify({ i, variant })).toBe(sdkAccepts(input));
      if (ownAccepts(input)) accepted++;
    }
    expect(accepted).toBeGreaterThan(15); // o teste não é vazio: há válidas
  });

  it('diferenças CONHECIDAS e aceitas (documentadas): ts em milissegundos e data.id alfanumérico com maiúsculas', () => {
    // O SDK trata `ts` como segundos; o nosso aceita também milissegundos (o formato do sandbox ainda não foi confirmado).
    const msTs = String(now - 1_000);
    const msSig = `ts=${msTs},v1=${signManifest(secret, buildManifest({ dataId: '123', requestId: 'r1', ts: msTs }))}`;
    expect(ownAccepts({ sig: msSig, requestId: 'r1', dataId: '123' })).toBe(true);
    // A documentação do MP manda minúsculas no manifesto quando o id é alfanumérico; o nosso aplica, o SDK não.
    const ts = String(Math.floor(now / 1000));
    const upperSig = `ts=${ts},v1=${signManifest(secret, buildManifest({ dataId: 'ABC123', requestId: 'r2', ts }))}`;
    expect(ownAccepts({ sig: upperSig, requestId: 'r2', dataId: 'ABC123' })).toBe(true);
    expect(sdkAccepts({ sig: upperSig, requestId: 'r2', dataId: 'ABC123' })).toBe(false);
  });
});

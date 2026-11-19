import { createHmac, timingSafeEqual } from 'node:crypto';
/**
 * Assinatura de webhook no formato do Mercado Pago (header `x-signature: ts=...,v1=...`, SEC-032):
 * manifesto `id:<data.id da QUERY>;request-id:<x-request-id>;ts:<ts>;`, HMAC-SHA256 com o segredo do ambiente.
 * O CORPO não é assinado: só `data.id` da query string vale como identificador. O provedor `fake` usa o mesmo formato,
 * então o caminho de validação em teste é o mesmo do real.
 * [HIPÓTESE] `ts` em milissegundos (13 dígitos) ou segundos; os dois são aceitos. Confirmar no sandbox (docs/seguranca).
 */
export const WEBHOOK_TOLERANCE_SECONDS = 300;
export function buildManifest(parts) {
    // A documentação do MP manda usar o data.id em minúsculas quando for alfanumérico.
    const id = /^[A-Za-z0-9]+$/.test(parts.dataId) ? parts.dataId.toLowerCase() : parts.dataId;
    return `id:${id};${parts.requestId ? `request-id:${parts.requestId};` : ''}ts:${parts.ts};`;
}
export function signManifest(secret, manifest) {
    return createHmac('sha256', secret).update(manifest).digest('hex');
}
export function parseSignatureHeader(header) {
    if (!header)
        return null;
    const fields = Object.fromEntries(header.split(',').map((part) => {
        const [key, ...rest] = part.trim().split('=');
        return [key, rest.join('=')];
    }));
    return fields.ts && fields.v1 ? { ts: fields.ts, v1: fields.v1 } : null;
}
export function validateWebhookSignature(input) {
    if (!input.signatureHeader)
        return { ok: false, reason: 'missing' };
    const parsed = parseSignatureHeader(input.signatureHeader);
    if (!parsed || !input.dataId || !/^[0-9]{9,13}$/.test(parsed.ts) || !/^[0-9a-f]{64}$/i.test(parsed.v1)) {
        return { ok: false, reason: 'malformed' };
    }
    const tsMs = parsed.ts.length >= 12 ? Number(parsed.ts) : Number(parsed.ts) * 1000;
    const tolerance = (input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS) * 1000;
    if (Math.abs((input.nowMs ?? Date.now()) - tsMs) > tolerance)
        return { ok: false, reason: 'stale' };
    const expected = signManifest(input.secret, buildManifest({ dataId: input.dataId, requestId: input.requestId, ts: parsed.ts }));
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(parsed.v1, 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? { ok: true, tsMs } : { ok: false, reason: 'mismatch' };
}
/** Gera os headers de uma notificação assinada (usado pelo provedor `fake` e pelos testes). */
export function signedWebhookHeaders(secret, dataId, requestId, nowMs = Date.now()) {
    const ts = String(nowMs);
    const v1 = signManifest(secret, buildManifest({ dataId, requestId, ts }));
    return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}
//# sourceMappingURL=webhook-signature.js.map
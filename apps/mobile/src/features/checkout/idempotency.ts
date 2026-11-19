import type { CreateOrderRequest } from '@webag/shared';

/**
 * Chave de idempotência do pedido (contrato: 8 a 80 caracteres). A MESMA chave vale em toda repetição do MESMO corpo
 * (toque duplo, rede que caiu depois do servidor criar o pedido): o servidor devolve o mesmo pedido, sem nova cobrança.
 * Corpo diferente = chave nova (senão o servidor responde 409 `IDEMPOTENCY_KEY_REUSED`). Só em memória: nada disso é gravado.
 */
export interface KeyHolder {
  fingerprint: string;
  key: string;
}

/** Ordem fixa dos campos: o mesmo corpo sempre gera a mesma impressão digital. */
export function fingerprintOf(body: CreateOrderRequest): string {
  return JSON.stringify([
    body.mode,
    body.addressId ?? null,
    body.cartRevision,
    body.expectedTotalCents ?? null,
    body.paymentMethod,
    body.card ? [body.card.token, body.card.installments, body.card.paymentMethodId ?? null, body.card.issuerId ?? null] : null,
    body.payerDocument ?? null,
  ]);
}

export function keyFor(holder: KeyHolder | null, body: CreateOrderRequest, newKey: () => string): KeyHolder {
  const fingerprint = fingerprintOf(body);
  return holder && holder.fingerprint === fingerprint ? holder : { fingerprint, key: newKey() };
}

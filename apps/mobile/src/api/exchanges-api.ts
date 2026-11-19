import {
  cancelExchange,
  completeUpload,
  contestExchange,
  createExchange,
  createOrderReview,
  createUpload,
  getExchange,
  getExchangeOptions,
  getExchangePayment,
  listExchanges,
  payExchange,
  switchExchangeToStore,
  type CreateExchangeRequest,
  type CreateReviewRequest,
  type Exchange,
  type ExchangeOptions,
  type ExchangePage,
  type ExchangePayment,
  type PayExchangeRequest,
  type Review,
} from '@webag/shared';
import { request } from './http';

/** Trocas (`/v1/orders/{id}/exchange-options`, `/v1/exchanges*`, ADR-011). O app não calcula taxa nem diferença: lê do servidor. */
export const fetchExchangeOptions = (orderId: string, signal?: AbortSignal): Promise<ExchangeOptions> =>
  request((init) => getExchangeOptions(orderId, init), { retry: true, ...(signal ? { signal } : {}) });

/** `idempotencyKey`: repetir em rede ruim devolve a MESMA troca (nunca duas). */
export const placeExchange = (orderId: string, body: CreateExchangeRequest, idempotencyKey: string): Promise<Exchange> =>
  request((init) => createExchange(orderId, body, init), { idempotencyKey });

export const fetchExchanges = (cursor?: string | null, signal?: AbortSignal): Promise<ExchangePage> =>
  request((init) => listExchanges({ limit: 20, ...(cursor ? { cursor } : {}) }, init), { retry: true, ...(signal ? { signal } : {}) });

export const fetchExchange = (id: string, signal?: AbortSignal): Promise<Exchange> =>
  request((init) => getExchange(id, init), { retry: true, ...(signal ? { signal } : {}) });

export const cancelMyExchange = (id: string, reason?: string): Promise<Exchange> =>
  request((init) => cancelExchange(id, reason ? { reason } : {}, init), { retry: true });

export const fetchExchangePayment = (id: string, signal?: AbortSignal): Promise<ExchangePayment> =>
  request((init) => getExchangePayment(id, init), { retry: true, ...(signal ? { signal } : {}) });

/** Paga a taxa e a diferença depois da aprovação. O status só muda por webhook do provedor (SEC-035). */
export const payExchangeFee = (id: string, body: PayExchangeRequest): Promise<ExchangePayment> =>
  request((init) => payExchange(id, body, init), { retry: false });

export const sendReview = (orderId: string, body: CreateReviewRequest): Promise<Review> =>
  request((init) => createOrderReview(orderId, body, init));

export interface PickedPhoto {
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Foto da troca: upload pré-assinado direto ao armazenamento (a API não recebe o arquivo) e `complete` valida dono, tamanho e
 * formato no servidor, que re-codifica sem EXIF/GPS. Devolve o id para `photoIds`.
 */
export async function uploadExchangePhoto(photo: PickedPhoto): Promise<string> {
  const created = await request((init) => createUpload({ purpose: 'exchange_photo', contentType: photo.mimeType, sizeBytes: photo.sizeBytes }, init), { retry: true });
  const form = new FormData();
  for (const [key, value] of Object.entries(created.upload.fields)) form.append(key, value);
  // React Native aceita { uri, name, type } como arquivo no FormData
  form.append('file', { uri: photo.uri, name: 'photo', type: photo.mimeType } as unknown as Blob);
  const sent = await fetch(created.upload.url, { method: 'POST', body: form });
  if (!sent.ok) throw new Error('upload_failed');
  await request((init) => completeUpload(created.id, init), { retry: true });
  return created.id;
}

/**
 * Levar o item à loja em vez da coleta em casa (depois de aprovada e com a taxa AINDA não paga): zera a taxa e gera o código do
 * balcão. Idempotente. Erros: `EXCHANGE_NOT_SWITCHABLE`, `EXCHANGE_FEE_ALREADY_PAID`, `EXCHANGE_PICKUP_STARTED`.
 */
export const switchMyExchangeToStore = (id: string): Promise<Exchange> => request((init) => switchExchangeToStore(id, init), { retry: true });

/** Contestar a recusa da LOJA (uma vez, até `contestableUntil`): a troca vai à mediação. Texto de 10 a 500 caracteres. */
export const contestRefusal = (id: string, text: string): Promise<Exchange> => request((init) => contestExchange(id, { text }, init), { retry: true });

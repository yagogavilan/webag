import { ApiError, networkError } from '@/lib/api/errors';
import { merchantApi, type DocumentKind, type StoreDocument, type UploadPolicy } from '@/lib/api/lojista';

export interface UploadHooks {
  /** 0 a 100. */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

type XhrFactory = () => XMLHttpRequest;

/**
 * POST pré-assinado direto ao armazenamento (ADR-005): os bytes não passam pela API nem pelo painel. Usa XHR porque
 * `fetch` não informa o progresso do envio. O arquivo vai por último no formulário, como o S3 exige.
 */
export function postToStorage(policy: UploadPolicy, file: Blob, fileName: string, hooks: UploadHooks = {}, xhrFactory: XhrFactory = () => new XMLHttpRequest()): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = xhrFactory();
    const form = new FormData();
    for (const [key, value] of Object.entries(policy.fields)) form.append(key, value);
    form.append('file', file, fileName);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) hooks.onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        hooks.onProgress?.(100);
        resolve();
      } else {
        reject(new ApiError({ status: xhr.status, code: `STORAGE_${xhr.status}`, title: 'Falha ao enviar o arquivo' }));
      }
    };
    xhr.onerror = () => reject(networkError());
    xhr.ontimeout = () => reject(networkError());
    xhr.onabort = () => reject(new DOMException('Envio cancelado', 'AbortError'));
    hooks.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    if (hooks.signal?.aborted) return reject(new DOMException('Envio cancelado', 'AbortError'));

    xhr.open('POST', policy.url);
    xhr.timeout = 120_000;
    xhr.send(form);
  });
}

export type UploadDocumentFn = (storeId: string, kind: DocumentKind, blob: Blob, fileName: string, hooks: UploadHooks) => Promise<StoreDocument>;

/** Pedir política, enviar ao armazenamento, confirmar (a API confere dono, tamanho e conteúdo) e vincular ao slot. */
export const uploadStoreDocument: UploadDocumentFn = async (storeId, kind, blob, fileName, hooks) => {
  const policy = await merchantApi.createUpload({ storeId, purpose: 'store_document', contentType: blob.type || 'application/octet-stream', sizeBytes: blob.size });
  await postToStorage(policy, blob, fileName, hooks);
  await merchantApi.completeUpload(policy.uploadId);
  await merchantApi.attachDocument(storeId, kind, policy.uploadId);
  return { kind, uploadedAt: new Date().toISOString(), fileName, mimeType: blob.type, sizeBytes: blob.size };
};

export interface UploadedImage {
  assetId: string;
  /** URLs públicas por largura (variantes geradas pelo servidor). */
  urls: Record<string, string> | null;
}

/** Logo ou capa: mesmo caminho do documento (política, armazenamento, confirmação), sem vincular a slot; o id vai no perfil. */
export async function uploadStoreImage(storeId: string, purpose: 'store_logo' | 'store_cover', blob: Blob, fileName: string, hooks: UploadHooks = {}): Promise<UploadedImage> {
  const policy = await merchantApi.createUpload({ storeId, purpose, contentType: blob.type || 'image/jpeg', sizeBytes: blob.size });
  await postToStorage(policy, blob, fileName, hooks);
  const asset = await merchantApi.completeUpload(policy.uploadId);
  if (asset.status === 'rejected' || asset.rejectionReason) throw new ApiError({ status: 422, code: 'UPLOAD_REJECTED', title: 'Imagem recusada', detail: asset.rejectionReason ?? 'Use outra imagem.' });
  return { assetId: asset.id, urls: asset.urls };
}

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { catalogApi, catalogKeys, type Product } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import {
  QUICK_MESSAGES,
  UPLOAD_WAIT_MAX_MS,
  fieldErrorFrom,
  firstErrorField,
  intentFor,
  isGradeRoute,
  isNetworkError,
  isPublishConflict,
  isPublishedAsTyped,
  isUploadNotReady,
  toQuickBody,
  uploadRetryDelay,
  validateQuick,
  type Intent,
  type QuickContext,
  type QuickErrors,
  type QuickField,
  type QuickValues,
} from '@/lib/catalog/quick';
import { parseCents } from '@/lib/money';
import { toRequest, type AttrDef, type GridRow } from '@/lib/catalog/variants';
import type { Photo } from '../photo-gallery';

/** Relógio e espera trocáveis nos testes (30 s de `UPLOAD_NOT_READY` sem esperar 30 s). */
export const timing = {
  sleep: (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms)),
  now: (): number => Date.now(),
};

export type PublishPhase =
  | { kind: 'idle' }
  | { kind: 'publishing' }
  /** A foto ainda sobe do aparelho: publica sozinho ao terminar (WB-370 C6). */
  | { kind: 'waiting_upload' }
  /** O servidor ainda processa a foto (`UPLOAD_NOT_READY`): repete com a mesma chave, sem mostrar erro. */
  | { kind: 'waiting_server' }
  | { kind: 'photo_slow' }
  /** A resposta não chegou (rede caiu): tocar de novo com a mesma chave não duplica (C14, C15). */
  | { kind: 'lost' }
  | { kind: 'error'; message: string; showProduct?: boolean }
  | { kind: 'done'; product: Product };

interface Grade {
  attrs: AttrDef[];
  rows: GridRow[];
}

interface Init {
  storeId: string;
  productId: string;
  values: QuickValues;
  photos: Photo[];
  grade: Grade;
  context: Omit<QuickContext, 'photos' | 'gradeRows'>;
  online: boolean;
  versionRef: MutableRefObject<number>;
  /** Salva o rascunho antes de publicar (a versão do `If-Match` vem do salvamento). */
  flush: () => Promise<void>;
  setErrors: (errors: QuickErrors) => void;
  focusField: (field: QuickField) => void;
  /** Troca de sucesso (limpa a cópia local, avisa a lista). */
  onDone: (product: Product) => void;
  /** Texto de "Não aceita troca por tamanho ou cor", sugestão que o lojista aceitou (WB-375 C3). */
  noVoluntaryExchange: boolean;
}

/**
 * "Publicar" do cadastro rápido (WB-370 C3, C6, C8, C14 a C17; spec §7). Uma chamada só (`quickPublishProduct`), tudo ou nada, com
 * `Idempotency-Key` estável por intenção. Regras de tela:
 * - sem internet: nada é enviado, o motivo aparece escrito, nada se perde (sem fila);
 * - foto subindo: espera e publica sozinho; `UPLOAD_NOT_READY` repete com a mesma chave por até 30 s, sem erro;
 * - resposta perdida / 409: reconsulta o produto e, se está ATIVO com o que foi digitado, é sucesso;
 * - rascunho com grade (422 `QUICK_PUBLISH_NOT_APPLICABLE`, ou grade preenchida): caminho da grade, sem erro técnico (C16).
 */
export function useQuickPublisher(init: Init) {
  const client = useQueryClient();
  const [phase, setPhase] = useState<PublishPhase>({ kind: 'idle' });
  const [offlineTap, setOfflineTap] = useState(false);
  const inFlight = useRef(false);
  const waitingUpload = useRef(false);
  const intent = useRef<Intent | null>(null);
  const alive = useRef(true);
  const latest = useRef(init);
  useEffect(() => {
    latest.current = init;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const uploading = init.photos.some((photo) => photo.status === 'uploading');

  const finish = useCallback(
    (product: Product) => {
      void client.invalidateQueries({ queryKey: catalogKeys.all });
      latest.current.onDone(product);
      if (alive.current) setPhase({ kind: 'done', product });
    },
    [client],
  );

  async function gradePath(): Promise<Product> {
    const { storeId, productId, values, photos, grade, noVoluntaryExchange } = latest.current;
    const ids = photos.filter((p) => p.status === 'ready').map((p) => p.assetId as string);
    const description = values.description.trim();
    await catalogApi.update(storeId, productId, {
      name: values.name.trim(),
      description: description === '' ? null : description,
      categoryId: values.categoryId === '' ? null : values.categoryId,
      basePriceCents: values.priceCents,
      ...(noVoluntaryExchange ? { noVoluntaryExchange: true } : {}),
    });
    await catalogApi.setVariants(storeId, productId, toRequest(grade.attrs, grade.rows, parseCents));
    await catalogApi.setImages(storeId, productId, ids);
    return catalogApi.publish(storeId, productId);
  }

  async function quickPath(): Promise<Product | null> {
    const { storeId, productId, values, photos, versionRef } = latest.current;
    const ids = photos.filter((p) => p.status === 'ready').map((p) => p.assetId as string);
    const body = toQuickBody(values, ids);
    intent.current = intentFor(intent.current, body, 'qp');
    const started = timing.now();
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await catalogApi.quickPublish(storeId, productId, body, intent.current.key, versionRef.current);
      } catch (caught) {
        if (!isUploadNotReady(caught)) throw caught;
        if (timing.now() - started >= UPLOAD_WAIT_MAX_MS) {
          if (alive.current) setPhase({ kind: 'photo_slow' });
          return null;
        }
        if (alive.current) setPhase({ kind: 'waiting_server' });
        await timing.sleep(uploadRetryDelay(attempt));
        if (!alive.current) return null;
      }
    }
  }

  async function reconcile(): Promise<void> {
    const { storeId, productId, values, versionRef } = latest.current;
    const fresh = await catalogApi.get(storeId, productId);
    if (isPublishedAsTyped(fresh, values)) return finish(fresh);
    if (fresh.status === 'active' || fresh.status === 'paused') {
      setPhase({ kind: 'error', message: QUICK_MESSAGES.alreadyPublished, showProduct: true });
      return;
    }
    versionRef.current = fresh.version ?? versionRef.current;
    setPhase({ kind: 'error', message: 'Este rascunho foi alterado em outro aparelho. Conferimos a versão de agora; toque em Publicar de novo.' });
  }

  async function runQuick(): Promise<Product | null> {
    try {
      return await quickPath();
    } catch (caught) {
      if (isGradeRoute(caught)) return gradePath();
      throw caught;
    }
  }

  async function handleFailure(caught: unknown): Promise<void> {
    if (!alive.current) return;
    if (isNetworkError(caught)) return setPhase({ kind: 'lost' });
    if (isPublishConflict(caught)) {
      try {
        return await reconcile();
      } catch (again) {
        if (isNetworkError(again)) return setPhase({ kind: 'lost' });
        return setPhase({ kind: 'error', message: QUICK_MESSAGES.generic });
      }
    }
    const mapped = fieldErrorFrom(caught, latest.current.context.descriptionMin);
    if (mapped) {
      latest.current.setErrors({ [mapped.field]: mapped.message });
      latest.current.focusField(mapped.field);
      return setPhase({ kind: 'idle' });
    }
    if (caught instanceof ApiError && caught.code === 'PRODUCT_MODERATED') return setPhase({ kind: 'error', message: 'A moderação do Webag pausou este produto. Só o Webag pode liberar.' });
    setPhase({ kind: 'error', message: QUICK_MESSAGES.generic });
  }

  const publish = useCallback(async (): Promise<void> => {
    const now = latest.current;
    // C14: segundo toque durante o envio é ignorado.
    if (inFlight.current) return;
    if (!now.online) {
      setOfflineTap(true);
      return;
    }
    setOfflineTap(false);
    const ready = now.photos.filter((p) => p.status === 'ready').length;
    const errors = validateQuick(now.values, { ...now.context, photos: ready, gradeRows: now.grade.rows.length });
    if (now.photos.some((p) => p.status === 'error') && !errors.photo) errors.photo = 'Uma foto não foi enviada. Toque em "Enviar de novo" ou remova.';
    const first = firstErrorField(errors);
    if (first) {
      now.setErrors(errors);
      now.focusField(first);
      setPhase({ kind: 'idle' });
      return;
    }
    now.setErrors({});
    if (now.photos.some((p) => p.status === 'uploading')) {
      waitingUpload.current = true;
      setPhase({ kind: 'waiting_upload' });
      return;
    }
    waitingUpload.current = false;
    inFlight.current = true;
    setPhase({ kind: 'publishing' });
    try {
      await now.flush();
      const product = now.grade.rows.length > 0 ? await gradePath() : await runQuick();
      if (product) finish(product);
    } catch (caught) {
      await handleFailure(caught);
    } finally {
      inFlight.current = false;
    }
  }, [finish]); // eslint-disable-line react-hooks/exhaustive-deps -- lê o estado mais recente por `latest`

  // Publica sozinho quando a última foto termina de subir (C6).
  useEffect(() => {
    if (waitingUpload.current && !uploading) void publish();
  }, [uploading, publish]);

  const cancelWaiting = useCallback(() => {
    waitingUpload.current = false;
    setPhase({ kind: 'idle' });
  }, []);

  const busy = phase.kind === 'publishing' || phase.kind === 'waiting_server' || phase.kind === 'waiting_upload';
  return { phase, publish, busy, offlineTap, cancelWaiting, dismissOfflineTap: () => setOfflineTap(false) };
}

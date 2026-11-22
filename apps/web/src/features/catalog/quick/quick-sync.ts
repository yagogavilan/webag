'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { catalogApi, type Product } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import type { QuickValues } from '@/lib/catalog/quick';

/**
 * Rascunho automático (WB-371 C1, C4; RN-Q2). O rascunho já existe no servidor (nasceu ao tocar "Novo produto"); a cada pausa na
 * digitação o que está válido vai por `updateProduct` com `If-Match` (a versão lida), e as fotos já enviadas por `setProductImages`.
 * "Salvo" só quando o SERVIDOR confirmou; sem rede ou com falha, o texto continua na cópia local e o estado diz isso (DEC-126).
 * Nada é reenviado sozinho quando a rede volta, a não ser a próxima alteração do lojista ou o toque em "Publicar"/"Guardar".
 */
export type SyncStatus = 'saved' | 'saving' | 'local' | 'offline' | 'error';

export interface SyncConflict {
  /** O que está no servidor (outro aparelho). */
  theirs: { name: string; priceCents: number | null; categoryId: string; description: string; updatedAt: string; version: number };
}

export const SAVE_DELAY_MS = 900;

interface SyncInit {
  storeId: string;
  product: Product;
  values: QuickValues;
  /** Ids das fotos já enviadas, na ordem. */
  imageIds: string[];
  online: boolean;
  /** Pausa o salvamento (publicando). */
  paused: boolean;
}

interface Snapshot {
  name: string;
  price: number | null;
  category: string;
  description: string;
  images: string;
}

const snapshotOf = (values: QuickValues, imageIds: string[]): Snapshot => ({
  name: values.name.trim(),
  price: values.priceCents,
  category: values.categoryId,
  description: values.description.trim(),
  images: imageIds.join(','),
});

const sameSnapshot = (a: Snapshot, b: Snapshot): boolean => a.name === b.name && a.price === b.price && a.category === b.category && a.description === b.description && a.images === b.images;

function initialSnapshot(product: Product): Snapshot {
  return snapshotOf(
    { name: product.name, priceCents: product.basePriceCents, stockText: '', categoryId: product.categoryId ?? '', description: product.description ?? '' },
    [...product.images].sort((a, b) => a.position - b.position).map((image) => image.id),
  );
}

export function useDraftSync({ storeId, product, values, imageIds, online, paused }: SyncInit) {
  const versionRef = useRef<number>(product.version ?? 1);
  const server = useRef<Snapshot>(initialSnapshot(product));
  const latest = useRef({ values, imageIds });
  useEffect(() => {
    latest.current = { values, imageIds };
  });
  const chain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [serverSnap, setServerSnap] = useState<Snapshot>(() => initialSnapshot(product));
  const [status, setStatus] = useState<SyncStatus>('saved');
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<SyncConflict | null>(null);
  const blocked = useRef(false);

  const current = snapshotOf(values, imageIds);
  const dirty = !sameSnapshot(current, serverSnap);
  const key = JSON.stringify(current);

  const save = useCallback(async (): Promise<void> => {
    if (blocked.current) return;
    const now = snapshotOf(latest.current.values, latest.current.imageIds);
    const before = server.current;
    if (sameSnapshot(now, before)) return;
    setStatus('saving');
    try {
      const body: Record<string, unknown> = {};
      if (now.name !== before.name && now.name.length >= 2) body['name'] = now.name;
      if (now.price !== before.price && now.price !== null && now.price > 0) body['basePriceCents'] = now.price;
      if (now.category !== before.category && now.category !== '') body['categoryId'] = now.category;
      if (now.description !== before.description) body['description'] = now.description === '' ? null : now.description;
      const sent = { ...before };
      if (Object.keys(body).length > 0) {
        const saved = await catalogApi.updateIfMatch(storeId, product.id, body, versionRef.current);
        versionRef.current = saved.version ?? versionRef.current;
        if ('name' in body) sent.name = now.name;
        if ('basePriceCents' in body) sent.price = now.price;
        if ('categoryId' in body) sent.category = now.category;
        if ('description' in body) sent.description = now.description;
      }
      if (now.images !== before.images && now.images !== '') {
        const saved = await catalogApi.setImages(storeId, product.id, now.images.split(','));
        versionRef.current = saved.version ?? versionRef.current;
        sent.images = now.images;
      }
      server.current = sent;
      setServerSnap(sent);
      setSavedAt(Date.now());
      // Parte do que foi digitado ainda não é aceita pelo servidor (nome de 1 letra, preço vazio): continua só na cópia local.
      setStatus(sameSnapshot(snapshotOf(latest.current.values, latest.current.imageIds), sent) ? 'saved' : 'local');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409 && caught.code === 'PRODUCT_VERSION_CONFLICT') {
        blocked.current = true;
        try {
          const fresh = await catalogApi.get(storeId, product.id);
          setConflict({ theirs: { name: fresh.name, priceCents: fresh.basePriceCents, categoryId: fresh.categoryId ?? '', description: fresh.description ?? '', updatedAt: fresh.updatedAt, version: fresh.version ?? versionRef.current } });
        } catch {
          blocked.current = false;
          setStatus('error');
        }
        return;
      }
      setStatus(caught instanceof ApiError && caught.isNetwork ? 'offline' : 'error');
    }
  }, [storeId, product.id]);

  const run = useCallback((): Promise<void> => {
    chain.current = chain.current.then(save, save);
    return chain.current;
  }, [save]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!dirty || paused || conflict) return;
    if (!online) return;
    timer.current = setTimeout(() => void run(), SAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `key` resume o conteúdo; o resto são as condições.
  }, [key, dirty, online, paused, conflict, run]);

  /** Salva já (antes de "Publicar" ou "Guardar rascunho"). Devolve quando o que era possível salvar foi salvo. */
  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    await run();
  }, [run]);

  /** "Manter a deste aparelho": adota a versão do outro aparelho como base e salva a nossa por cima (WB-371 C4). */
  async function keepMine() {
    if (!conflict) return;
    versionRef.current = conflict.theirs.version;
    blocked.current = false;
    setConflict(null);
    await run();
  }

  /** "Usar a do outro aparelho": a tela troca os valores; aqui só se registra que o servidor é a base. */
  function adoptTheirs() {
    if (!conflict) return null;
    const theirs = conflict.theirs;
    versionRef.current = theirs.version;
    const adopted = { ...server.current, name: theirs.name.trim(), price: theirs.priceCents, category: theirs.categoryId, description: theirs.description.trim() };
    server.current = adopted;
    setServerSnap(adopted);
    blocked.current = false;
    setConflict(null);
    setStatus('saved');
    return theirs;
  }

  const unsent = dirty || status !== 'saved';
  const shown: SyncStatus = !online ? 'offline' : dirty && status === 'saved' ? 'local' : status;
  return { status: shown, savedAt, conflict, versionRef, flush, keepMine, adoptTheirs, unsent, dirty };
}

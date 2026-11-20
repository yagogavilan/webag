'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { Banner, ui, useToast } from '@/components/ui';
import { merchantApi, type DocumentKind, type MerchantStore, type StoreDocument } from '@/lib/api/lojista';
import type { UploadDocumentFn } from '@/lib/image/upload';
import { ltid } from '@/lib/testid';
import { DOCUMENT_LABEL, DocSlot, REQUIRED_DOCUMENTS } from '../doc-slot';
import { STORE_KEY } from '../store-context';
import s from '../lojista.module.css';
import { StepFrame } from './step-frame';

/** Atualiza o documento do slot no cache do rascunho (o novo substitui o anterior, WB-052 C6). */
export function useDocumentCache() {
  const client = useQueryClient();
  return (doc: StoreDocument) =>
    client.setQueryData<MerchantStore | null>(STORE_KEY, (current) => (current ? { ...current, documents: [...current.documents.filter((d) => d.kind !== doc.kind), doc] } : current));
}

interface Props {
  store: MerchantStore;
  next: string;
  backHref?: string | undefined;
  upload?: UploadDocumentFn;
}

/** L5, Etapa 3 de 4: documentos pelo celular. "Continuar" fica ativo; se faltar item, rola até o primeiro e diz o que falta. */
export function Step3({ store, next, backHref, upload }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const client = useQueryClient();
  const putDocument = useDocumentCache();
  const list = useRef<HTMLDivElement>(null);
  const [showMissing, setShowMissing] = useState(false);
  const kinds = REQUIRED_DOCUMENTS[store.legalType ?? 'cpf'];
  const sent = new Map(store.documents.map((doc) => [doc.kind, doc]));
  const missing = kinds.filter((kind) => !sent.has(kind));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missing.length > 0) {
      setShowMissing(true);
      requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-testid="${ltid('etapa3', `slot-${missing[0] as DocumentKind}`)}"]`)?.scrollIntoView({ block: 'center' }));
      return;
    }
    // `step` vem do que a API diz faltar: relê a loja para a etapa 4 abrir (sem isso a guarda de ordem volta à etapa 3).
    try {
      await client.fetchQuery({ queryKey: STORE_KEY, queryFn: merchantApi.store, staleTime: 0 });
    } catch {
      client.setQueryData<MerchantStore | null>(STORE_KEY, (current) => (current ? { ...current, step: Math.max(current.step, 3) } : current));
    }
    toast.show('Documentos enviados.');
    router.push(next as never);
  }

  return (
    <StepFrame step={3} screen="etapa3" title="Envie seus documentos" savedAt={savedAt} backHref={backHref} submitLabel="Continuar" onSubmit={submit}>
      <p className="wb-text-body" style={{ margin: 0 }}>
        Fotografe com boa luz e sem cortar as bordas. Só a equipe do Webag vê seus documentos.
      </p>
      {showMissing && missing.length > 0 ? (
        <Banner tone="warning" testId={ltid('etapa3', 'missing-list')}>
          Falta enviar: {missing.map((kind) => DOCUMENT_LABEL[kind].toLowerCase()).join(', ')}.
        </Banner>
      ) : null}
      <div ref={list} className={s.slots}>
        {kinds.map((kind) => (
          <DocSlot key={kind} storeId={store.id} kind={kind} existing={sent.get(kind)} onUploaded={(doc) => { putDocument(doc); setSavedAt(doc.uploadedAt); }} {...(upload ? { upload } : {})} missing={showMissing} />
        ))}
      </div>
      <span className={ui.srOnly} role="status" aria-live="polite">
        {missing.length === 0 ? 'Todos os documentos foram enviados.' : ''}
      </span>
    </StepFrame>
  );
}

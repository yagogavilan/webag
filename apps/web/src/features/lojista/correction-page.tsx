'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { QueryBoundary, SkeletonRows, useToast } from '@/components/ui';
import { merchantApi, type MerchantStore } from '@/lib/api/lojista';
import { useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_LABEL, DocSlot, REQUIRED_DOCUMENTS } from './doc-slot';
import { STORE_KEY, useMerchant } from './store-context';
import s from './lojista.module.css';
import { SaveError, StepFrame } from './onboarding/step-frame';
import { useDocumentCache } from './onboarding/step3';
import { draftErrorMessage } from './onboarding/use-draft';

/** L5 em modo correção (WB-054 C3): só os itens com problema ficam editáveis, cada um com o motivo do admin; o resto aparece "Conferido". */
export function CorrectionPage() {
  const router = useRouter();
  const { store: query } = useMerchant();
  const data = query.data;
  useEffect(() => {
    if (data !== undefined && data?.status !== 'correction_requested') router.replace('/lojista');
  }, [data, router]);
  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={3} height={96} label="Carregando as correções" />}>
      {(store) => (store && store.status === 'correction_requested' ? <Corrections store={store} /> : <SkeletonRows rows={2} height={64} />)}
    </QueryBoundary>
  );
}

function Corrections({ store }: { store: MerchantStore }) {
  const router = useRouter();
  const toast = useToast();
  const client = useQueryClient();
  const putDocument = useDocumentCache();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const kinds = REQUIRED_DOCUMENTS[store.legalType ?? 'cpf'];
  const flagged = (kind: string) => store.corrections.find((c) => c.target.type === 'document' && c.target.kind === kind);
  const pending = store.corrections.filter((c) => !c.fixed);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (pending.length > 0) return setMissing(true);
    setBusy(true);
    try {
      const sent = await merchantApi.resubmit();
      client.setQueryData<MerchantStore | null>(STORE_KEY, sent);
      toast.show('Cadastro reenviado para análise.');
      router.push('/lojista');
    } catch (caught) {
      setBusy(false);
      setError(draftErrorMessage(caught));
    }
  }

  return (
    <StepFrame screen="correcao" label="Correção pedida" title="Corrija os documentos" submitLabel="Reenviar para análise" busyLabel="Enviando…" busy={busy} backHref="/lojista" onSubmit={submit} error={error ? <SaveError message={error} /> : null}>
      <div className={s.slots}>
        {kinds.map((kind) => {
          const item = flagged(kind);
          return (
            <DocSlot
              key={kind}
              kind={kind}
              existing={store.documents.find((doc) => doc.kind === kind)}
              locked={!item}
              correction={item && !item.fixed ? item.message : undefined}
              missing={missing && Boolean(item && !item.fixed)}
              onUploaded={putDocument}
            />
          );
        })}
      </div>
      {missing && pending.length > 0 ? (
        <p className="wb-text-body" role="alert" data-testid="lojista.correcao.missing" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>
          Falta corrigir: {pending.map((c) => (c.target.type === 'document' ? DOCUMENT_LABEL[c.target.kind].toLowerCase() : 'dados da loja')).join(', ')}.
        </p>
      ) : null}
    </StepFrame>
  );
}

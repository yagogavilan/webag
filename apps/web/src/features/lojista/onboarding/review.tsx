'use client';

import type { CategoryTree } from '@webag/shared';
import { CheckCircle, FileImage, FilePdf } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Banner, ButtonLink, SkeletonRows, cx, ui, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { merchantApi, type MerchantStore } from '@/lib/api/lojista';
import { maskPhone } from '@/lib/br/mask';
import { CATALOG_READY, NEW_PRODUCT_PATH, maskedDocument, onboardingPath } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import { DOCUMENT_LABEL, REQUIRED_DOCUMENTS } from '../doc-slot';
import { STORE_KEY } from '../store-context';
import s from '../lojista.module.css';
import { SaveError, StepFrame } from './step-frame';
import { draftErrorMessage } from './use-draft';

interface Missing {
  text: string;
  step: 1 | 2 | 3 | 4;
}

/** O que falta para enviar (onda-2 L7): cada item aponta a etapa onde se resolve. */
export function missingItems(store: MerchantStore): Missing[] {
  const out: Missing[] = [];
  if (!store.legalType || !store.document) out.push({ text: 'CPF ou CNPJ', step: 1 });
  else if (store.legalType === 'cnpj' && (!store.legalName || !store.fiscalAccepted)) out.push({ text: 'razão social e aceite fiscal', step: 1 });
  if (!store.name || !store.categoryId || !store.whatsapp) out.push({ text: 'dados da loja', step: 2 });
  if (!store.address || !store.address.street || !store.address.cep) out.push({ text: 'endereço da loja', step: 2 });
  const sent = new Set(store.documents.map((doc) => doc.kind));
  for (const kind of REQUIRED_DOCUMENTS[store.legalType ?? 'cpf']) {
    if (!sent.has(kind)) out.push({ text: DOCUMENT_LABEL[kind].toLowerCase(), step: 3 });
  }
  // A API só aceita o envio com a conta de recebimento conectada (divergência com o L7, ver pendências do contrato).
  if (store.payout.status === 'not_connected') out.push({ text: 'conta de recebimento (Mercado Pago)', step: 4 });
  return out;
}

/** Etapa onde se resolve cada pendência que a API devolve em `ONBOARDING_INCOMPLETE`. */
function stepOfField(field: string): 1 | 2 | 3 | 4 {
  if (field === 'legalName' || field === 'fiscalResponsibilityAccepted') return 1;
  if (field.startsWith('documents.')) return 3;
  if (field === 'paymentAccount') return 4;
  return 2;
}

/** L7: confere os 4 blocos, envia para análise e mostra a tela de sucesso. */
export function Review({ store, backHref }: { store: MerchantStore; backHref?: string | undefined }) {
  const client = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverMissing, setServerMissing] = useState<Missing[]>([]);
  const categories = useQuery({ queryKey: ['lojista', 'categories'], queryFn: () => apiRequest<CategoryTree>('lojista', 'categories'), staleTime: 5 * 60_000 });
  const missing = serverMissing.length > 0 ? serverMissing : missingItems(store);
  const connected = store.payout.status === 'connected';
  const edit = (step: 1 | 2 | 3 | 4) => `${onboardingPath(String(step) as '1')}?de=revisao`;

  if (store.status === 'in_review') return <Submitted store={store} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (missing.length > 0) return setShowMissing(true);
    setBusy(true);
    try {
      const sent = await merchantApi.submit(store.id);
      client.setQueryData<MerchantStore | null>(STORE_KEY, sent);
      toast.show('Cadastro enviado para análise.');
    } catch (caught) {
      setBusy(false);
      if (caught instanceof ApiError && caught.code === 'ONBOARDING_INCOMPLETE') {
        setServerMissing(caught.fields.map((field) => ({ text: field.message.replace(/\.$/, ''), step: stepOfField(field.field) })));
        return setShowMissing(true);
      }
      setFormError(draftErrorMessage(caught));
    }
  }

  const category = categories.data?.data.find((item) => item.id === store.categoryId)?.name;
  const address = store.address;
  const addressLine = address ? [`${address.street}${address.noNumber ? ', s/n' : address.number ? `, ${address.number}` : ''}`, address.complement, address.neighborhood, `${address.city}${address.state ? ` - ${address.state}` : ''}`, address.cep].filter(Boolean).join(' · ') : '';

  return (
    <StepFrame screen="revisao" title="Confira e envie" backHref={backHref} submitLabel="Enviar para análise" busyLabel="Enviando…" busy={busy} onSubmit={submit} error={formError ? <SaveError message={formError} /> : null}>
      {categories.isPending ? <SkeletonRows rows={1} height={24} label="Carregando o resumo" /> : null}
      {!connected ? (
        <Banner tone="info" testId={ltid('revisao', 'payout-banner')}>
          Falta conectar o Mercado Pago. Conecte antes de enviar: a loja só vai ao ar depois de conectar.
        </Banner>
      ) : null}
      {showMissing && missing.length > 0 ? (
        <Banner tone="danger" testId={ltid('revisao', 'missing-list')}>
          <div>
            <strong>Falta:</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {missing.map((item) => (
                <li key={item.text}>
                  {item.text} (<Link href={`${onboardingPath(String(item.step) as '1')}?de=revisao` as never}>Etapa {item.step}</Link>)
                </li>
              ))}
            </ul>
          </div>
        </Banner>
      ) : null}

      <Block id="1" title="Quem é você" href={edit(1)}>
        <dl className={s.reviewList}>
          <dt className="wb-text-caption">{store.legalType === 'cnpj' ? 'CNPJ' : 'CPF'}</dt>
          <dd className="wb-text-body">{maskedDocument(store.document) || 'Falta informar'}</dd>
          {store.legalType === 'cnpj' ? (
            <>
              <dt className="wb-text-caption">Razão social</dt>
              <dd className="wb-text-body">{store.legalName ?? 'Falta informar'}</dd>
            </>
          ) : null}
        </dl>
      </Block>
      <Block id="2" title="Sua loja" href={edit(2)}>
        <dl className={s.reviewList}>
          <dt className="wb-text-caption">Nome e categoria</dt>
          <dd className="wb-text-body">{[store.name, category].filter(Boolean).join(' · ') || 'Falta informar'}</dd>
          <dt className="wb-text-caption">WhatsApp</dt>
          <dd className="wb-text-body">{store.whatsapp ? maskPhone(store.whatsapp) : 'Falta informar'}</dd>
          <dt className="wb-text-caption">Endereço</dt>
          <dd className="wb-text-body">{addressLine || 'Falta informar'}</dd>
        </dl>
      </Block>
      <Block id="3" title="Documentos" href={edit(3)}>
        <ul className={s.thumbs} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {store.documents.map((doc) => (
            <li key={doc.kind} className={s.thumb} title={DOCUMENT_LABEL[doc.kind]} aria-label={`${DOCUMENT_LABEL[doc.kind]}: enviado`}>
              {doc.mimeType === 'application/pdf' ? <FilePdf size={24} aria-hidden="true" /> : <FileImage size={24} aria-hidden="true" />}
            </li>
          ))}
        </ul>
        <p className="wb-text-caption" style={{ margin: 0 }}>
          {store.documents.length} {store.documents.length === 1 ? 'documento enviado' : 'documentos enviados'}
        </p>
      </Block>
      <Block id="4" title="Receber" href={edit(4)}>
        {connected ? (
          <span className="wb-text-body" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <CheckCircle size={20} weight="fill" aria-hidden="true" /> {store.payout.simulated ? 'Conta de teste conectada' : 'Conta conectada'}
          </span>
        ) : (
          <Banner tone="warning">Falta conectar</Banner>
        )}
      </Block>
    </StepFrame>
  );
}

function Block({ id, title, href, children }: { id: string; title: string; href: string; children: React.ReactNode }) {
  return (
    <section className={cx(ui.card, s.review)} aria-labelledby={`rev-${id}`} data-testid={ltid('revisao', `section-${id}`)}>
      <div className={s.reviewHead}>
        <h2 id={`rev-${id}`} className="wb-text-title2" style={{ margin: 0 }}>
          {title}
        </h2>
        <Link href={href as never} className="wb-text-body-strong" style={{ minHeight: 'var(--wb-size-touch-min)', display: 'inline-flex', alignItems: 'center' }} aria-label={`Editar: ${title}`} data-testid={ltid('revisao', `section-${id}-edit`)}>
          Editar
        </Link>
      </div>
      {children}
    </section>
  );
}

/** Tela de sucesso do envio (e do acesso à revisão depois de enviar). */
function Submitted({ store }: { store: MerchantStore }) {
  return (
    <div className={s.success} data-testid={ltid('revisao', 'success')}>
      <CheckCircle size={64} weight="fill" className={s.successIcon} aria-hidden="true" />
      <h1 className={`wb-text-title1 ${s.title}`} tabIndex={-1} ref={(node) => node?.focus()}>
        Recebemos seu cadastro
      </h1>
      <p className="wb-text-body" style={{ margin: 0 }}>
        Respondemos em até {store.slaBusinessDays} dias úteis.
      </p>
      <div className={s.formCol} style={{ width: '100%' }}>
        {CATALOG_READY ? (
          <ButtonLink href={NEW_PRODUCT_PATH as never} size="lg" data-testid={ltid('revisao', 'success-add-products')}>
            Cadastrar produtos
          </ButtonLink>
        ) : null}
        <ButtonLink href="/lojista" size="lg" variant={CATALOG_READY ? 'text' : 'primary'} data-testid={ltid('revisao', 'success-status')}>
          Ver andamento
        </ButtonLink>
      </div>
    </div>
  );
}



'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { CheckboxField, RadioCards, TextField, ui } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import type { LegalType, MerchantStore } from '@/lib/api/lojista';
import { documentError } from '@/lib/br/document';
import { cnpjChars, maskDocument, onlyDigits } from '@/lib/br/mask';
import { supportHref } from '@/lib/lojista-access';
import { ltid } from '@/lib/testid';
import { SaveError, StepFrame } from './step-frame';
import { draftErrorMessage, useSaveDraft } from './use-draft';

interface Props {
  store: MerchantStore | null;
  next: string;
  backHref?: string | undefined;
}

/** L3, Etapa 1 de 4: CPF ou CNPJ (com máscara e dígito verificador, inclusive CNPJ alfanumérico). */
export function Step1({ store, next, backHref }: Props) {
  const router = useRouter();
  const save = useSaveDraft();
  const form = useRef<HTMLDivElement>(null);
  const [type, setType] = useState<LegalType>(store?.legalType ?? 'cpf');
  const [document, setDocument] = useState(store?.document ? maskDocument(store.legalType ?? 'cpf', store.document) : '');
  const [legalName, setLegalName] = useState(store?.legalName ?? '');
  const [fiscal, setFiscal] = useState(store?.fiscalAccepted ?? false);
  const [errors, setErrors] = useState<{ document?: string; legalName?: string; fiscal?: string; duplicate?: boolean }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  function changeType(value: LegalType) {
    if (value === type) return;
    setType(value);
    setDocument('');
    setErrors({});
    setAnnounce(value === 'cnpj' ? 'CNPJ selecionado' : 'CPF selecionado');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const next_: typeof errors = {};
    const docError = documentError(type, document);
    if (docError) next_.document = docError;
    if (type === 'cnpj' && legalName.trim().length < 2) next_.legalName = 'Digite a razão social.';
    if (type === 'cnpj' && !fiscal) next_.fiscal = 'Marque a caixa para continuar.';
    setErrors(next_);
    if (Object.keys(next_).length > 0) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    try {
      await save.mutateAsync({
        step: Math.max(store?.step ?? 0, 1),
        legalType: type,
        document: type === 'cpf' ? onlyDigits(document) : cnpjChars(document),
        ...(type === 'cnpj' ? { legalName: legalName.trim(), fiscalAccepted: true } : {}),
      });
      router.push(next as never);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'DOCUMENT_IN_USE') return setErrors({ document: 'Esse CPF/CNPJ já tem loja.', duplicate: true });
      setFormError(draftErrorMessage(caught));
    }
  }

  return (
    <StepFrame step={1} screen="etapa1" title="Quem vai vender?" savedAt={store?.updatedAt && store.step >= 1 ? store.updatedAt : null} backHref={backHref} submitLabel="Continuar" busy={save.isPending} onSubmit={submit} error={formError ? <SaveError message={formError} /> : null}>
      <div ref={form} className={ui.stack}>
        <RadioCards<LegalType>
          legend="Tipo de documento"
          name="legal-type"
          value={type}
          onChange={changeType}
          options={[
            { value: 'cpf', label: 'CPF', testId: ltid('etapa1', 'type-cpf') },
            { value: 'cnpj', label: 'CNPJ (MEI incluso)', testId: ltid('etapa1', 'type-cnpj') },
          ]}
        />
        <span className={ui.srOnly} role="status" aria-live="polite">
          {announce}
        </span>
        <TextField
          label={type === 'cpf' ? 'Número do CPF' : 'Número do CNPJ'}
          value={document}
          onChange={(e) => setDocument(maskDocument(type, e.target.value))}
          inputMode={type === 'cpf' ? 'numeric' : 'text'}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
          error={errors.document}
          data-testid={ltid('etapa1', 'document-input')}
        />
        {errors.duplicate ? (
          <a href={supportHref()} target="_blank" rel="noopener noreferrer" className="wb-text-body" data-testid={ltid('etapa1', 'support-link')}>
            Falar com o suporte
          </a>
        ) : null}
        {type === 'cnpj' ? (
          <>
            <TextField label="Razão social" value={legalName} onChange={(e) => setLegalName(e.target.value)} autoComplete="organization" error={errors.legalName} data-testid={ltid('etapa1', 'legal-name-input')} />
            <CheckboxField checked={fiscal} onChange={(e) => setFiscal(e.target.checked)} error={errors.fiscal} label="Sei que minha loja é responsável pelas notas fiscais e pelos impostos das vendas." data-testid={ltid('etapa1', 'fiscal-checkbox')} />
          </>
        ) : null}
      </div>
    </StepFrame>
  );
}

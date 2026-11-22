'use client';

import { CaretDown, CaretUp, CheckCircle, CloudSlash, Package, WarningCircle } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, ButtonLink, CheckboxField, Dialog, MessageState, QueryBoundary, SelectField, SkeletonRows, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import { apiRequest } from '@/lib/api/client';
import { catalogApi, catalogErrorMessage, catalogKeys, type CatalogQuickStart, type CategoryTemplate, type Product } from '@/lib/api/catalog';
import { NAME_MAX, pickImage } from '@/lib/catalog/helpers';
import { readQuickCopy, removeQuickCopy, writeQuickCopy } from '@/lib/catalog/local-copy';
import { QUICK_MESSAGES, descriptionMessage, type QuickErrors, type QuickField, type QuickValues } from '@/lib/catalog/quick';
import { fromServer, toRequest, validateGrid } from '@/lib/catalog/variants';
import { formatCents, formatClock } from '@/lib/format';
import { canSeeSalesValues } from '@/lib/lojista-access';
import { centsFromDigits, moneyField, parseCents } from '@/lib/money';
import { youReceive, worstProviderFeePct } from '@/lib/catalog/receive';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import type { CategoryTree } from '@webag/shared';
import { CatalogGate } from '../catalog-gate';
import type { Photo } from '../photo-gallery';
import { useMerchant } from '../../lojista/store-context';
import { EMPTY_GRADE, QuickGrade, type GradeState } from './quick-grade';
import { QuickPhotos } from './quick-photos';
import { useQuickPublisher } from './quick-publish';
import { QuickPublished } from './quick-published';
import { useDraftSync, type SyncStatus } from './quick-sync';
import q from './quick.module.css';

const T = (id: string) => ltid('rapido', id);

/** `/lojista/produtos/novo/[id]`: carrega o rascunho, o ponto de partida da loja, as categorias e os modelos (4 estados). */
export function QuickProductPage({ productId, autoCamera }: { productId: string; autoCamera: boolean }) {
  return <CatalogGate>{(store) => <QuickLoader storeId={store.id} productId={productId} autoCamera={autoCamera} />}</CatalogGate>;
}

function QuickLoader({ storeId, productId, autoCamera }: { storeId: string; productId: string; autoCamera: boolean }) {
  const product = useQuery({ // Fora de `catalogKeys.all`: publicar invalida o catálogo, e esta consulta não pode trocar a tela "Publicado" por "já está publicado".
    queryKey: ['lojista', 'quick-draft', storeId, productId], queryFn: () => catalogApi.get(storeId, productId), gcTime: 0, staleTime: 0 });
  const start = useQuery({ queryKey: catalogKeys.quickStart(storeId), queryFn: () => catalogApi.quickStart(storeId), staleTime: 60_000 });
  const templates = useQuery({ queryKey: catalogKeys.templates, queryFn: () => catalogApi.templates(), staleTime: 5 * 60_000 });
  const categories = useQuery({ queryKey: ['lojista', 'categories'], queryFn: () => apiRequest<CategoryTree>('lojista', 'categories'), staleTime: 5 * 60_000 });
  return (
    <QueryBoundary query={product} skeleton={<SkeletonRows rows={5} height={64} label="Carregando o rascunho" />}>
      {(draft) =>
        draft.status !== 'draft' ? (
          <MessageState icon={Package} title="Este produto já está publicado" text="Para mudar preço, estoque ou fotos, abra o produto." testId={T('already')}>
            <ButtonLink href={asRoute(`/lojista/produtos/${draft.id}`)}>Ver produto</ButtonLink>
          </MessageState>
        ) : (
          <QuickForm
            storeId={storeId}
            product={draft}
            quickStart={start.data ?? null}
            templates={templates.data?.data ?? []}
            categories={categories.data ?? null}
            metaLoading={start.isPending || categories.isPending}
            autoCamera={autoCamera}
          />
        )
      }
    </QueryBoundary>
  );
}

function photosOf(product: Product, extraIds: string[]): Photo[] {
  const fromServer: Photo[] = [...product.images]
    .sort((a, b) => a.position - b.position)
    .map((image) => ({ key: image.id, assetId: image.id, previewUrl: pickImage(image.urls, 160) ?? '', status: 'ready', progress: 100 }));
  const known = new Set(fromServer.map((p) => p.assetId));
  // Fotos enviadas antes da recarga e ainda não ligadas ao rascunho: só o id está na cópia local, sem prévia.
  const extra: Photo[] = extraIds.filter((id) => !known.has(id)).map((id) => ({ key: id, assetId: id, previewUrl: '', status: 'ready', progress: 100 }));
  return [...fromServer, ...extra];
}

interface FormProps {
  storeId: string;
  product: Product;
  quickStart: CatalogQuickStart | null;
  templates: CategoryTemplate[];
  categories: CategoryTree | null;
  metaLoading: boolean;
  autoCamera: boolean;
}

/** "Você recebe cerca de R$ X" (DEC-035). Quem não vê valores de venda só lê a ajuda; sem a comissão da loja, não calcula e nunca bloqueia. */
function EarningsHint({ priceCents }: { priceCents: number | null }) {
  const { store } = useMerchant();
  const data = store.data;
  if (!canSeeSalesValues(data)) return <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>O preço deve incluir a comissão da Webag.</p>;
  const pct = data?.commissionPct ?? null;
  const result = priceCents && priceCents > 0 && pct !== null ? youReceive(priceCents, pct, worstProviderFeePct(data?.providerFeePct)) : null;
  return (
    <div className={q.earnings} role="status" aria-live="polite" data-testid={T('earnings')}>
      <p className="wb-text-body" style={{ margin: 0 }}>
        {pct === null ? 'Não conseguimos calcular agora. Você pode publicar e conferir depois.' : result ? <>Você recebe cerca de <strong>{formatCents(result.receive)}</strong></> : 'Informe o preço para ver quanto você recebe.'}
      </p>
    </div>
  );
}

function Strip({ status, online, savedAt }: { status: SyncStatus; online: boolean; savedAt: number | null }) {
  let text: string;
  if (!online) text = QUICK_MESSAGES.offlinePublish;
  else if (status === 'saving') text = 'Salvando…';
  else if (status === 'saved') text = savedAt ? `Salvo · ${formatClock(new Date(savedAt))}` : 'Salvo';
  else if (status === 'error') text = 'Não salvou agora. O que você digitou fica neste aparelho.';
  else text = 'Salvo neste aparelho';
  const bad = !online || status === 'error';
  return (
    <div className={cx(q.strip, bad && q.stripOffline)} role="status" aria-live="polite" data-testid={T('strip')}>
      {bad ? <CloudSlash size={20} aria-hidden="true" /> : <CheckCircle size={20} aria-hidden="true" />}
      <span className="wb-text-caption">{text}</span>
    </div>
  );
}

function Accordion({ title, open, onToggle, children, testId }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode; testId: string }) {
  return (
    <div className={q.accordion}>
      <button type="button" className={cx(q.accordionTrigger, 'wb-text-body-strong')} aria-expanded={open} onClick={onToggle} data-testid={testId}>
        {title}
        {open ? <CaretUp size={20} aria-hidden="true" /> : <CaretDown size={20} aria-hidden="true" />}
      </button>
      {open ? <div className={q.accordionBody}>{children}</div> : null}
    </div>
  );
}

export function QuickForm({ storeId, product, quickStart, templates, categories, metaLoading, autoCamera }: FormProps) {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const { user } = useMerchant();

  const initial = useMemo(() => {
    const copy = readQuickCopy(user.id, storeId, product.id);
    const serverValues: QuickValues = {
      name: product.name,
      priceCents: product.basePriceCents,
      stockText: product.variantAttributes.length === 0 && product.variants.length === 1 ? String(product.variants[0]?.stock ?? 1) : '1',
      categoryId: product.categoryId ?? '',
      description: product.description ?? '',
    };
    // A cópia local só vale quando o servidor ainda não tem o que foi digitado (recarga ao voltar da câmera, queda de sinal).
    const values: QuickValues = copy?.unsent ? { name: copy.name, priceCents: copy.priceCents, stockText: copy.stockText, categoryId: copy.categoryId || serverValues.categoryId, description: copy.description } : serverValues;
    const grade: GradeState = (() => {
      if (product.variantAttributes.length === 0) return EMPTY_GRADE;
      const parsed = fromServer(product.variantAttributes, product.variants);
      return { attrs: parsed.attrs, rows: parsed.rows, excluded: [] };
    })();
    return { values, photos: photosOf(product, copy?.imageIds ?? []), grade, recovered: Boolean(copy?.unsent) };
    // Só na chegada: o formulário parte de um instante e depois é dono do próprio estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [values, setValues] = useState<QuickValues>(initial.values);
  const [photos, setPhotos] = useState<Photo[]>(initial.photos);
  const [grade, setGrade] = useState<GradeState>(initial.grade);
  const [errors, setErrors] = useState<QuickErrors>({});
  const [gradeError, setGradeError] = useState<string | undefined>(undefined);
  const [moreOpen, setMoreOpen] = useState(false);
  const [gradeOpen, setGradeOpen] = useState(initial.grade.rows.length > 0);
  const [noExchange, setNoExchange] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const categoryTouched = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const stockRef = useRef<HTMLInputElement>(null);

  const categoryOptions = useMemo(
    () =>
      (categories?.data ?? [])
        .filter((category) => category.active)
        .flatMap((category) => [{ id: category.id, name: category.name }, ...category.children.filter((child) => child.active).map((child) => ({ id: child.id, name: `${category.name} › ${child.name}` }))]),
    [categories],
  );
  const suggestedId = quickStart?.suggestedCategoryId ?? null;
  const template = templates.find((t) => t.categoryId === values.categoryId) ?? null;
  const descriptionRequired = template?.descriptionRequired ?? false;
  const descriptionMin = template?.descriptionMinChars ?? 20;
  const variantsMax = quickStart?.limits.variantsMax ?? 100;

  // Categoria "a última usada": entra quando o ponto de partida chega, se o lojista ainda não escolheu (C4).
  useEffect(() => {
    if (suggestedId && values.categoryId === '' && !categoryTouched.current) setValues((current) => (current.categoryId === '' ? { ...current, categoryId: suggestedId } : current));
  }, [suggestedId, values.categoryId]);

  const imageIds = useMemo(() => photos.filter((p) => p.status === 'ready' && p.assetId).map((p) => p.assetId as string), [photos]);

  const setField = <K extends keyof QuickValues>(key: K, value: QuickValues[K], clear: QuickField) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [clear]: undefined }));
  };

  const focusField = useCallback((field: QuickField) => {
    requestAnimationFrame(() => {
      const target = field === 'photo' ? document.querySelector<HTMLElement>(`[data-testid="${T('camera')}"]`) : document.querySelector<HTMLElement>('[aria-invalid="true"]');
      target?.focus();
      target?.scrollIntoView?.({ block: 'center' });
    });
  }, []);

  const [published, setPublished] = useState(false);
  const sync = useDraftSync({ storeId, product, values, imageIds, online, paused: published });

  // Cópia local (só contra recarga): a cada mudança, com o aviso de "ainda não enviado" enquanto o servidor não confirmou.
  useEffect(() => {
    if (published) return;
    const id = setTimeout(() => writeQuickCopy(user.id, storeId, product.id, { ...values, imageIds, unsent: sync.dirty || sync.status !== 'saved' }), 300);
    return () => clearTimeout(id);
  }, [values, imageIds, sync.dirty, sync.status, published, user.id, storeId, product.id]);

  const publisher = useQuickPublisher({
    storeId,
    productId: product.id,
    values,
    photos,
    grade,
    context: { descriptionRequired, descriptionMin },
    online,
    versionRef: sync.versionRef,
    flush: sync.flush,
    setErrors,
    focusField,
    noVoluntaryExchange: noExchange,
    onDone: (done) => {
      setPublished(true);
      removeQuickCopy(user.id, storeId, product.id);
      if (noExchange) void catalogApi.update(storeId, done.id, { noVoluntaryExchange: true }).catch(() => undefined);
    },
  });

  function onPublish() {
    if (grade.rows.length > 0) {
      const check = validateGrid(grade.attrs, grade.rows, parseCents);
      const problem = grade.rows.length > variantsMax ? `Máximo de ${variantsMax} combinações. Tire alguma opção.` : (check.general[0] ?? check.rows[0]?.message);
      if (problem) {
        setGradeError(problem);
        setGradeOpen(true);
        return;
      }
    }
    setGradeError(undefined);
    void publisher.publish();
  }

  async function onSaveDraft() {
    if (!online) {
      setSaveNote(QUICK_MESSAGES.offlineSave);
      return;
    }
    setSaveNote(null);
    setSaving(true);
    try {
      await sync.flush();
      if (grade.rows.length > 0) {
        await catalogApi.setVariants(storeId, product.id, toRequest(grade.attrs, grade.rows, parseCents));
      }
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      removeQuickCopy(user.id, storeId, product.id);
      toast.show('Rascunho guardado. Continue quando quiser.');
      router.push(asRoute('/lojista/produtos?filtro=draft'));
    } catch (caught) {
      setSaveNote(catalogErrorMessage(caught, 'Não conseguimos guardar agora. O que você digitou continua aqui.'));
    } finally {
      setSaving(false);
    }
  }

  if (publisher.phase.kind === 'done') return <QuickPublished storeId={storeId} product={publisher.phase.product} />;

  const { phase, busy } = publisher;
  const waitingPhoto = phase.kind === 'waiting_upload' || phase.kind === 'waiting_server';
  // Espera pela foto no aparelho não trava os campos (dá para corrigir o nome); durante a chamada ao servidor, sim.
  const locked = phase.kind === 'publishing' || phase.kind === 'waiting_server';
  const uploading = photos.find((p) => p.status === 'uploading');
  const gradeCount = grade.rows.length;
  const stockTotal = grade.rows.reduce((sum, row) => sum + row.stock, 0);

  return (
    <div className={q.page} data-testid={T('form')}>
      <h2 className="wb-text-title1" style={{ margin: 0 }}>Novo produto</h2>
      <Strip status={sync.status} online={online} savedAt={sync.savedAt} />
      {initial.recovered ? <Banner tone="info" testId={T('recovered')}>Recuperamos o que você digitou neste aparelho. Confira antes de publicar.</Banner> : null}
      {!online ? (
        <Banner tone="warning" offline testId={T('offline-banner')}>
          {QUICK_MESSAGES.offlinePublish}
        </Banner>
      ) : null}

      <fieldset disabled={locked} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: 'grid', gap: 'var(--wb-space-4)' }}>
        <QuickPhotos
          storeId={storeId}
          photos={photos}
          onChange={(update) => {
            setPhotos(update);
            setErrors((current) => ({ ...current, photo: undefined }));
          }}
          online={online}
          productName={values.name}
          error={errors.photo}
          autoCamera={autoCamera}
          onAdded={() => requestAnimationFrame(() => nameRef.current?.focus())}
        />

        <TextField
          ref={nameRef}
          label="Nome do produto"
          value={values.name}
          autoComplete="off"
          enterKeyHint="next"
          error={errors.name}
          {...(values.name.length >= 60 ? { counter: { value: values.name.length, max: NAME_MAX } } : {})}
          onChange={(event) => setField('name', event.target.value, 'name')}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              priceRef.current?.focus();
            }
          }}
          data-testid={T('name')}
        />

        <div className={q.fieldRow}>
          <TextField
            ref={priceRef}
            className={q.priceInput}
            label="Preço (R$)"
            inputMode="decimal"
            enterKeyHint="next"
            autoComplete="off"
            placeholder="0,00"
            value={moneyField(values.priceCents)}
            error={errors.price}
            onChange={(event) => {
              const cents = centsFromDigits(event.target.value);
              setField('priceCents', cents > 0 ? cents : null, 'price');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && gradeCount === 0) {
                event.preventDefault();
                stockRef.current?.focus();
              }
            }}
            data-testid={T('price')}
          />
          <EarningsHint priceCents={values.priceCents} />
        </div>

        {gradeCount === 0 ? (
          <TextField
            ref={stockRef}
            label="Quantidade em estoque"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            value={values.stockText}
            error={errors.stock}
            hint="Se você não mudar, fica 1."
            onChange={(event) => setField('stockText', event.target.value.replace(/\D/g, '').slice(0, 5), 'stock')}
            data-testid={T('stock')}
          />
        ) : (
          <p className="wb-text-body-strong" data-testid={T('stock-total')}>{stockTotal.toLocaleString('pt-BR')} {stockTotal === 1 ? 'unidade' : 'unidades'} no total</p>
        )}

        <SelectField
          label="Categoria"
          value={values.categoryId}
          error={errors.category}
          hint={values.categoryId !== '' && values.categoryId === suggestedId ? 'A última que você usou. Toque para trocar.' : undefined}
          onChange={(event) => {
            categoryTouched.current = true;
            setField('categoryId', event.target.value, 'category');
          }}
          data-testid={T('category')}
        >
          <option value="">{metaLoading && categoryOptions.length === 0 ? 'Carregando categorias…' : 'Escolha a categoria'}</option>
          {categoryOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </SelectField>
        {errors.category === QUICK_MESSAGES.forbidden ? (
          <p className="wb-text-body" data-testid={T('forbidden-help')}>
            <a href="/termos-do-lojista" target="_blank" rel="noopener noreferrer">Ver o que não pode ser vendido</a>
          </p>
        ) : null}

        {template?.noVoluntaryExchangeHint ? (
          <CheckboxField label="Não aceita troca por tamanho ou cor (sugestão para este tipo de produto)" checked={noExchange} onChange={(event) => setNoExchange(event.target.checked)} data-testid={T('no-exchange')} />
        ) : null}
      </fieldset>

      <Accordion title="Tem tamanhos ou cores?" open={gradeOpen} onToggle={() => setGradeOpen((v) => !v)} testId={T('grade-toggle')}>
        <fieldset disabled={locked} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <QuickGrade template={template} variantsMax={variantsMax} state={grade} onChange={(next) => { setGrade(next); setGradeError(undefined); }} error={gradeError} />
        </fieldset>
      </Accordion>

      <Accordion title={descriptionRequired ? 'Descrição (obrigatória nesta categoria)' : 'Mais detalhes (opcional)'} open={moreOpen || descriptionRequired || Boolean(errors.description)} onToggle={() => setMoreOpen((v) => !v)} testId={T('more-toggle')}>
        <TextArea
          label="Descrição"
          rows={4}
          value={values.description}
          maxLength={1000}
          error={errors.description}
          hint={descriptionRequired ? descriptionMessage(descriptionMin) : 'Material, medidas, cuidados. Ajuda o cliente a decidir.'}
          disabled={locked}
          onChange={(event) => setField('description', event.target.value, 'description')}
          data-testid={T('description')}
        />
      </Accordion>

      {waitingPhoto ? (
        <div className={q.statusBox} role="status" aria-live="polite" data-testid={T('waiting-photo')}>
          <h3 className="wb-text-title2" style={{ margin: 0 }}>{phase.kind === 'waiting_upload' && uploading ? `Enviando a foto… ${uploading.progress}%` : 'Foto ainda enviando…'}</h3>
          <span className={q.progress} aria-hidden="true"><span className={q.progressFill} style={{ width: `${uploading?.progress ?? 100}%` }} /></span>
          <p className="wb-text-body" style={{ margin: 0 }}>Falta pouco. Publicamos sozinho quando terminar. Você não perde o que digitou.</p>
          {phase.kind === 'waiting_upload' ? <Button variant="secondary" onClick={publisher.cancelWaiting} data-testid={T('back-to-form')}>Voltar ao cadastro</Button> : null}
        </div>
      ) : null}
      {phase.kind === 'photo_slow' ? <Banner tone="warning" testId={T('photo-slow')}>{QUICK_MESSAGES.photoSlow}</Banner> : null}
      {phase.kind === 'lost' ? <Banner tone="warning" testId={T('lost')}>{QUICK_MESSAGES.lostResponse}</Banner> : null}
      {phase.kind === 'error' ? (
        <Banner
          tone="danger"
          testId={T('publish-error')}
          action={phase.showProduct ? <ButtonLink href={asRoute(`/lojista/produtos/${product.id}`)} variant="secondary" size="sm">Ver produto</ButtonLink> : <Button variant="secondary" size="sm" onClick={onPublish} data-testid={T('retry')}>Tentar de novo</Button>}
        >
          {phase.message}
        </Banner>
      ) : null}
      {publisher.offlineTap ? <p role="alert" className={cx('wb-text-body', q.rowErr)} data-testid={T('offline-tap')}><WarningCircle size={20} weight="fill" aria-hidden="true" /> {QUICK_MESSAGES.offlineTap}</p> : null}
      {saveNote ? <p role="alert" className={cx('wb-text-body', q.rowErr)} data-testid={T('save-note')}>{saveNote}</p> : null}

      <div className={q.footer}>
        <Button
          size="lg"
          className={cx(q.publishButton, !online && q.inert)}
          aria-disabled={!online || undefined}
          loading={busy && phase.kind !== 'waiting_upload'}
          loadingLabel="Publicando…"
          onClick={onPublish}
          data-testid={T('publish')}
        >
          {phase.kind === 'photo_slow' ? 'Publicar de novo' : 'Publicar'}
        </Button>
        <Button variant="text" aria-disabled={!online || undefined} loading={saving} loadingLabel="Guardando…" onClick={() => void onSaveDraft()} disabled={busy} data-testid={T('save-draft')}>
          Guardar rascunho
        </Button>
        <span className={ui.srOnly} role="status" aria-live="polite">{phase.kind === 'publishing' ? 'Publicando…' : ''}</span>
      </div>

      {sync.conflict ? (
        <Dialog
          title="Este rascunho foi alterado em outro aparelho"
          alert
          locked
          testId={T('conflict')}
          onClose={() => undefined}
          actions={
            <>
              <Button onClick={() => void sync.keepMine()} data-testid={T('conflict-mine')}>Manter a deste aparelho</Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const theirs = sync.adoptTheirs();
                  if (theirs) setValues((current) => ({ ...current, name: theirs.name, priceCents: theirs.priceCents, categoryId: theirs.categoryId || current.categoryId, description: theirs.description }));
                }}
                data-testid={T('conflict-theirs')}
              >
                Usar a do outro aparelho
              </Button>
            </>
          }
        >
          <p className="wb-text-body">Alterado às {formatClock(sync.conflict.theirs.updatedAt)}. Qual versão manter?</p>
          <p className="wb-text-body"><strong>Neste aparelho:</strong> {values.name.trim() || 'sem nome'} · {values.priceCents ? formatCents(values.priceCents) : 'sem preço'}</p>
          <p className="wb-text-body"><strong>No outro aparelho:</strong> {sync.conflict.theirs.name || 'sem nome'} · {sync.conflict.theirs.priceCents ? formatCents(sync.conflict.theirs.priceCents) : 'sem preço'}</p>
        </Dialog>
      ) : null}
    </div>
  );
}

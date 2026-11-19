'use client';

import { CaretLeft } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ActionMenu, Banner, Button, Dialog, QueryBoundary, RadioCards, SelectField, SkeletonRows, Switch, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type Product } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { apiRequest } from '@/lib/api/client';
import { isoToLocal, localToIso } from '@/lib/br/datetime';
import { DESCRIPTION_MAX, NAME_MAX, discountPercent, isModeratedOff } from '@/lib/catalog/helpers';
import { EMPTY_VALUES, parseStock, promoPreview, summaryText, validateProduct, type FieldKey, type FormErrors, type Intent, type ProductFormValues } from '@/lib/catalog/form';
import { fromServer, toRequest, variantsInline, type AttrDef, type GridRow } from '@/lib/catalog/variants';
import { formatCents } from '@/lib/format';
import { centsFromDigits, moneyField, parseCents } from '@/lib/money';
import { pickImage } from '@/lib/catalog/helpers';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import type { CategoryTree } from '@webag/shared';
import { CatalogGate } from './catalog-gate';
import { PhotoGallery, type Photo } from './photo-gallery';
import { VariantsEditor, type VariantsState } from './variants-editor';
import { ExchangeSection, ReceiveLines, SizeChartSection } from './product-extras';
import s from './catalog.module.css';

const T = (id: string) => ltid('produto', id);

export function ProductFormPage({ productId }: { productId?: string | undefined }) {
  return <CatalogGate>{(store) => (productId ? <EditProduct storeId={store.id} productId={productId} /> : <ProductEditor storeId={store.id} product={null} />)}</CatalogGate>;
}

function EditProduct({ storeId, productId }: { storeId: string; productId: string }) {
  // Chave própria e sem retenção: o formulário parte sempre do produto atual do servidor, não de um cache da lista.
  const query = useQuery({ queryKey: [...catalogKeys.product(storeId, productId), 'edit'], queryFn: () => catalogApi.get(storeId, productId), gcTime: 0, staleTime: 0 });
  return (
    <QueryBoundary query={query} skeleton={<SkeletonRows rows={6} height={56} label="Carregando o produto" />}>
      {(product) => <ProductEditor storeId={storeId} product={product} />}
    </QueryBoundary>
  );
}

function photosOf(product: Product | null): Photo[] {
  return (product?.images ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((image) => ({ key: image.id, assetId: image.id, previewUrl: pickImage(image.urls, 160) ?? '', status: 'ready' as const, progress: 100 }));
}

function valuesOf(product: Product | null): ProductFormValues {
  if (!product) return EMPTY_VALUES;
  const promo = product.promotion;
  const variable = product.variantAttributes.length > 0;
  return {
    name: product.name,
    description: product.description ?? '',
    categoryId: product.categoryId ?? '',
    sectionId: product.sectionId ?? '',
    priceCents: product.basePriceCents,
    promoOn: promo.priceCents !== null,
    promoPriceCents: promo.priceCents,
    promoStart: isoToLocal(promo.startsAt),
    promoEnd: isoToLocal(promo.endsAt),
    mode: variable ? 'variants' : 'simple',
    stockText: variable ? '' : String(product.variants[0]?.stock ?? ''),
    sizeChart: product.sizeChart ?? '',
    noVoluntaryExchange: product.noVoluntaryExchange,
  };
}

const draftKey = (storeId: string) => `webag:lojista:novo-produto:${storeId}`;

/** Rascunho local de produto novo: sobrevive a recarregar a página ou a sessão que expira no meio (onda-2 §0.2). Só texto. */
function readDraft(storeId: string): ProductFormValues | null {
  try {
    const raw = sessionStorage.getItem(draftKey(storeId));
    return raw ? ({ ...EMPTY_VALUES, ...(JSON.parse(raw) as Partial<ProductFormValues>) }) : null;
  } catch {
    return null;
  }
}

function focusFirstInvalid() {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

/** K2: criar e editar produto, com fotos, preço e promoção, estoque ou variações, e seção. */
function ProductEditor({ storeId, product }: { storeId: string; product: Product | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const online = useOnline();
  const initial = useMemo(() => valuesOf(product), [product]);
  const [values, setValues] = useState<ProductFormValues>(() => (product ? initial : (readDraft(storeId) ?? initial)));
  const [photos, setPhotos] = useState<Photo[]>(() => photosOf(product));
  const [variants, setVariants] = useState<VariantsState>(() => {
    const parsed = product ? fromServer(product.variantAttributes, product.variants) : { attrs: [] as AttrDef[], rows: [] as GridRow[] };
    return { attrs: parsed.attrs, rows: parsed.rows, excluded: [] };
  });
  const [variantsDirty, setVariantsDirty] = useState(false);
  const [view, setView] = useState<'form' | 'variants'>('form');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Intent | 'save' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const server = useRef<Product | null>(product);
  const idempotencyKey = useRef(`novo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const summaryRef = useRef<HTMLDivElement>(null);

  const categories = useQuery({ queryKey: ['lojista', 'categories'], queryFn: () => apiRequest<CategoryTree>('lojista', 'categories'), staleTime: 5 * 60_000 });
  const sections = useQuery({ queryKey: catalogKeys.sections(storeId), queryFn: () => catalogApi.sections(storeId) });

  const categoryOptions = useMemo(
    () =>
      (categories.data?.data ?? [])
        .filter((category) => category.active)
        .flatMap((category) => [{ id: category.id, name: category.name }, ...category.children.filter((child) => child.active).map((child) => ({ id: child.id, name: `${category.name} › ${child.name}` }))]),
    [categories.data],
  );

  const dirty = !saved && (JSON.stringify(values) !== JSON.stringify(initial) || photos.length !== (product?.images.length ?? 0) || variantsDirty);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (product || saved) return;
    try {
      sessionStorage.setItem(draftKey(storeId), JSON.stringify(values));
    } catch {
      /* armazenamento cheio ou bloqueado: o rascunho local é só conforto */
    }
  }, [values, product, saved, storeId]);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, ...(key === 'categoryId' ? { category: undefined } : key === 'priceCents' ? { price: undefined } : key === 'stockText' ? { stock: undefined } : { [key]: undefined }) }));
  };

  const readyPhotos = photos.filter((photo) => photo.status === 'ready');
  const status = server.current?.status ?? 'draft';
  const isDraft = status === 'draft';
  const moderated = product ? isModeratedOff(product.moderationStatus) : false;
  const rowsCount = variants.rows.length;
  const priceLabel = values.priceCents ? formatCents(values.priceCents) : null;
  const preview = values.promoOn ? promoPreview(values.priceCents, values.promoPriceCents, discountPercent) : null;

  /** Cria ou atualiza o produto e depois variações, fotos e publicação, na ordem. Cada passo guarda o resultado: repetir continua de onde parou. */
  async function persist(intent: Intent | 'save') {
    const base = {
      name: values.name.trim(),
      description: values.description.trim() === '' ? null : values.description.trim(),
      categoryId: values.categoryId === '' ? null : values.categoryId,
      sectionId: values.sectionId === '' ? null : values.sectionId,
      basePriceCents: values.priceCents && values.priceCents > 0 ? values.priceCents : null,
    };
    const exchange = { sizeChart: values.sizeChart.trim() === '' ? null : values.sizeChart.trim(), noVoluntaryExchange: values.noVoluntaryExchange };
    const promo = values.promoOn
      ? { promoPriceCents: values.promoPriceCents, promoStartsAt: localToIso(values.promoStart), promoEndsAt: localToIso(values.promoEnd) }
      : { promoPriceCents: null, promoStartsAt: null, promoEndsAt: null };

    if (!server.current) {
      server.current = await catalogApi.create(storeId, base, idempotencyKey.current);
      const exchangeSet = exchange.sizeChart !== null || exchange.noVoluntaryExchange;
      if (values.promoOn || exchangeSet) server.current = await catalogApi.update(storeId, server.current.id, { ...(values.promoOn ? promo : {}), ...(exchangeSet ? exchange : {}) });
    } else {
      server.current = await catalogApi.update(storeId, server.current.id, { ...base, ...promo, ...exchange });
    }
    const id = server.current.id;

    // Variações e estoque.
    const current = server.current;
    if (values.mode === 'variants') {
      if (variants.rows.length > 0 && (variantsDirty || current.variants.length === 0)) {
        server.current = await catalogApi.setVariants(storeId, id, toRequest(variants.attrs, variants.rows, parseCents));
        setVariantsDirty(false);
      }
    } else {
      const stock = parseStock(values.stockText);
      if (stock !== null) {
        const single = current.variants[0];
        if (current.variantAttributes.length > 0 || current.variants.length === 0) {
          server.current = await catalogApi.setVariants(storeId, id, { attributes: [], variants: [{ attributes: {}, stock, priceCents: null, sku: null }] });
        } else if (single && single.stock !== stock) {
          await catalogApi.adjustStock(storeId, id, single.id, { set: stock });
        }
      }
    }

    // Fotos: só manda se a lista (ordem inclusive) mudou.
    const ids = readyPhotos.map((photo) => photo.assetId as string);
    const serverIds = (server.current?.images ?? []).slice().sort((a, b) => a.position - b.position).map((image) => image.id);
    if (ids.length > 0 && JSON.stringify(ids) !== JSON.stringify(serverIds)) server.current = await catalogApi.setImages(storeId, id, ids);

    if (intent === 'publish' && server.current?.status !== 'active') server.current = await catalogApi.publish(storeId, id);
  }

  async function submit(intent: Intent | 'save') {
    setFormError(null);
    if (photos.some((photo) => photo.status === 'uploading')) return setFormError('Aguarde o envio das fotos terminar.');
    const checkIntent: Intent = intent === 'draft' ? 'draft' : 'publish';
    const found = validateProduct(values, { readyPhotos: readyPhotos.length, variantRows: rowsCount }, checkIntent);
    if (checkIntent === 'publish' && photos.some((photo) => photo.status === 'error')) found.photos = 'Envie de novo ou remova as fotos com erro.';
    setErrors(found);
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => {
        summaryRef.current?.focus();
      });
      return;
    }
    if (!online) return setFormError(intent === 'draft' ? 'Conecte-se para salvar. Seu rascunho está salvo neste aparelho.' : 'Conecte-se para publicar. Seu rascunho está salvo neste aparelho.');
    setBusy(intent);
    try {
      await persist(intent);
      setSaved(true);
      try {
        sessionStorage.removeItem(draftKey(storeId));
      } catch {
        /* sem armazenamento */
      }
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show(intent === 'draft' ? 'Rascunho salvo.' : intent === 'publish' ? 'Produto publicado. Já aparece na sua loja.' : 'Alterações salvas.');
      router.push(asRoute('/lojista/produtos'));
    } catch (caught) {
      if (caught instanceof ApiError) {
        const mapped: FormErrors = {};
        for (const field of caught.fields) {
          if (field.field === 'name') mapped.name = field.message;
          else if (field.field === 'categoryId') mapped.category = field.message;
          else if (field.field.startsWith('basePriceCents')) mapped.price = field.message;
          else if (field.field.startsWith('promo')) mapped.promoPrice = field.message;
          else if (field.field === 'imageIds') mapped.photos = field.message;
          else if (field.field.startsWith('variants')) mapped.variants = field.message;
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          focusFirstInvalid();
        }
        if (caught.code === 'CATEGORY_FORBIDDEN') setErrors((current) => ({ ...current, category: catalogErrorMessage(caught) }));
      }
      setFormError(catalogErrorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveVariants(next: VariantsState): Promise<string | null> {
    setVariants(next);
    const existing = server.current;
    if (!existing) {
      // Produto novo: as opções ficam no formulário e vão junto quando ele for salvo (a API precisa do produto criado).
      setVariantsDirty(true);
      set('mode', 'variants');
      setView('form');
      toast.show('Variações definidas. Elas são salvas junto com o produto.');
      return null;
    }
    try {
      server.current = await catalogApi.setVariants(storeId, existing.id, toRequest(next.attrs, next.rows, parseCents));
      const reloaded = fromServer(server.current.variantAttributes, server.current.variants);
      setVariants({ attrs: reloaded.attrs, rows: reloaded.rows, excluded: [] });
      setVariantsDirty(false);
      set('mode', server.current.variantAttributes.length > 0 ? 'variants' : 'simple');
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      setView('form');
      toast.show('Variações salvas.');
      return null;
    } catch (caught) {
      return catalogErrorMessage(caught, 'Não foi possível salvar. As opções continuam aqui.');
    }
  }

  async function archive() {
    if (!server.current) return;
    setArchiveError(null);
    try {
      await catalogApi.archive(storeId, server.current.id);
      setSaved(true);
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show('Produto arquivado.');
      router.push(asRoute('/lojista/produtos'));
    } catch (caught) {
      setArchiveError(catalogErrorMessage(caught, 'Não foi possível arquivar. Tente de novo.'));
    }
  }

  async function togglePause() {
    if (!server.current) return;
    try {
      server.current = await (server.current.status === 'paused' ? catalogApi.resume(storeId, server.current.id) : catalogApi.pause(storeId, server.current.id));
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      toast.show(server.current.status === 'paused' ? 'Produto pausado.' : 'Produto voltou a ser vendido.');
      setSaved(true);
      router.push(asRoute('/lojista/produtos'));
    } catch (caught) {
      setFormError(catalogErrorMessage(caught));
    }
  }

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(isDraft ? 'publish' : 'save');
  }

  if (view === 'variants') {
    return (
      <VariantsEditor
        initial={variants}
        productPriceLabel={priceLabel}
        saving={false}
        onBack={() => setView('form')}
        onSave={saveVariants}
      />
    );
  }

  const errorList = (Object.entries(errors) as [FieldKey, string | undefined][]).filter((entry): entry is [FieldKey, string] => Boolean(entry[1]));
  const title = product ? 'Editar produto' : 'Novo produto';
  return (
    <form onSubmit={onFormSubmit} noValidate className={ui.stack} data-testid={T('form')}>
      <div>
        <Button variant="text" size="sm" icon={<CaretLeft size={20} aria-hidden="true" />} onClick={() => (dirty ? setLeaving(true) : router.push(asRoute('/lojista/produtos')))} data-testid={T('back')}>
          Produtos
        </Button>
      </div>
      <Heading title={title} menu={product ? (
        <ActionMenu
          label="Mais opções do produto"
          testId={T('more-menu')}
          actions={[
            ...(!isDraft && !moderated ? [{ label: status === 'paused' ? 'Reativar produto' : 'Pausar produto', onSelect: () => void togglePause(), testId: T('pause') }] : []),
            { label: 'Arquivar produto', onSelect: () => setArchiving(true), danger: true, testId: T('archive') },
          ]}
        />
      ) : null} />
      {!online ? <Banner tone="warning" offline>Sem conexão. O que você digitou continua nesta tela e neste aparelho.</Banner> : null}
      {product && moderated ? <Banner tone="danger" testId={T('moderation')}>{product.moderationReason ?? 'O Webag pausou este produto.'} Só o Webag pode reativar. Você pode contestar pelo suporte.</Banner> : null}
      {errorList.length > 0 ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className={s.errorSummary} data-testid={T('error-summary')}>
          <Banner tone="danger">
            <strong>{summaryText(errorList.length)}</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {errorList.map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          </Banner>
        </div>
      ) : null}

      <div className={s.formGrid}>
        <div className={s.col}>
          <PhotoGallery storeId={storeId} photos={photos} onChange={(update) => { setPhotos(update); setErrors((current) => ({ ...current, photos: undefined })); }} error={errors.photos} />
          <TextField label="Nome" maxLength={NAME_MAX} value={values.name} onChange={(event) => set('name', event.target.value)} counter={{ value: values.name.length, max: NAME_MAX }} error={errors.name} autoComplete="off" data-testid={T('name-input')} />
          <TextArea label="Descrição (opcional)" rows={5} maxLength={DESCRIPTION_MAX} value={values.description} onChange={(event) => set('description', event.target.value)} counter={{ value: values.description.length, max: DESCRIPTION_MAX }} error={errors.description} data-testid={T('description-input')} />
        </div>
        <div className={s.col}>
          <SelectField
            label="Categoria"
            value={values.categoryId}
            onChange={(event) => set('categoryId', event.target.value)}
            error={errors.category}
            hint={categories.isError ? 'Não conseguimos carregar as categorias. Recarregue a página.' : errors.category?.includes('não é permitido') ? <Link href={asRoute('/lojista/loja')}>Ver regras</Link> : undefined}
            data-testid={T('category-select')}
          >
            <option value="">{categories.isPending ? 'Carregando…' : 'Escolha a categoria'}</option>
            {categoryOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.name}</option>
            ))}
          </SelectField>

          <TextField
            label="Preço (R$)"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0,00"
            value={moneyField(values.priceCents)}
            onChange={(event) => {
              const cents = centsFromDigits(event.target.value);
              set('priceCents', cents === 0 ? null : cents);
            }}
            error={errors.price}
            hint={product && !isDraft ? 'Clientes com esse produto na sacola veem o novo preço antes de pagar.' : undefined}
            data-testid={T('price-input')}
          />
          <ReceiveLines priceCents={values.priceCents} promoCents={values.promoOn ? values.promoPriceCents : null} onUsePrice={(cents) => set('priceCents', cents)} />
          <div className={ui.stack}>
            <Switch checked={values.promoOn} onChange={(next) => set('promoOn', next)} label="Colocar em promoção" onText="Em promoção" offText="Sem promoção" testId={T('promo-switch')} />
            {values.promoOn ? (
              <div className={ui.stack}>
                <TextField
                  label="Preço promocional (R$)"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0,00"
                  value={moneyField(values.promoPriceCents)}
                  onChange={(event) => {
                    const cents = centsFromDigits(event.target.value);
                    set('promoPriceCents', cents === 0 ? null : cents);
                  }}
                  error={errors.promoPrice}
                  data-testid={T('promo-price-input')}
                />
                <div className={s.twoCols}>
                  <TextField label="Início" type="datetime-local" value={values.promoStart} onChange={(event) => set('promoStart', event.target.value)} error={errors.promoStart} data-testid={T('promo-start')} />
                  <TextField label="Fim" type="datetime-local" value={values.promoEnd} onChange={(event) => set('promoEnd', event.target.value)} error={errors.promoEnd} data-testid={T('promo-end')} />
                </div>
                {preview ? <p className={cx('wb-text-body-strong', s.promoPreview)} data-testid={T('promo-preview')}>{preview}</p> : null}
                <span className={cx('wb-text-caption', ui.muted)}>Quando a promoção acaba, o preço volta ao normal sozinho. Horário de Brasília.</span>
              </div>
            ) : null}
          </div>

          <div className={ui.stack}>
            <RadioCards
              legend="Estoque e variações"
              name="variation-mode"
              value={values.mode}
              onChange={(mode) => {
                if (mode === 'variants') {
                  set('mode', mode);
                  setView('variants');
                } else set('mode', mode);
              }}
              options={[
                { value: 'simple', label: 'Produto sem variação', testId: T('simple-radio') },
                { value: 'variants', label: 'Tem tamanhos, cores ou outras opções', testId: T('variations-radio') },
              ]}
            />
            {values.mode === 'simple' ? (
              <TextField label="Estoque" inputMode="numeric" value={values.stockText} onChange={(event) => set('stockText', event.target.value.replace(/\D/g, '').slice(0, 5))} error={errors.stock} hint="Você ajusta depois na lista." data-testid={T('stock-input')} />
            ) : (
              <div className={ui.stack}>
                {rowsCount > 0 ? <p className="wb-text-body-strong" style={{ margin: 0 }} data-testid={T('variations-summary')}>{variantsInline(variants.rows)}</p> : <p className={cx('wb-text-body', ui.muted)} style={{ margin: 0 }}>Nenhuma opção definida ainda.</p>}
                {errors.variants ? <span className={cx('wb-text-caption', ui.danger)} role="alert">{errors.variants}</span> : null}
                <div>
                  <Button variant="secondary" onClick={() => setView('variants')} data-testid={T('variations-edit')}>Editar variações</Button>
                </div>
              </div>
            )}
          </div>

          <SelectField label="Seção da vitrine (opcional)" value={values.sectionId} onChange={(event) => set('sectionId', event.target.value)} hint="Sem seção, o produto fica em Outros." data-testid={T('section-select')}>
            <option value="">Outros</option>
            {(sections.data?.data ?? []).map((section) => (
              <option key={section.id} value={section.id}>{section.name}</option>
            ))}
          </SelectField>

          <ExchangeSection values={values} set={set} />
          <SizeChartSection values={values} set={set} hasSize={variants.attrs.some((attr) => /tamanho/i.test(attr.name))} />
        </div>
      </div>

      <div className={s.footer}>
        {formError ? <Banner tone="danger" testId={T('error')}>{formError}</Banner> : null}
        <div className={s.footerActions}>
          <Button type="submit" size="lg" loading={busy === 'publish' || busy === 'save'} loadingLabel="Salvando…" disabled={busy !== null} data-testid={T('submit')}>
            {isDraft ? 'Publicar produto' : 'Salvar alterações'}
          </Button>
          {isDraft ? (
            <Button variant="text" onClick={() => void submit('draft')} loading={busy === 'draft'} loadingLabel="Salvando…" disabled={busy !== null} data-testid={T('save-draft')}>
              Salvar rascunho
            </Button>
          ) : null}
        </div>
      </div>

      {leaving ? (
        <Dialog
          title="Sair sem salvar?"
          onClose={() => setLeaving(false)}
          testId={T('leave-dialog')}
          actions={
            <>
              <Button onClick={() => setLeaving(false)}>Continuar editando</Button>
              <Button variant="text" onClick={() => { setSaved(true); router.push(asRoute('/lojista/produtos')); }} data-testid={T('leave-confirm')}>Sair sem salvar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Você tem alterações que não foram salvas.</p>
        </Dialog>
      ) : null}
      {archiving ? (
        <Dialog
          title={`Arquivar ${product?.name ?? 'o produto'}?`}
          onClose={() => setArchiving(false)}
          testId={T('archive-dialog')}
          actions={
            <>
              <Button variant="destructive" onClick={() => void archive()} data-testid={T('archive-confirm')}>Arquivar produto</Button>
              <Button variant="text" onClick={() => setArchiving(false)}>Cancelar</Button>
            </>
          }
        >
          <p className="wb-text-body" style={{ margin: 0 }}>Ela sai da vitrine. O histórico de pedidos continua.</p>
          {archiveError ? <Banner tone="danger" testId={T('archive-error')}>{archiveError}</Banner> : null}
        </Dialog>
      ) : null}
    </form>
  );
}

function Heading({ title, menu }: { title: string; menu: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return (
    <div className={ui.pageHeader}>
      <h1 ref={ref} className="wb-text-title1" tabIndex={-1} style={{ margin: 0, outline: 'none' }}>{title}</h1>
      {menu}
    </div>
  );
}

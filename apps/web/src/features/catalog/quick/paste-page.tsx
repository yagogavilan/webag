'use client';

import { Camera, CheckCircle, ClipboardText, WarningCircle } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banner, Button, ButtonLink, CheckboxField, SafeImage, TextArea, TextField, cx, ui, useToast } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { readPasteCopy, removePasteCopy, writePasteCopy } from '@/lib/catalog/local-copy';
import {
  PASTE_MAX_LINES,
  STATUS_LABEL,
  draftSlots,
  groupText,
  hasMultiplePrices,
  liveGroups,
  mergeGroup,
  readList,
  rowChecks,
  rowMessages,
  rowStatus,
  splitRow,
  summarize,
  toBatchRequest,
  type CheckKey,
  type ParsedList,
  type ReviewRow,
} from '@/lib/catalog/paste-review';
import { missingText, newIntentKey } from '@/lib/catalog/quick';
import { validateStoreImage } from '@/lib/image/prepare';
import { uploadStoreImage, type UploadedImage } from '@/lib/image/upload';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { CatalogGate } from '../catalog-gate';
import { useMerchant } from '../../lojista/store-context';
import { prepareProductPhoto } from './quick-photos';
import q from './quick.module.css';

const T = (id: string) => ltid('colar', id);

export interface PasteDeps {
  prepare: (file: Blob) => Promise<{ blob: Blob }>;
  upload: (storeId: string, blob: Blob, onProgress: (percent: number) => void) => Promise<UploadedImage>;
}
const defaultDeps: PasteDeps = { prepare: prepareProductPhoto, upload: (storeId, blob, onProgress) => uploadStoreImage(storeId, 'product_image', blob, 'foto.jpg', { onProgress }) };

const MESSAGES = {
  empty: 'Cole a lista primeiro. Cada linha precisa de nome e preço, ex.: Bermuda jeans 79,90.',
  none: 'Não encontramos produtos neste texto. Cada linha precisa de nome e preço, ex.: Bermuda jeans 79,90.',
  offlineCreate: 'Sem internet. Conecte para criar os rascunhos.',
  kept: 'Seu texto continua aqui. Volte quando tiver internet.',
  createFailed: 'Não conseguimos criar os rascunhos agora. Sua lista está guardada. Tente de novo.',
  noneReady: 'Nenhum produto pronto. Tire as fotos primeiro.',
  limit: 'Limite de 100 rascunhos. Publique ou apague algum.',
} as const;

/** `/lojista/produtos/adicionar-varios`: colar texto, revisar linha a linha e tirar as fotos (WB-376; spec `v1-1-importar-colar.md`). */
export function PastePage({ deps = defaultDeps }: { deps?: PasteDeps }) {
  return <CatalogGate>{(store) => <PasteFlow storeId={store.id} deps={deps} />}</CatalogGate>;
}

type Step = 'paste' | 'review' | 'photos';

interface Created {
  productId: string;
  clientRef: string;
  name: string;
  missing: string[];
  preview: string | null;
  progress: number | null;
  error: string | null;
  published: boolean;
}

export function PasteFlow({ storeId, deps }: { storeId: string; deps: PasteDeps }) {
  const online = useOnline();
  const { user } = useMerchant();
  const client = useQueryClient();
  const [step, setStep] = useState<Step>('paste');
  const [text, setText] = useState(() => readPasteCopy(user.id, storeId) ?? '');
  const [restored, setRestored] = useState(text !== '');
  const [footwear, setFootwear] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overBy, setOverBy] = useState<{ total: number; list: ParsedList } | null>(null);
  const [list, setList] = useState<ParsedList | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [space, setSpace] = useState<{ slots: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Created[]>([]);
  const [rejected, setRejected] = useState<{ clientRef: string; message: string }[]>([]);
  const intent = useRef<{ key: string; print: string } | null>(null);

  // O texto colado fica só neste aparelho por 24 h (RN-Q2): sobrevive à recarga e à queda de sinal, e some ao criar os rascunhos.
  useEffect(() => {
    const id = setTimeout(() => writePasteCopy(user.id, storeId, text), 400);
    return () => clearTimeout(id);
  }, [text, user.id, storeId]);

  const lineCount = useMemo(() => text.split(/\r\n|[\n\r\u2028\u2029\u0085]/).filter((line) => line.trim() !== '').length, [text]);

  function read(useFirst?: boolean) {
    setError(null);
    setOverBy(null);
    if (text.trim() === '') return setError(MESSAGES.empty);
    const parsed = readList(text, { footwearCategory: footwear });
    if (parsed.rows.length === 0) return setError(MESSAGES.none);
    if (parsed.overLimit && !useFirst) return setOverBy({ total: parsed.totalLines, list: parsed });
    setList(parsed);
    setRows(parsed.rows);
    setDismissed(new Set());
    setSpace(null);
    setNote(null);
    setStep('review');
  }

  const summary = summarize(rows);
  const groups = list ? liveGroups(rows, list.groups, dismissed) : [];
  const edit = (id: string, change: Partial<ReviewRow>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  const confirmCheck = (id: string, key: CheckKey) => setRows((current) => current.map((row) => (row.id === id ? { ...row, checked: [...row.checked, key] } : row)));

  async function create(first?: number) {
    if (!online) return setNote(MESSAGES.offlineCreate);
    setNote(null);
    setCreating(true);
    const send = first ? rows.slice(0, first) : rows;
    try {
      const start = await client.fetchQuery({ queryKey: catalogKeys.quickStart(storeId), queryFn: () => catalogApi.quickStart(storeId), staleTime: 0 });
      const { slots, fits } = draftSlots(start.draftCount, start.draftLimit, send.length);
      if (!fits) return setSpace({ slots });
      setSpace(null);
      const body = toBatchRequest(send);
      const print = JSON.stringify(body.items);
      intent.current = intent.current && intent.current.print === print ? intent.current : { key: newIntentKey('colar'), print };
      const result = await catalogApi.createDraftsBatch(storeId, body, intent.current.key);
      const byRef = new Map(send.map((row) => [row.id, row]));
      setCreated(result.created.map((item) => ({ productId: item.productId, clientRef: item.clientRef, name: byRef.get(item.clientRef)?.name ?? '', missing: item.missing, preview: null, progress: null, error: null, published: false })));
      setRejected(result.rejected.map((item) => ({ clientRef: item.clientRef, message: item.message })));
      removePasteCopy(user.id, storeId);
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      setStep('photos');
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'DRAFT_LIMIT_REACHED') {
        const slots = Number(caught.problem['slotsAvailable']);
        setSpace({ slots: Number.isFinite(slots) ? slots : 0 });
      } else if (caught instanceof ApiError && caught.isNetwork) setNote(MESSAGES.offlineCreate);
      else setNote(caught instanceof ApiError && caught.status < 500 ? catalogErrorMessage(caught, MESSAGES.createFailed) : MESSAGES.createFailed);
    } finally {
      setCreating(false);
    }
  }

  if (step === 'photos') return <PhotoStep storeId={storeId} deps={deps} items={created} setItems={setCreated} rejected={rejected} />;

  const steps = (
    <ol className={q.steps} aria-label="Etapas">
      {(['Colar', 'Revisar', 'Fotos'] as const).map((label, index) => (
        <li key={label} className={cx('wb-text-caption', (index === 0 && step === 'paste') || (index === 1 && step === 'review') ? q.stepOn : undefined)} aria-current={(index === 0 && step === 'paste') || (index === 1 && step === 'review') ? 'step' : undefined}>
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );

  if (step === 'paste') {
    return (
      <div className={q.page} data-testid={T('paste')}>
        <h2 className="wb-text-title1" style={{ margin: 0 }}>Adicionar vários produtos</h2>
        {steps}
        <TextArea
          className={q.pasteArea}
          label="Cole sua lista, uma linha por produto"
          rows={8}
          value={text}
          placeholder="Bermuda jeans M 79,90 4 un"
          hint={`${lineCount} ${lineCount === 1 ? 'linha' : 'linhas'} · até ${PASTE_MAX_LINES} por vez. Pode colar direto do WhatsApp.`}
          error={error ?? undefined}
          onChange={(event) => {
            setRestored(false);
            setText(event.target.value);
            setError(null);
            setOverBy(null);
          }}
          data-testid={T('text')}
        />
        {restored ? <Banner tone="info" testId={T('restored')}>{MESSAGES.kept.replace(' Volte quando tiver internet.', '')}</Banner> : null}
        <ClipboardButton onText={(value) => setText(value)} />
        <CheckboxField label="É uma lista de calçados (lemos 38, 40, 42 como tamanho)" checked={footwear} onChange={(event) => setFootwear(event.target.checked)} data-testid={T('footwear')} />
        {overBy ? (
          <Banner tone="warning" testId={T('over')} action={<Button variant="secondary" size="sm" onClick={() => read(true)} data-testid={T('use-first')}>Usar as {PASTE_MAX_LINES} primeiras</Button>}>
            Cole até {PASTE_MAX_LINES} linhas por vez. Você colou {overBy.total}.
          </Banner>
        ) : null}
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>O texto fica só no Webag. Nada vai para serviços de fora.</p>
        <Button size="lg" onClick={() => read()} data-testid={T('read')}>Ler a lista</Button>
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>
          Tem planilha? <ButtonLink href={asRoute('/lojista/produtos/importar')} variant="text" size="sm">Importar planilha</ButtonLink>
        </p>
      </div>
    );
  }

  const slotsLeft = space?.slots ?? null;
  const canCreate = online && !creating;
  return (
    <div className={q.page} data-testid={T('review')}>
      <h2 className="wb-text-title1" style={{ margin: 0 }}>Revisar a lista</h2>
      {steps}
      <p className="wb-text-body-strong" role="status" aria-live="polite" data-testid={T('summary')}>{summary.text}</p>
      {!online ? <Banner tone="warning" offline testId={T('offline')}>{MESSAGES.offlineCreate} {MESSAGES.kept}</Banner> : null}
      {groups.map((group) => (
        <Banner
          key={group.lines.join(',')}
          tone="info"
          testId={T(`group-${group.lines.join('-')}`)}
          action={
            <span className={ui.row}>
              <Button size="sm" onClick={() => setRows((current) => mergeGroup(current, group))} data-testid={T(`merge-${group.lines.join('-')}`)}>Juntar</Button>
              <Button size="sm" variant="text" onClick={() => setDismissed((current) => new Set([...current, group.lines.join(',')]))}>Manter separados</Button>
            </span>
          }
        >
          {groupText(group)} <span className={ui.muted}>Só juntamos linhas da mesma cor.</span>
        </Banner>
      ))}
      <ul className={q.cards}>
        {rows.map((row) => (
          <ReviewCard key={row.id} row={row} onEdit={(change) => edit(row.id, change)} onCheck={(key) => confirmCheck(row.id, key)} onSplit={() => setRows((current) => splitRow(current, row.id))} />
        ))}
      </ul>
      {space ? (
        <Banner
          tone="warning"
          testId={T('space')}
          action={
            slotsLeft && slotsLeft > 0 ? (
              <span className={ui.row}>
                <Button size="sm" onClick={() => void create(slotsLeft)} data-testid={T('create-first')}>Criar só os {slotsLeft} primeiros</Button>
                <Button size="sm" variant="text" onClick={() => { setSpace(null); setStep('paste'); }}>Voltar e editar o texto</Button>
              </span>
            ) : undefined
          }
        >
          {slotsLeft && slotsLeft > 0 ? `Você tem espaço para ${slotsLeft} ${slotsLeft === 1 ? 'rascunho' : 'rascunhos'}.` : MESSAGES.limit}
        </Banner>
      ) : null}
      {note ? <p role="alert" className={cx('wb-text-body', ui.danger)} data-testid={T('note')}><WarningCircle size={20} weight="fill" aria-hidden="true" /> {note}</p> : null}
      <div className={q.sticky}>
        <Button size="lg" aria-disabled={!online || undefined} loading={creating} loadingLabel="Criando…" onClick={() => (canCreate ? void create() : creating ? undefined : setNote(MESSAGES.offlineCreate))} data-testid={T('create')}>
          Criar {rows.length} {rows.length === 1 ? 'rascunho' : 'rascunhos'}
          {summary.problem > 0 ? ` (${summary.problem} com problema)` : ''}
        </Button>
        <Button variant="text" onClick={() => setStep('paste')} data-testid={T('back')}>Voltar e editar o texto</Button>
      </div>
    </div>
  );
}

function ClipboardButton({ onText }: { onText: (text: string) => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div>
      <Button
        variant="secondary"
        icon={<ClipboardText size={20} aria-hidden="true" />}
        onClick={async () => {
          setProblem(null);
          try {
            const value = await navigator.clipboard.readText();
            if (value.trim() === '') return setProblem('A área de transferência está vazia. Copie a lista e toque de novo.');
            onText(value);
          } catch {
            setProblem('Toque no campo e cole pelo menu do teclado.');
          }
        }}
        data-testid={T('clipboard')}
      >
        Colar do WhatsApp
      </Button>
      {problem ? <p role="status" className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }} data-testid={T('clipboard-problem')}>{problem}</p> : null}
    </div>
  );
}

function ReviewCard({ row, onEdit, onCheck, onSplit }: { row: ReviewRow; onEdit: (change: Partial<ReviewRow>) => void; onCheck: (key: CheckKey) => void; onSplit: () => void }) {
  const status = rowStatus(row);
  const messages = rowMessages(row);
  const checks = rowChecks(row);
  const grouped = row.variants !== null;
  const implicitColor = !grouped && row.draft.colors.value.length > 0 && row.draft.colors.confidence !== 'high' ? row.draft.colors.value.join(', ') : null;
  const explicitColor = !grouped && row.colors.length > 0 ? row.colors.join(', ') : null;
  const prices = row.draft.issues.find((i) => i.code === 'multiple_prices');
  const label = row.lines.length > 1 ? `Linhas ${row.lines.join(', ')}` : `Linha ${row.lines[0]}`;
  const tone = status === 'ready' ? 'var(--wb-color-text-success)' : status === 'confirm' ? 'var(--wb-color-text-warning)' : 'var(--wb-color-text-danger)';
  return (
    <li className={q.card} data-testid={T(`card-${row.id}`)}>
      <div className={q.cardHead}>
        <span className="wb-text-body-strong">{label}</span>
        <span className="wb-text-caption-strong" style={{ color: tone, display: 'inline-flex', alignItems: 'center', gap: 4 }} data-testid={T(`status-${row.id}`)}>
          {status === 'ready' ? <CheckCircle size={16} weight="fill" aria-hidden="true" /> : <WarningCircle size={16} weight="fill" aria-hidden="true" />}
          {STATUS_LABEL[status]}
        </span>
      </div>
      <div className={q.cardGrid}>
        <TextField className={q.cardWide} label="Nome" value={row.name} error={messages.name} onChange={(event) => onEdit({ name: event.target.value })} data-testid={T(`name-${row.id}`)} />
        <TextField label="Tamanho" value={row.sizes.join(', ')} disabled={grouped} onChange={(event) => onEdit({ sizes: event.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} data-testid={T(`size-${row.id}`)} />
        {grouped ? (
          <TextField label="Quantidade" value={`${row.variants?.reduce((sum, v) => sum + (Number(v.stockText) || 0), 0)} no total`} disabled readOnly />
        ) : (
          <TextField label="Quantidade" inputMode="numeric" value={row.quantityText} error={messages.quantity} onChange={(event) => onEdit({ quantityText: event.target.value.replace(/\D/g, '').slice(0, 5) })} data-testid={T(`qty-${row.id}`)} />
        )}
        <TextField
          label="Preço (R$)"
          inputMode="decimal"
          value={grouped && row.priceText === '' ? 'por variação' : row.priceText}
          disabled={grouped && row.priceText === ''}
          error={messages.price}
          onChange={(event) => onEdit({ priceText: event.target.value.replace(/[^\d.,R$\s]/g, '') })}
          data-testid={T(`price-${row.id}`)}
        />
      </div>
      {grouped ? <p className={cx('wb-text-caption', q.help)}>{row.variants?.length} variações{row.priceText === '' ? ', cada uma com o seu preço' : ''}. Ajuste a grade depois, ao abrir o produto.</p> : null}
      {implicitColor ? <p className={cx('wb-text-caption', q.help)}>Cor sugerida: {implicitColor}. Dá para ajustar na grade depois.</p> : null}
      {explicitColor ? <p className={cx('wb-text-caption', q.help)}>Cor: {explicitColor}</p> : null}
      {row.draft.issues.some((i) => i.code === 'name_truncated') ? <p className={cx('wb-text-caption', q.help)}>Nome cortado em 80 caracteres.</p> : null}
      {hasMultiplePrices(row) && prices && prices.code === 'multiple_prices' ? (
        <Button variant="secondary" size="sm" onClick={onSplit} data-testid={T(`split-${row.id}`)}>Separar em {prices.splitLines.length} linhas</Button>
      ) : null}
      {checks.map((check) => (
        <div key={check.key} role="status" className={q.statusBox} data-testid={T(`check-${row.id}-${check.key}`)}>
          <span className="wb-text-body">{check.text}</span>
          <span className={ui.row}>
            <Button size="sm" onClick={() => onCheck(check.key)} data-testid={T(`ok-${row.id}-${check.key}`)}>{check.key === 'size' || check.key === 'sizes' || check.key === 'quantity' ? 'Está certo' : 'Conferi'}</Button>
            {check.canReject ? (
              <Button size="sm" variant="secondary" onClick={() => onEdit({ name: `${row.name} ${row.sizes[0] ?? ''}`.trim(), sizes: [] })} data-testid={T(`reject-${row.id}-${check.key}`)}>Não é tamanho</Button>
            ) : null}
          </span>
        </div>
      ))}
    </li>
  );
}

function PhotoStep({ storeId, deps, items, setItems, rejected }: { storeId: string; deps: PasteDeps; items: Created[]; setItems: (update: (current: Created[]) => Created[]) => void; rejected: { clientRef: string; message: string }[] }) {
  const online = useOnline();
  const client = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const withPhoto = items.filter((item) => !item.missing.includes('photo')).length;
  const ready = items.filter((item) => item.missing.length === 0 && !item.published);
  const patch = (productId: string, change: Partial<Created>) => setItems((current) => current.map((item) => (item.productId === productId ? { ...item, ...change } : item)));

  async function onFile(file: File | undefined) {
    const id = target.current;
    if (!file || !id) return;
    const invalid = validateStoreImage(file);
    setProblem(invalid);
    if (invalid) return;
    if (!online) return patch(id, { error: 'Sem internet. Conecte para enviar a foto.' });
    patch(id, { progress: 0, error: null });
    try {
      const { blob } = await deps.prepare(file);
      const uploaded = await deps.upload(storeId, blob, (percent) => patch(id, { progress: percent }));
      await catalogApi.setImages(storeId, id, [uploaded.assetId]);
      setItems((current) => current.map((item) => (item.productId === id ? { ...item, progress: null, error: null, preview: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null, missing: item.missing.filter((m) => m !== 'photo') } : item)));
    } catch (caught) {
      patch(id, { progress: null, error: caught instanceof ApiError && caught.isNetwork ? 'Sem internet. Conecte para enviar a foto.' : 'Não foi possível enviar a foto. Tente de novo.' });
    }
  }

  async function publishAll() {
    if (!online) return setNote('Sem internet. Conecte para publicar.');
    if (ready.length === 0) return setNote(MESSAGES.noneReady);
    setNote(null);
    setPublishing(true);
    let ok = 0;
    for (const item of ready) {
      try {
        await catalogApi.publish(storeId, item.productId);
        patch(item.productId, { published: true, error: null });
        ok += 1;
      } catch (caught) {
        patch(item.productId, { error: catalogErrorMessage(caught, 'Não conseguimos publicar este agora.') });
      }
    }
    await client.invalidateQueries({ queryKey: catalogKeys.all });
    setPublishing(false);
    const rest = items.length - ok - items.filter((i) => i.published).length;
    toast.show(`${ok} ${ok === 1 ? 'produto publicado' : 'produtos publicados'}.${rest > 0 ? ` ${rest} ${rest === 1 ? 'fica' : 'ficam'} como rascunho: faltam foto ou preço.` : ''}`);
  }

  return (
    <div className={q.page} data-testid={T('photos')}>
      <h2 className="wb-text-title1" style={{ margin: 0 }}>Tirar as fotos</h2>
      <p className="wb-text-body-strong" role="status" aria-live="polite" data-testid={T('photos-count')}>{withPhoto} de {items.length} com foto</p>
      {rejected.length > 0 ? (
        <Banner tone="warning" testId={T('rejected')}>
          {rejected.length} {rejected.length === 1 ? 'linha não foi criada' : 'linhas não foram criadas'}: {rejected.map((r) => `${r.clientRef.replace(/^[LG]/, 'linha ')} (${r.message})`).join('; ')}
        </Banner>
      ) : null}
      {problem ? <Banner tone="danger">{problem}</Banner> : null}
      <ul className={q.cards}>
        {items.map((item) => (
          <li key={item.productId} className={q.card} data-testid={T(`item-${item.productId}`)}>
            <div className={q.cardHead}>
              <span className="wb-text-body-strong" style={{ overflowWrap: 'anywhere' }}>{item.name || 'Sem nome'}</span>
              <span className="wb-text-caption-strong" data-testid={T(`item-status-${item.productId}`)}>{item.published ? 'Publicado' : missingText(item.missing).replace('Pronto para publicar', 'Pronta')}</span>
            </div>
            {item.preview ? <SafeImage src={item.preview} alt="" width={64} height={72} className={q.thumbImg} /> : null}
            {item.progress !== null ? <p role="status" className="wb-text-caption" style={{ margin: 0 }}>Enviando a foto… {item.progress}%</p> : null}
            {item.error ? <p role="alert" className={cx('wb-text-caption', q.rowErr)}>{item.error}</p> : null}
            {!item.published ? (
              <Button
                size="sm"
                variant={item.missing.includes('photo') ? 'primary' : 'secondary'}
                icon={<Camera size={16} aria-hidden="true" />}
                aria-label={`Tirar foto de ${item.name}`}
                onClick={() => {
                  target.current = item.productId;
                  input.current?.click();
                }}
                data-testid={T(`photo-${item.productId}`)}
              >
                {item.missing.includes('photo') ? 'Foto' : 'Trocar foto'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <input ref={input} type="file" accept="image/*" capture="environment" className={q.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void onFile(file); }} data-testid={T('file')} />
      {note ? <p role="alert" className={cx('wb-text-body', ui.danger)} data-testid={T('photos-note')}>{note}</p> : null}
      <div className={q.sticky}>
        <Button size="lg" aria-disabled={!online || ready.length === 0 || undefined} loading={publishing} loadingLabel="Publicando…" onClick={() => void publishAll()} data-testid={T('publish-valid')}>
          Publicar os válidos ({ready.length})
        </Button>
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Os que faltam foto ou preço ficam como rascunho.</p>
        <ButtonLink href={asRoute('/lojista/produtos')} variant="text" data-testid={T('see-products')}>Ver meus produtos</ButtonLink>
      </div>
    </div>
  );
}

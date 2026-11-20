'use client';

import { CaretLeft, CheckCircle, DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Banner, Button, ButtonLink, RadioCards, cx, ui } from '@/components/ui';
import { catalogApi, catalogErrorMessage, catalogKeys, type ImportResult } from '@/lib/api/catalog';
import { ApiError } from '@/lib/api/errors';
import { decodeCsv, errorsCsv, formatMb, IMPORT_COLUMNS, IMPORT_MAX_BYTES, IMPORT_MAX_LINES, validateCsvFile } from '@/lib/catalog/csv';
import { asRoute } from '@/lib/routes';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { CatalogGate } from './catalog-gate';
import s from './catalog.module.css';

const T = (id: string) => ltid('importar', id);
const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

export function ImportPage() {
  return <CatalogGate>{(store) => <Importer storeId={store.id} />}</CatalogGate>;
}

type Step = 'file' | 'review' | 'done';

/** K5: importar planilha em 3 passos (planilha, conferir com prévia de erros por linha, resultado). Nada é criado antes de "Importar". */
function Importer({ storeId }: { storeId: string }) {
  const client = useQueryClient();
  const online = useOnline();
  const [step, setStep] = useState<Step>('file');
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [onExisting, setOnExisting] = useState<'skip' | 'update'>('skip');
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), [step]);
  useEffect(() => () => abort.current?.abort(), []);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    if (!online) return setError('Conecte-se para importar.');
    const problem = validateCsvFile(file);
    if (problem) return setError(problem);
    let text: string;
    try {
      text = decodeCsv(await file.arrayBuffer());
    } catch {
      return setError('Não foi possível ler o arquivo. Use o modelo do Webag, em CSV.');
    }
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '').length - 1;
    if (lines > IMPORT_MAX_LINES) return setError(`A planilha tem ${lines} linhas. O máximo é ${IMPORT_MAX_LINES}.`);
    setCsv(text);
    setFileName(file.name);
    setChecking(true);
    abort.current = new AbortController();
    try {
      const checked = await catalogApi.importCsv(storeId, text, 'preview', 'skip', abort.current.signal);
      setPreview(checked);
      setOnExisting('skip');
      setStep('review');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof ApiError && caught.isNetwork ? 'Conecte-se para importar.' : catalogErrorMessage(caught, 'Não foi possível conferir a planilha. Tente de novo.'));
    } finally {
      setChecking(false);
    }
  }

  async function commit() {
    if (!csv) return;
    if (!online) return setError('Conecte-se para importar.');
    setImporting(true);
    setError(null);
    try {
      const done = await catalogApi.importCsv(storeId, csv, 'commit', onExisting);
      setResult(done);
      await client.invalidateQueries({ queryKey: catalogKeys.all });
      setStep('done');
    } catch (caught) {
      setError(catalogErrorMessage(caught, 'A importação não terminou. Nada foi criado; tente de novo.'));
    } finally {
      setImporting(false);
    }
  }

  function restart() {
    setStep('file');
    setCsv(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setOnExisting('skip');
  }

  const steps: { id: Step; label: string }[] = [
    { id: 'file', label: '1. Planilha' },
    { id: 'review', label: '2. Conferir' },
    { id: 'done', label: '3. Resultado' },
  ];
  const toCreate = preview ? preview.productsToCreate + (onExisting === 'update' ? preview.alreadyExist : 0) : 0;

  return (
    <div className={ui.stack}>
      <div>
        <Link href={asRoute('/lojista/produtos')} className={s.productName} data-testid={T('back')}>
          <CaretLeft size={16} aria-hidden="true" /> Produtos
        </Link>
      </div>
      <h1 ref={heading} className="wb-text-title1" tabIndex={-1} style={{ margin: 0, outline: 'none' }}>Importar planilha</h1>
      <ol className={s.stepsHeader} aria-label="Etapas">
        {steps.map((item) => (
          <li key={item.id} className="wb-text-caption-strong" aria-current={item.id === step ? 'step' : undefined}>{item.label}</li>
        ))}
      </ol>
      {!online ? <Banner tone="warning" offline>Conecte-se para importar.</Banner> : null}
      <div className={s.mobileOnly}>
        <Banner tone="info">Para planilhas, o computador costuma ser mais fácil.</Banner>
      </div>
      {error ? <Banner tone="danger" testId={T('error')}>{error}</Banner> : null}

      {step === 'file' ? (
        <section className={ui.stack} aria-label="Escolher a planilha">
          <div className={ui.card}>
            <div className={ui.stack}>
              <p className="wb-text-body" style={{ margin: 0 }}>Baixe o modelo, preencha uma linha por produto (ou por variação) e envie de volta. Nada é criado antes de você conferir.</p>
              <div className={ui.row}>
                {/* Link comum (não `next/link`): é um arquivo para baixar, com o cookie da sessão, e não uma página. */}
                <a href={catalogApi.templateHref(storeId)} download="modelo-produtos-webag.csv" className={cx(ui.button, ui.secondary, 'wb-text-body-strong')} data-testid={T('template-csv')}>
                  <DownloadSimple size={20} aria-hidden="true" />
                  Baixar modelo (CSV)
                </a>
              </div>
              <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Colunas do modelo:</p>
              <ul className={s.columnsList}>
                {IMPORT_COLUMNS.map((column) => (
                  <li key={column}><code>{column}</code></li>
                ))}
              </ul>
              <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Por enquanto, só CSV (no Excel: Salvar como, CSV). Até {IMPORT_MAX_LINES} linhas e {formatMb(IMPORT_MAX_BYTES)}. As fotos você adiciona depois, em cada produto.</p>
            </div>
          </div>
          {checking ? (
            <div className={s.dropzone} role="status" data-testid={T('checking')}>
              <p className="wb-text-body-strong" style={{ margin: 0 }}>Conferindo {fileName}…</p>
              <div className={ui.meter} aria-hidden="true"><div className={cx(ui.meterBar, ui.meterBarOn)} style={{ width: '60%' }} /></div>
              <Button variant="text" onClick={() => abort.current?.abort()} data-testid={T('check-cancel')}>Cancelar</Button>
            </div>
          ) : (
            <div className={s.dropzone}>
              <UploadSimple size={40} aria-hidden="true" />
              <Button onClick={() => input.current?.click()} data-testid={T('choose')}>Escolher planilha</Button>
              <span className="wb-text-caption">CSV, até {IMPORT_MAX_LINES} linhas e {formatMb(IMPORT_MAX_BYTES)}</span>
              <input ref={input} type="file" accept=".csv,text/csv" className={s.hiddenInput} onChange={(event) => void pick(event)} aria-label="Arquivo da planilha" data-testid={T('file-input')} />
            </div>
          )}
        </section>
      ) : null}

      {step === 'review' && preview ? (
        <section className={ui.stack} aria-label="Conferir a planilha">
          <div className={s.summaryBig} role="status">
            <span data-testid={T('summary-valid')}><span className={s.bigNumber}>{preview.valid}</span> {preview.valid === 1 ? 'válida' : 'válidas'}</span>
            <span data-testid={T('summary-errors')}><span className={s.bigNumber}>{preview.invalid}</span> com erro</span>
          </div>
          <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>{fileName}: {plural(preview.totalLines, 'linha', 'linhas')}, {plural(preview.productsToCreate, 'produto novo', 'produtos novos')}.</p>
          {preview.invalid > 0 ? (
            <div className={ui.tableWrap}>
              <table className={ui.table} data-testid={T('errors-table')}>
                <caption className="wb-text-body-strong">Linhas com erro (não serão importadas)</caption>
                <thead>
                  <tr>
                    <th scope="col">Linha</th>
                    <th scope="col">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.errors.map((item) => (
                    <tr key={`${item.line}-${item.message}`} data-testid={T(`error-row-${item.line}`)}>
                      <td data-label="Linha" data-primary>{item.line}</td>
                      <td data-label="Motivo">{item.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Banner tone="success">Nenhum erro. Pode importar.</Banner>
          )}
          {preview.alreadyExist > 0 ? (
            <RadioCards
              legend={`${plural(preview.alreadyExist, 'produto já existe', 'produtos já existem')} (mesmo código)`}
              name="on-existing"
              value={onExisting}
              onChange={setOnExisting}
              options={[
                { value: 'skip', label: 'Pular', description: 'Mantém o produto como está.', testId: T('duplicates-skip') },
                { value: 'update', label: 'Atualizar', description: 'Troca preço, estoque e dados pelos da planilha.', testId: T('duplicates-update') },
              ]}
            />
          ) : null}
          <div className={ui.row}>
            <Button size="lg" onClick={() => void commit()} loading={importing} loadingLabel="Importando…" disabled={toCreate === 0} data-testid={T('import-submit')}>
              Importar {plural(toCreate, 'produto', 'produtos')}
            </Button>
            <Button variant="text" onClick={restart} disabled={importing} data-testid={T('restart')}>Escolher outra planilha</Button>
          </div>
        </section>
      ) : null}

      {step === 'done' && result ? (
        <section className={ui.stack} aria-label="Resultado da importação" data-testid={T('result')}>
          <div className={ui.row}>
            <CheckCircle size={40} weight="fill" aria-hidden="true" color="var(--wb-color-text-success)" />
            <p className="wb-text-title2" style={{ margin: 0 }} role="status">
              {plural(result.created + result.updated, 'produto importado', 'produtos importados')}
              {result.created > 0 ? ' como rascunho' : ''}.
            </p>
          </div>
          {result.updated > 0 ? <p className="wb-text-body" style={{ margin: 0 }}>{plural(result.updated, 'já existente foi atualizado', 'já existentes foram atualizados')}.</p> : null}
          {result.skipped > 0 ? <p className="wb-text-body" style={{ margin: 0 }}>{plural(result.skipped, 'produto pulado', 'produtos pulados')} (já existiam).</p> : null}
          <p className="wb-text-body" style={{ margin: 0 }}>Os rascunhos não aparecem na loja. Abra cada um, adicione as fotos e publique.</p>
          {preview && preview.invalid > 0 ? (
            <p style={{ margin: 0 }}>
              <a className={s.linkButton} href={`data:text/csv;charset=utf-8,${encodeURIComponent(errorsCsv(preview.errors))}`} download="linhas-com-erro.csv" data-testid={T('errors-download')}>
                {preview.invalid === 1 ? 'Baixar a linha com erro' : `Baixar as ${preview.invalid} linhas com erro`} (CSV)
              </a>
            </p>
          ) : null}
          <div className={ui.row}>
            <ButtonLink href={asRoute('/lojista/produtos?filtro=draft')} size="lg" data-testid={T('view-drafts')}>Ver rascunhos</ButtonLink>
            <Button variant="text" onClick={restart} data-testid={T('another')}>Importar outra planilha</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

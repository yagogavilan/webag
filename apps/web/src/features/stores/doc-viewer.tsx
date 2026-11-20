'use client';

import { ArrowClockwise, ArrowsOut, DownloadSimple, FilePdf, FileImage, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, ErrorState, Skeleton, cx, ui } from '@/components/ui';
import { adminStoresApi, type AdminStoreDocument, type DocumentAccess, type DocumentAccessReason } from '@/lib/api/admin-stores';
import { ApiError } from '@/lib/api/errors';
import { tid } from '@/lib/testid';
import { DOCUMENT_NAME } from './catalog';
import s from './stores.module.css';

const T = (id: string) => tid('caso', id);
const ZOOMS = [1, 1.5, 2, 3] as const;

interface Props {
  storeId: string;
  documents: AdminStoreDocument[];
  reason: DocumentAccessReason;
  /** Documento selecionado de fora (atalhos `j` e `k`, miniaturas). */
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Chamado quando o documento abriu de verdade (a URL assinada veio); a conferência em bloco só libera depois de abrir todos. */
  onOpened?: (id: string) => void;
  /** Muda quando o servidor pediu nova abertura (SEC-188): a consulta do documento selecionado refaz e a abertura é gravada de novo. */
  refreshKey?: number;
  /** Muda quando o foco deve ir para o documento (409 `DOCUMENTS_NOT_REVIEWED`). */
  focusToken?: number;
}

/**
 * DocumentViewer (onda-2 A2). Cada abertura gera uma URL assinada de poucos minutos e um registro de auditoria (WB-218):
 * por isso as miniaturas são botões com o nome do documento (uma imagem por miniatura geraria N acessos) e a consulta
 * não refaz sozinha ao voltar o foco da janela.
 */
export function DocumentViewer({ storeId, documents, reason, selectedId, onSelect, onOpened, refreshKey = 0, focusToken = 0 }: Props) {
  const selected = documents.find((doc) => doc.id === selectedId) ?? documents[0];

  const access = useQuery({
    queryKey: ['admin', 'stores', 'document-access', storeId, selected?.id, reason, refreshKey],
    queryFn: () => adminStoresApi.documentAccess(storeId, selected!.id, reason),
    enabled: Boolean(selected),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusToken > 0) root.current?.focus();
  }, [focusToken]);

  const openedId = selected && access.data ? selected.id : null;
  useEffect(() => {
    if (openedId) onOpened?.(openedId);
  }, [openedId, onOpened]);

  if (!selected) {
    return (
      <div className={ui.card} data-testid={T('no-documents')}>
        <p className="wb-text-body" style={{ margin: 0 }}>Nenhum documento enviado.</p>
        <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Peça a correção ao lojista.</p>
      </div>
    );
  }

  const forbidden = access.error instanceof ApiError && access.error.status === 403;
  return (
    <div ref={root} className={s.viewer} tabIndex={-1} aria-label="Documentos da loja" role="region" data-testid={T('doc-viewer')}>
      <div className={s.thumbs} role="group" aria-label="Documentos enviados">
        {documents.map((doc) => (
          <button key={doc.id} type="button" className={cx(s.thumb, 'wb-text-body-strong')} aria-pressed={doc.id === selected.id} onClick={() => onSelect(doc.id)} data-testid={T(`doc-thumb-${doc.id}`)}>
            <FileImage size={20} aria-hidden="true" />
            {DOCUMENT_NAME[doc.kind]}
          </button>
        ))}
      </div>
      {access.isPending ? (
        <Skeleton height={320} label="Abrindo o documento" />
      ) : forbidden ? (
        <Banner tone="danger">Você não tem permissão para abrir documentos.</Banner>
      ) : access.isError || !access.data ? (
        <ErrorState title="Não abriu o documento" text="Tente de novo." onRetry={() => void access.refetch()} testId={T('doc-error')} />
      ) : (
        <Stage key={`${selected.id}-${access.dataUpdatedAt}`} access={access.data} label={DOCUMENT_NAME[selected.kind]} onReopen={() => void access.refetch()} />
      )}
      <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>Cada abertura de documento fica registrada. Teclas: + e - para o zoom, r para girar.</p>
    </div>
  );
}

/** Uma abertura do documento: o estado (zoom, giro, expiração) nasce de novo a cada URL assinada nova. */
function Stage({ access, label, onReopen }: { access: DocumentAccess; label: string; onReopen: () => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0);
  const [turns, setTurns] = useState(0);
  const [expired, setExpired] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const isPdf = access.contentType === 'application/pdf';

  // A URL assinada vale poucos minutos: depois disso o visualizador avisa e pede para abrir de novo.
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(5, access.expiresInSeconds - 10) * 1000);
    return () => clearTimeout(timer);
  }, [access.expiresInSeconds]);

  const zoomIn = () => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1));
  const zoomOut = () => setZoom((z) => Math.max(0, z - 1));
  const rotate = () => setTurns((t) => (t + 1) % 4);
  function onKeyDown(event: React.KeyboardEvent) {
    if (isPdf) return;
    if (event.key === '+' || event.key === '=') zoomIn();
    else if (event.key === '-') zoomOut();
    else if (event.key === 'r') rotate();
  }

  return (
    <>
      <div className={s.tools} role="toolbar" aria-label="Controles do documento">
        <Button variant="secondary" size="sm" icon={<MagnifyingGlassMinus size={20} aria-hidden="true" />} onClick={zoomOut} disabled={zoom === 0 || isPdf}>
          Menos zoom
        </Button>
        <Button variant="secondary" size="sm" icon={<MagnifyingGlassPlus size={20} aria-hidden="true" />} onClick={zoomIn} disabled={zoom === ZOOMS.length - 1 || isPdf}>
          Mais zoom
        </Button>
        <Button variant="secondary" size="sm" icon={<ArrowClockwise size={20} aria-hidden="true" />} onClick={rotate} disabled={isPdf}>
          Girar
        </Button>
        <Button variant="secondary" size="sm" icon={<ArrowsOut size={20} aria-hidden="true" />} onClick={() => void stage.current?.requestFullscreen?.()} disabled={isPdf || expired}>
          Tela cheia
        </Button>
        {!expired ? (
          <a className={cx(ui.button, ui.secondary, ui.sm, 'wb-text-body-strong')} href={access.url} download rel="noopener noreferrer" target="_blank" data-testid={T('doc-download')}>
            <DownloadSimple size={20} aria-hidden="true" /> Baixar
          </a>
        ) : null}
      </div>
      <div ref={stage} className={s.viewerStage} role="group" aria-label={label} tabIndex={0} onKeyDown={onKeyDown}>
        {imageFailed ? (
          <ErrorState title="Não abriu o documento" text="Tente de novo." onRetry={onReopen} testId={T('doc-error')} />
        ) : expired ? (
          <div className={ui.stack} style={{ padding: 16, textAlign: 'center' }} data-testid={T('doc-expired')}>
            <p className="wb-text-body" style={{ margin: 0 }}>A visualização expirou.</p>
            <Button onClick={onReopen}>Abrir de novo</Button>
          </div>
        ) : isPdf ? (
          <div className={ui.stack} style={{ padding: 16, textAlign: 'center' }}>
            <FilePdf size={64} weight="duotone" aria-hidden="true" />
            <p className="wb-text-body" style={{ margin: 0 }}>{label} (PDF)</p>
            <a className={cx(ui.button, ui.primary, 'wb-text-body-strong')} href={access.url} target="_blank" rel="noopener noreferrer" data-testid={T('doc-open-pdf')}>
              Abrir o PDF
            </a>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada de documento privado: sem otimização nem cache do Next
          <img className={s.viewerImg} src={access.url} alt={label} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} style={{ transform: `rotate(${turns * 90}deg) scale(${ZOOMS[zoom] ?? 1})` }} data-testid={T('doc-image')} />
        )}
      </div>
    </>
  );
}

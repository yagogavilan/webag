'use client';

import { Camera, CheckCircle, FilePdf, FileImage, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Dialog, cx, ui } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import type { DocumentKind, StoreDocument } from '@/lib/api/lojista';
import { DOCUMENT_HINT, compressImage, formatBytes, isPdf, validateDocumentFile, type Prepared, type Quarter } from '@/lib/image/prepare';
import { uploadStoreDocument, type UploadDocumentFn } from '@/lib/image/upload';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { ImageCropper } from './image-cropper';
import s from './lojista.module.css';

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  id_front: 'Documento com foto, frente',
  id_back: 'Documento com foto, verso',
  address_proof: 'Comprovante de endereço da loja',
  cnpj_card: 'Cartão CNPJ',
  owner_id_front: 'Documento do responsável, frente',
  owner_id_back: 'Documento do responsável, verso',
};

/** Itens exigidos por tipo de documento (WB-052 C1). */
export const REQUIRED_DOCUMENTS: Record<'cpf' | 'cnpj', DocumentKind[]> = {
  cpf: ['id_front', 'id_back', 'address_proof'],
  cnpj: ['cnpj_card', 'owner_id_front', 'owner_id_back'],
};

type Phase =
  | { name: 'idle' }
  | { name: 'preview'; file: File; url: string | null; quarter: Quarter }
  | { name: 'preparing' }
  | { name: 'uploading'; percent: number }
  | { name: 'waiting' }
  | { name: 'error'; message: string };

interface Props {
  kind: DocumentKind;
  existing?: StoreDocument | undefined;
  /** Motivo do admin quando o item foi marcado com problema (modo correção). */
  correction?: string | undefined;
  /** Item já conferido: aparece fechado (modo correção). */
  locked?: boolean;
  onUploaded: (doc: StoreDocument) => void;
  upload?: UploadDocumentFn;
  /** Mostra "Falta enviar ..." (botão Continuar tocado com o item vazio). */
  missing?: boolean;
}

/**
 * DocSlot (onda-2 L5): vazio, enviando (com progresso e cancelar), enviado e erro. A falha de um slot não derruba os outros.
 * A foto passa por pré-visualização ("Está legível?"), pode ser girada ou recortada e é comprimida antes de sair do aparelho.
 */
export function DocSlot({ kind, existing, correction, locked, onUploaded, upload = uploadStoreDocument, missing }: Props) {
  const title = DOCUMENT_LABEL[kind];
  const online = useOnline();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [cropping, setCropping] = useState(false);
  const [dark, setDark] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [pending, setPending] = useState<{ blob: Blob; name: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const lastAnnounced = useRef(0);

  // Envio pausado por falta de rede: retoma sozinho quando a conexão volta (onda-2 L5, offline).
  useEffect(() => {
    if (phase.name === 'waiting' && online && pending) void send(pending.blob, pending.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à volta da conexão
  }, [online]);

  useEffect(() => () => abort.current?.abort(), []);

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = validateDocumentFile(file);
    if (problem) return setPhase({ name: 'error', message: problem });
    setDark(false);
    setPhase({ name: 'preview', file, url: isPdf(file) ? null : URL.createObjectURL(file), quarter: 0 });
  }

  function closePreview() {
    if (phase.name === 'preview' && phase.url) URL.revokeObjectURL(phase.url);
  }

  async function use(file: File, quarter: Quarter, ready?: Prepared) {
    closePreview();
    if (isPdf(file)) return send(file, file.name);
    setPhase({ name: 'preparing' });
    try {
      const prepared = ready ?? (await compressImage(file, quarter));
      setDark(prepared.dark);
      await send(prepared.blob, file.name.replace(/\.[^.]+$/, '') + '.jpg');
    } catch {
      setPhase({ name: 'error', message: 'Não foi possível preparar a foto. Tire outra.' });
    }
  }

  async function send(blob: Blob, name: string) {
    setPending({ blob, name });
    setPhase({ name: 'uploading', percent: 0 });
    lastAnnounced.current = 0;
    const controller = new AbortController();
    abort.current = controller;
    try {
      const doc = await upload(kind, blob, name, {
        signal: controller.signal,
        onProgress: (percent) => {
          setPhase({ name: 'uploading', percent });
          const mark = percent >= 100 ? 100 : percent >= 50 ? 50 : percent >= 25 ? 25 : 0;
          if (mark > lastAnnounced.current) {
            lastAnnounced.current = mark;
            setAnnounce(`${title}: ${mark}% enviado`);
          }
        },
      });
      setPending(null);
      setPhase({ name: 'idle' });
      onUploaded(doc);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return setPhase({ name: 'idle' });
      if (caught instanceof ApiError && caught.isNetwork) return setPhase({ name: 'waiting' });
      setPhase({ name: 'error', message: 'Não foi possível enviar. Tentar de novo.' });
    }
  }

  const testId = (suffix: string) => ltid('etapa3', `slot-${kind}${suffix}`);
  const uploaded = phase.name === 'idle' ? existing : undefined;
  const busy = phase.name === 'uploading' || phase.name === 'preparing';
  const Icon = existing?.mimeType === 'application/pdf' ? FilePdf : FileImage;

  if (locked) {
    return (
      <div className={s.slot} role="group" aria-label={`${title}: conferido`} data-testid={testId('')}>
        <div className={s.slotHead}>
          <span className={s.thumb}>
            <Icon size={32} aria-hidden="true" />
          </span>
          <div className={s.slotText}>
            <span className="wb-text-body-strong">{title}</span>
            <span className={cx('wb-text-caption', s.slotState, s.slotOk)}>
              <CheckCircle size={16} weight="fill" aria-hidden="true" /> Conferido
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cx(s.slot, !uploaded && phase.name === 'idle' && s.slotEmpty)} role="group" aria-label={`${title}: ${uploaded ? 'enviado' : busy ? 'enviando' : 'falta enviar'}`} data-testid={testId('')}>
      {correction ? <Banner tone="warning" testId={testId('-correction')}>{correction}</Banner> : null}
      <div className={s.slotHead}>
        <span className={s.thumb}>{uploaded ? <Icon size={32} aria-hidden="true" /> : <UploadSimple size={32} aria-hidden="true" />}</span>
        <div className={s.slotText}>
          <span className="wb-text-body-strong">{title}</span>
          {uploaded ? (
            <>
              <span className={cx('wb-text-caption', s.slotState, s.slotOk)}>
                <CheckCircle size={16} weight="fill" aria-hidden="true" /> Enviado
              </span>
              <span className={cx('wb-text-caption', ui.muted)}>
                {uploaded.fileName} · {formatBytes(uploaded.sizeBytes)}
              </span>
            </>
          ) : phase.name === 'error' ? (
            <span className={cx('wb-text-caption', s.slotState, s.slotErr)} role="alert" data-testid={testId('-error')}>
              <WarningCircle size={16} weight="fill" aria-hidden="true" /> {phase.message}
            </span>
          ) : phase.name === 'waiting' ? (
            <span className="wb-text-caption" role="status" data-testid={testId('-waiting')}>
              Sem conexão. Retomamos o envio quando você voltar.
            </span>
          ) : phase.name === 'preparing' ? (
            <span className="wb-text-caption" role="status">
              Preparando a imagem…
            </span>
          ) : phase.name === 'uploading' ? (
            <>
              <progress value={phase.percent} max={100} aria-label={`Envio de ${title}`} data-testid={testId('-progress')} style={{ width: '100%' }} />
              <span className="wb-text-caption">{phase.percent}%</span>
            </>
          ) : (
            <span className={cx('wb-text-caption', ui.muted)}>{DOCUMENT_HINT}</span>
          )}
          {missing && !uploaded && phase.name === 'idle' ? (
            <span className={cx('wb-text-caption', s.slotErr)} role="alert" data-testid={testId('-missing')}>
              Falta enviar {title.charAt(0).toLowerCase() + title.slice(1)}.
            </span>
          ) : null}
        </div>
      </div>
      {dark && uploaded ? <Banner tone="warning">A foto ficou escura. Tente perto de uma janela.</Banner> : null}
      <span className={ui.srOnly} role="status" aria-live="polite">
        {announce}
      </span>
      <div className={s.slotActions}>
        {phase.name === 'uploading' ? (
          <Button variant="secondary" size="sm" onClick={() => abort.current?.abort()} data-testid={testId('-cancel')}>
            Cancelar
          </Button>
        ) : phase.name === 'waiting' ? (
          <Button variant="secondary" size="sm" onClick={() => pending && void send(pending.blob, pending.name)}>
            Tentar agora
          </Button>
        ) : !busy ? (
          <>
            {!uploaded ? (
              <Button variant="secondary" size="sm" icon={<Camera size={20} aria-hidden="true" />} onClick={() => camera.current?.click()} data-testid={testId('-camera')}>
                Tirar foto
              </Button>
            ) : null}
            <Button variant={uploaded ? 'text' : 'secondary'} size="sm" onClick={() => files.current?.click()} data-testid={uploaded ? testId('-replace') : testId('-file')}>
              {uploaded ? 'Trocar' : phase.name === 'error' ? 'Enviar outro' : 'Escolher arquivo'}
            </Button>
            {phase.name === 'error' && pending ? (
              <Button variant="text" size="sm" onClick={() => void send(pending.blob, pending.name)}>
                Tentar de novo
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className={s.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} data-testid={testId('-camera-input')} />
      <input ref={files} type="file" accept="image/jpeg,image/png,application/pdf" className={s.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} data-testid={testId('-file-input')} />

      {phase.name === 'preview' && !cropping ? (
        <Dialog
          title={isPdf(phase.file) ? 'Usar este arquivo?' : 'Está legível?'}
          onClose={() => { closePreview(); setPhase({ name: 'idle' }); }}
          wide
          testId={ltid('etapa3', 'preview')}
          actions={
            <>
              <Button onClick={() => void use(phase.file, phase.quarter)} data-testid={ltid('etapa3', 'preview-accept')}>
                Usar esta
              </Button>
              {!isPdf(phase.file) ? (
                <Button variant="secondary" onClick={() => setCropping(true)} data-testid={ltid('etapa3', 'preview-crop')}>
                  Recortar
                </Button>
              ) : null}
              <Button variant="text" onClick={() => { closePreview(); setPhase({ name: 'idle' }); camera.current?.click(); }} data-testid={ltid('etapa3', 'preview-retake')}>
                Tirar outra
              </Button>
            </>
          }
        >
          {phase.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local (blob:)
            <img className={s.previewImg} src={phase.url} alt={`Pré-visualização: ${title}`} />
          ) : (
            <p className="wb-text-body" style={{ margin: 0 }}>
              {phase.file.name} · {formatBytes(phase.file.size)}
            </p>
          )}
          <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>
            Fotografe com boa luz e sem cortar as bordas.
          </p>
        </Dialog>
      ) : null}
      {phase.name === 'preview' && cropping ? (
        <ImageCropper
          source={phase.file}
          aspect={4 / 3}
          title="Recortar documento"
          onCancel={() => setCropping(false)}
          onAccept={(prepared) => {
            setCropping(false);
            void use(phase.file, 0, prepared);
          }}
        />
      ) : null}
    </div>
  );
}

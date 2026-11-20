'use client';

import { ArrowLineLeft, Camera, Image as ImageIcon, Trash, WarningCircle } from '@phosphor-icons/react';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Banner, Button, SafeImage, ui, cx } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { MAX_PHOTOS } from '@/lib/catalog/helpers';
import { PRODUCT_PHOTO_MAX_BYTES, PRODUCT_PHOTO_MAX_SIDE, validateStoreImage, type Prepared } from '@/lib/image/prepare';
import { uploadStoreImage } from '@/lib/image/upload';
import { ltid } from '@/lib/testid';
import { useOnline } from '@/lib/use-online';
import { ImageCropper } from '../lojista/image-cropper';
import s from './catalog.module.css';

const T = (id: string) => ltid('produto', id);

export interface Photo {
  /** Chave local; o `assetId` só existe depois do envio. */
  key: string;
  assetId?: string;
  previewUrl: string;
  status: 'uploading' | 'ready' | 'error';
  progress: number;
  /** Guardada para "Enviar de novo" sem recortar outra vez. */
  blob?: Blob;
  error?: string;
}

interface Props {
  storeId: string;
  photos: Photo[];
  onChange: (update: (current: Photo[]) => Photo[]) => void;
  error?: string | undefined;
  /** Nome do produto, para o texto alternativo descritivo da foto. */
  productName?: string;
}

let counter = 0;
const nextKey = (): string => `photo-${Date.now()}-${counter++}`;

function uploadMessage(caught: unknown): string {
  if (caught instanceof ApiError && caught.isNetwork) return 'Sem conexão. Tente de novo.';
  if (caught instanceof ApiError && caught.code === 'UPLOAD_REJECTED') return caught.detail ?? 'Essa imagem não serve. Escolha outra.';
  return 'Não foi possível enviar. Tente de novo.';
}

/**
 * Fotos do produto (onda-2 K2 seção 1): até 8, cada uma recortada em 1:1 no navegador (saída até 300 KB e 1.600 px),
 * enviada direto ao armazenamento com barra de progresso. Falha em uma não derruba as outras. Reordenar por arrastar
 * ou pelos botões.
 */
export function PhotoGallery({ storeId, photos, onChange, error, productName }: Props) {
  const online = useOnline();
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const full = photos.length >= MAX_PHOTOS;

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!online) return setProblem('Conecte-se para enviar a foto.');
    const invalid = validateStoreImage(file);
    setProblem(invalid);
    if (!invalid) setPicked(file);
  }

  async function send(key: string, blob: Blob) {
    onChange((current) => current.map((photo) => (photo.key === key ? { ...photo, status: 'uploading', progress: 0, error: undefined } : photo)));
    try {
      const uploaded = await uploadStoreImage(storeId, 'product_image', blob, 'foto.jpg', {
        onProgress: (percent) => onChange((current) => current.map((photo) => (photo.key === key ? { ...photo, progress: percent } : photo))),
      });
      onChange((current) => current.map((photo) => (photo.key === key ? { ...photo, status: 'ready', progress: 100, assetId: uploaded.assetId } : photo)));
    } catch (caught) {
      onChange((current) => current.map((photo) => (photo.key === key ? { ...photo, status: 'error', error: uploadMessage(caught) } : photo)));
    }
  }

  function accept(prepared: Prepared) {
    setPicked(null);
    const key = nextKey();
    onChange((current) => [...current, { key, previewUrl: URL.createObjectURL(prepared.blob), status: 'uploading', progress: 0, blob: prepared.blob }]);
    void send(key, prepared.blob);
  }

  const moveFirst = (key: string) => onChange((current) => [...current.filter((photo) => photo.key === key), ...current.filter((photo) => photo.key !== key)]);
  const remove = (key: string) => onChange((current) => current.filter((photo) => photo.key !== key));
  function drop(event: DragEvent, target: string) {
    event.preventDefault();
    const from = dragging;
    setDragging(null);
    if (!from || from === target) return;
    onChange((current) => {
      const list = current.filter((photo) => photo.key !== from);
      const moved = current.find((photo) => photo.key === from);
      const index = list.findIndex((photo) => photo.key === target);
      if (!moved || index < 0) return current;
      list.splice(index, 0, moved);
      return list;
    });
  }

  return (
    <fieldset className={ui.stack} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend className="wb-text-title2" style={{ padding: 0, marginBottom: 'var(--wb-space-2)' }}>Fotos</legend>
      <p className={cx('wb-text-caption', ui.muted)} style={{ margin: 0 }}>
        Até {MAX_PHOTOS} fotos. A primeira é a capa. Mostre o produto inteiro, com luz natural.
      </p>
      <ul className={s.photoGrid} data-testid={T('photos')}>
        {photos.map((photo, index) => (
          <li
            key={photo.key}
            className={s.photo}
            draggable={photo.status !== 'uploading'}
            onDragStart={() => setDragging(photo.key)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event, photo.key)}
            data-testid={T(`photo-${index}`)}
          >
            <div className={s.photoFrame}>
              <SafeImage
                src={photo.previewUrl}
                alt={`${productName?.trim() ? `${productName.trim()}: foto` : 'Foto do produto'} ${index + 1}${index === 0 ? ', capa' : ''}`}
                className={s.photoImg}
                width={96}
                height={96}
                showLabel
                testId={T(`photo-${index}-img`)}
              />
              {index === 0 ? <span className={s.cover}><span className={ui.badge}>Capa</span></span> : null}
              {photo.status === 'uploading' ? (
                <span className={s.photoProgress} role="progressbar" aria-label={`Enviando a foto ${index + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={photo.progress}>
                  <span className={s.photoProgressBar} style={{ width: `${photo.progress}%`, display: 'block' }} />
                </span>
              ) : null}
              {photo.status === 'error' ? (
                <span className={s.photoError} role="alert">
                  <WarningCircle size={24} weight="fill" aria-hidden="true" />
                  <span className="wb-text-caption">{photo.error}</span>
                  <button type="button" className={s.linkButton} onClick={() => photo.blob && void send(photo.key, photo.blob)} data-testid={T(`photo-${index}-retry`)}>
                    Enviar de novo
                  </button>
                </span>
              ) : null}
            </div>
            <div className={s.photoActions}>
              {index > 0 ? (
                <Button variant="text" size="sm" icon={<ArrowLineLeft size={16} aria-hidden="true" />} onClick={() => moveFirst(photo.key)} aria-label={`Mover a foto ${index + 1} para o início`} data-testid={T(`photo-${index}-move-first`)}>
                  Para o início
                </Button>
              ) : null}
              <Button variant="text" size="sm" icon={<Trash size={16} aria-hidden="true" />} onClick={() => remove(photo.key)} aria-label={`Remover a foto ${index + 1}`} data-testid={T(`photo-${index}-remove`)}>
                Remover
              </Button>
            </div>
          </li>
        ))}
        {!full ? (
          <li className={s.photo}>
            <button type="button" className={s.addPhoto} onClick={() => gallery.current?.click()} data-testid={T('photo-add')}>
              <ImageIcon size={28} aria-hidden="true" />
              <span className="wb-text-body-strong">Adicionar foto</span>
              <span className="wb-text-caption">Escolher da galeria</span>
            </button>
          </li>
        ) : null}
      </ul>
      {!full ? (
        <div>
          <Button variant="text" size="sm" icon={<Camera size={20} aria-hidden="true" />} onClick={() => camera.current?.click()} data-testid={T('photo-camera')}>
            Tirar foto
          </Button>
        </div>
      ) : null}
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" className={s.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid={T('photo-file-input')} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className={s.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid={T('photo-camera-input')} />
      {error ? (
        <span className={cx('wb-text-caption', ui.danger)} role="alert" data-testid={T('photos-error')}>
          {error}
        </span>
      ) : null}
      {problem ? <Banner tone="danger" testId={T('photo-problem')}>{problem}</Banner> : null}
      {picked ? <ImageCropper source={picked} aspect={1} maxSide={PRODUCT_PHOTO_MAX_SIDE} maxBytes={PRODUCT_PHOTO_MAX_BYTES} title="Recortar a foto" onAccept={accept} onCancel={() => setPicked(null)} /> : null}
    </fieldset>
  );
}

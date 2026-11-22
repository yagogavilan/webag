'use client';

import { ArrowLineLeft, Camera, Image as ImageIcon, Trash, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Banner, Button, SafeImage, cx, ui } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { MAX_PHOTOS } from '@/lib/catalog/helpers';
import { PRODUCT_PHOTO_MAX_BYTES, PRODUCT_PHOTO_MAX_SIDE, cropToCanvas, decodeImage, drawRotated, finish, validateStoreImage } from '@/lib/image/prepare';
import { uploadStoreImage, type UploadedImage } from '@/lib/image/upload';
import { ltid } from '@/lib/testid';
import type { Photo } from '../photo-gallery';
import q from './quick.module.css';

const T = (id: string) => ltid('rapido', id);

/** Foto inteira (sem recorte), no máximo 1.600 px e 300 KB: a compressão fica no aparelho, o envio em segundo plano (RN-Q3). */
export async function prepareProductPhoto(file: Blob): Promise<{ blob: Blob }> {
  const bitmap = await decodeImage(file);
  const rotated = drawRotated(bitmap, 0);
  bitmap.close();
  const canvas = cropToCanvas(rotated, { x: 0, y: 0, width: rotated.width, height: rotated.height }, PRODUCT_PHOTO_MAX_SIDE);
  return finish(canvas, PRODUCT_PHOTO_MAX_BYTES);
}

type PrepareFn = (file: Blob) => Promise<{ blob: Blob }>;
type UploadFn = (storeId: string, blob: Blob, onProgress: (percent: number) => void) => Promise<UploadedImage>;
const defaultUpload: UploadFn = (storeId, blob, onProgress) => uploadStoreImage(storeId, 'product_image', blob, 'foto.jpg', { onProgress });

let counter = 0;
const nextKey = (): string => `qphoto-${Date.now()}-${counter++}`;
const OFFLINE_PHOTO = 'Sem internet. Conecte para enviar a foto.';

function previewOf(blob: Blob): string {
  return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';
}

function failureText(caught: unknown): string {
  if (caught instanceof ApiError && caught.isNetwork) return OFFLINE_PHOTO;
  if (caught instanceof ApiError && caught.code === 'UPLOAD_REJECTED') return caught.detail ?? 'Essa imagem não serve. Escolha outra.';
  return 'Não foi possível enviar. Tente de novo.';
}

/** Anuncia o envio a 25, 50, 75 e 100% (não a cada 1%). */
export function progressBucket(percent: number): 0 | 25 | 50 | 75 | 100 {
  return percent >= 100 ? 100 : percent >= 75 ? 75 : percent >= 50 ? 50 : percent >= 25 ? 25 : 0;
}

interface Props {
  storeId: string;
  photos: Photo[];
  onChange: (update: (current: Photo[]) => Photo[]) => void;
  online: boolean;
  productName: string;
  error?: string | undefined;
  /** Abre a câmera ao chegar (melhor esforço: o navegador pode pedir um toque). */
  autoCamera?: boolean;
  /** Foto nova entrou: a tela leva o foco ao Nome (WB-370 C2). */
  onAdded?: () => void;
  prepare?: PrepareFn;
  upload?: UploadFn;
}

/**
 * Fotos do cadastro rápido (WB-370 C1, C2, C6, C7; spec §2 e §7): "Tirar foto" abre a câmera nativa (`capture`), "Galeria" escolhe
 * do aparelho. Sem recorte (cada passo extra custa segundos): a foto é reduzida no aparelho e enviada em segundo plano com progresso.
 * Falha em uma foto não derruba as outras; sem internet a foto espera o lojista (sem envio automático, DEC-126).
 */
export function QuickPhotos({ storeId, photos, onChange, online, productName, error, autoCamera, onAdded, prepare = prepareProductPhoto, upload = defaultUpload }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const lastBucket = useRef<Record<string, number>>({});
  const full = photos.length >= MAX_PHOTOS;

  useEffect(() => {
    if (!autoCamera) return;
    try {
      camera.current?.click();
    } catch {
      /* o navegador exigiu um toque: o botão "Tirar foto" continua na tela */
    }
    // Só na chegada à tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(key: string, change: Partial<Photo>) {
    onChange((current) => current.map((photo) => (photo.key === key ? { ...photo, ...change } : photo)));
  }

  async function send(key: string, blob: Blob) {
    patch(key, { status: 'uploading', progress: 0, error: undefined });
    try {
      const uploaded = await upload(storeId, blob, (percent) => {
        patch(key, { progress: percent });
        const bucket = progressBucket(percent);
        if (bucket > 0 && lastBucket.current[key] !== bucket) {
          lastBucket.current[key] = bucket;
          setAnnounce(bucket === 100 ? 'Foto enviada.' : `Enviando a foto… ${bucket}%`);
        }
      });
      patch(key, { status: 'ready', progress: 100, assetId: uploaded.assetId });
    } catch (caught) {
      patch(key, { status: 'error', error: failureText(caught) });
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const invalid = validateStoreImage(file);
    setProblem(invalid);
    if (invalid) return;
    const key = nextKey();
    onChange((current) => [...current, { key, previewUrl: previewOf(file), status: 'uploading', progress: 0 }]);
    onAdded?.();
    setAnnounce(`Foto adicionada. ${photos.length + 1} de ${MAX_PHOTOS}.`);
    let blob: Blob;
    try {
      blob = (await prepare(file)).blob;
    } catch {
      patch(key, { status: 'error', error: 'Não foi possível preparar a foto. Escolha outra.' });
      return;
    }
    patch(key, { blob });
    if (!navigator.onLine) return patch(key, { status: 'error', error: OFFLINE_PHOTO });
    await send(key, blob);
  }

  const moveFirst = (key: string) => onChange((current) => [...current.filter((p) => p.key === key), ...current.filter((p) => p.key !== key)]);
  const remove = (key: string) => onChange((current) => current.filter((p) => p.key !== key));
  const cover = photos[0];
  const uploading = photos.find((photo) => photo.status === 'uploading');

  return (
    <fieldset className={q.cover} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} data-testid={T('photos')}>
      <legend className="wb-text-title2" style={{ padding: 0, marginBottom: 'var(--wb-space-2)' }}>Foto</legend>
      <div className={q.coverFrame}>
        {cover ? (
          <>
            <SafeImage src={cover.previewUrl} alt={`${productName.trim() || 'Produto'}: foto de capa`} className={q.coverImg} width={390} height={292} showLabel testId={T('cover')} />
            <span className={ui.badge} style={{ position: 'absolute', top: 8, insetInlineStart: 8 }}>Capa</span>
          </>
        ) : (
          <Camera size={48} aria-hidden="true" />
        )}
      </div>
      {photos.length === 0 ? <p className={cx('wb-text-body', q.help)}>Deixe o produto ocupando 80% do quadro. Use luz do dia.</p> : null}

      {photos.length > 0 ? (
        <ul className={q.thumbs} aria-label="Fotos do produto">
          {photos.map((photo, index) => (
            <li key={photo.key} data-testid={T(`photo-${index}`)}>
              <span className={q.thumb} style={{ display: 'block' }}>
                <SafeImage src={photo.previewUrl} alt={`Foto ${index + 1} de ${photos.length}`} className={q.thumbImg} width={64} height={72} />
                {photo.status === 'uploading' ? (
                  <span className={q.thumbBar} role="progressbar" aria-label={`Enviando a foto ${index + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={photo.progress}>
                    <span className={q.thumbBarFill} style={{ width: `${photo.progress}%` }} />
                  </span>
                ) : null}
              </span>
              <span className={q.photoItemActions}>
                {index > 0 ? (
                  <Button variant="text" size="sm" icon={<ArrowLineLeft size={16} aria-hidden="true" />} onClick={() => moveFirst(photo.key)} aria-label={`Mover a foto ${index + 1} para a frente`}>
                    Mover para a frente
                  </Button>
                ) : null}
                <Button variant="text" size="sm" icon={<Trash size={16} aria-hidden="true" />} onClick={() => remove(photo.key)} aria-label={`Foto ${index + 1} de ${photos.length}, remover`} data-testid={T(`photo-${index}-remove`)}>
                  Remover
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {photos.map((photo, index) =>
        photo.status === 'error' ? (
          <p key={`err-${photo.key}`} className={cx('wb-text-body', ui.danger)} role="alert" data-testid={T(`photo-${index}-error`)}>
            <WarningCircle size={20} weight="fill" aria-hidden="true" /> {photo.error}{' '}
            {photo.blob ? (
              <Button variant="text" size="sm" onClick={() => (online ? void send(photo.key, photo.blob as Blob) : patch(photo.key, { error: OFFLINE_PHOTO }))} data-testid={T(`photo-${index}-retry`)}>
                Enviar de novo
              </Button>
            ) : null}
          </p>
        ) : null,
      )}

      <div className={q.photoActions}>
        {!full ? (
          <>
            <Button icon={<Camera size={20} aria-hidden="true" />} onClick={() => camera.current?.click()} data-testid={T('camera')}>
              {photos.length === 0 ? 'Tirar foto' : 'Mais uma foto'}
            </Button>
            <Button variant="secondary" icon={<ImageIcon size={20} aria-hidden="true" />} onClick={() => gallery.current?.click()} data-testid={T('gallery')}>
              Escolher da galeria
            </Button>
          </>
        ) : null}
        <span className={cx('wb-text-caption', q.photoCount)}>{photos.length} de {MAX_PHOTOS} fotos</span>
      </div>
      <details>
        <summary className="wb-text-body" style={{ minHeight: 'var(--wb-size-touch-min)', cursor: 'pointer' }}>A câmera não abriu? Como liberar</summary>
        <p className={cx('wb-text-body', q.help)}>Sem acesso à câmera? Escolha uma foto da galeria. Para liberar a câmera: Ajustes do navegador, Permissões, Câmera.</p>
      </details>

      {uploading ? (
        <div className={q.statusBox} data-testid={T('uploading')}>
          <span className="wb-text-body">Enviando a foto… {uploading.progress}%</span>
          <span className={q.progress} aria-hidden="true">
            <span className={q.progressFill} style={{ width: `${uploading.progress}%` }} />
          </span>
          {!online ? <span className="wb-text-caption">Sem internet. Conecte para enviar a foto.</span> : null}
        </div>
      ) : null}
      {error ? (
        <span className={cx('wb-text-body', ui.danger)} role="alert" data-testid={T('photo-error')}>
          {error}
        </span>
      ) : null}
      {problem ? <Banner tone="danger" testId={T('photo-problem')}>{problem}</Banner> : null}
      <span className={ui.srOnly} role="status" aria-live="polite" data-testid={T('photo-live')}>{announce}</span>
      <input ref={camera} type="file" accept="image/*" capture="environment" className={q.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(event) => void onFile(event)} data-testid={T('camera-input')} />
      <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" className={q.hiddenInput} tabIndex={-1} aria-hidden="true" onChange={(event) => void onFile(event)} data-testid={T('gallery-input')} />
    </fieldset>
  );
}

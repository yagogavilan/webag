'use client';

import { ArrowClockwise, Minus, Plus } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Button, Dialog, ui } from '@/components/ui';
import { canvasToJpeg, clampOffset, cropRect, cropToCanvas, decodeImage, displayScale, drawRotated, finish, zoomAround, type CropView, type Prepared, type Quarter } from '@/lib/image/prepare';
import { ltid } from '@/lib/testid';
import s from './lojista.module.css';

const FRAME_WIDTH = 320;
const STEP = 20;

interface Props {
  source: Blob;
  /** Largura dividida pela altura da moldura (documento: 4 por 3). */
  aspect: number;
  title?: string;
  onAccept: (result: Prepared) => void;
  onCancel: () => void;
}

/**
 * Recorte de imagem (onda-2 C2): moldura fixa, arrastar para mover, zoom por barra e botões, girar, alternativa por
 * teclado (setas movem, `+`/`-` aproximam, `r` gira). Tudo no navegador; sai em JPEG comprimido e sem metadados.
 */
export function ImageCropper({ source, aspect, title = 'Recortar imagem', onAccept, onCancel }: Props) {
  const frameHeight = Math.round(FRAME_WIDTH / aspect);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [quarter, setQuarter] = useState<Quarter>(0);
  const [url, setUrl] = useState<string | null>(null);
  const [view, setView] = useState<Pick<CropView, 'zoom' | 'offsetX' | 'offsetY'>>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    decodeImage(source)
      .then((decoded) => alive && setBitmap(decoded))
      .catch(() => alive && setError('Não foi possível abrir essa imagem. Escolha outra.'));
    return () => {
      alive = false;
    };
  }, [source]);

  useEffect(() => {
    if (!bitmap) return;
    const rotated = drawRotated(bitmap, quarter);
    setCanvas(rotated);
    setView({ zoom: 1, offsetX: 0, offsetY: 0 });
    let alive = true;
    let objectUrl: string | null = null;
    void canvasToJpeg(rotated, 0.7).then((blob) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bitmap, quarter]);

  const full = canvas ? { imageWidth: canvas.width, imageHeight: canvas.height, frameWidth: FRAME_WIDTH, frameHeight, ...view } : null;

  const move = useCallback(
    (dx: number, dy: number) => {
      if (!full) return;
      const next = clampOffset({ ...full, offsetX: full.offsetX + dx, offsetY: full.offsetY + dy });
      setView((current) => ({ ...current, ...next }));
    },
    [full],
  );

  function setZoom(value: number) {
    if (!full) return;
    const next = zoomAround(full, value);
    setView({ zoom: next.zoom, offsetX: next.offsetX, offsetY: next.offsetY });
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: view.offsetX, oy: view.offsetY };
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !full) return;
    const next = clampOffset({ ...full, offsetX: drag.current.ox + event.clientX - drag.current.x, offsetY: drag.current.oy + event.clientY - drag.current.y });
    setView((current) => ({ ...current, ...next }));
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(STEP, 0),
      ArrowRight: () => move(-STEP, 0),
      ArrowUp: () => move(0, STEP),
      ArrowDown: () => move(0, -STEP),
      '+': () => setZoom(view.zoom + 0.25),
      '=': () => setZoom(view.zoom + 0.25),
      '-': () => setZoom(view.zoom - 0.25),
      r: () => setQuarter((q) => ((q + 1) % 4) as Quarter),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  async function accept() {
    if (!canvas || !full) return;
    setBusy(true);
    try {
      onAccept(await finish(cropToCanvas(canvas, cropRect(full))));
    } catch {
      setBusy(false);
      setError('Não foi possível preparar a imagem. Tente de novo.');
    }
  }

  const scale = full ? displayScale(full) : 1;

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      locked={busy}
      wide
      testId={ltid('crop', 'dialog')}
      actions={
        <>
          <Button onClick={() => void accept()} loading={busy} loadingLabel="Preparando a imagem…" disabled={!canvas} data-testid={ltid('crop', 'crop-accept')}>
            Usar recorte
          </Button>
          <Button variant="text" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        </>
      }
    >
      <div className={s.cropper}>
        <div
          className={s.cropFrame}
          style={{ height: frameHeight, maxWidth: FRAME_WIDTH }}
          tabIndex={0}
          role="group"
          aria-label="Área de recorte. Use as setas para mover, mais e menos para aproximar, R para girar."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={onKeyDown}
          data-testid={ltid('crop', 'frame')}
        >
          {url && canvas ? (
            // eslint-disable-next-line @next/next/no-img-element -- pré-visualização local (blob:), sem otimização do Next
            <img className={s.cropImg} src={url} alt="" width={canvas.width} height={canvas.height} style={{ transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${scale})` }} />
          ) : null}
        </div>
        <p className={`wb-text-caption ${ui.muted}`} style={{ margin: 0 }}>
          Arraste a imagem ou use as setas do teclado. A moldura mostra o que será enviado.
        </p>
        <div className={s.cropControls}>
          <button type="button" className={ui.iconButton} onClick={() => setZoom(view.zoom - 0.25)} aria-label="Afastar" data-testid={ltid('crop', 'crop-zoom-out')}>
            <Minus size={24} aria-hidden="true" />
          </button>
          <input className={s.cropRange} type="range" min={1} max={4} step={0.05} value={view.zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" data-testid={ltid('crop', 'crop-zoom')} />
          <button type="button" className={ui.iconButton} onClick={() => setZoom(view.zoom + 0.25)} aria-label="Aproximar" data-testid={ltid('crop', 'crop-zoom-in')}>
            <Plus size={24} aria-hidden="true" />
          </button>
          <Button variant="secondary" size="sm" icon={<ArrowClockwise size={20} aria-hidden="true" />} onClick={() => setQuarter((q) => ((q + 1) % 4) as Quarter)} data-testid={ltid('crop', 'crop-rotate')}>
            Girar
          </Button>
        </div>
        {error ? (
          <p className="wb-text-caption" role="alert" style={{ margin: 0, color: 'var(--wb-color-text-danger)' }}>
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

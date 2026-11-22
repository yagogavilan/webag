import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import type { Photo } from '../photo-gallery';
import { QuickPhotos, progressBucket } from './quick-photos';

URL.createObjectURL = vi.fn(() => 'blob:preview');
const jpeg = (name = 'f.jpg', size = 1000) => new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

function Harness({ onAdded, upload, prepare, online = true, autoCamera }: { onAdded?: () => void; upload?: Parameters<typeof QuickPhotos>[0]['upload']; prepare?: Parameters<typeof QuickPhotos>[0]['prepare']; online?: boolean; autoCamera?: boolean }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  return <QuickPhotos storeId="s1" photos={photos} onChange={setPhotos} online={online} productName="Camiseta" {...(onAdded ? { onAdded } : {})} {...(upload ? { upload } : {})} {...(prepare ? { prepare } : {})} {...(autoCamera ? { autoCamera } : {})} />;
}
const ready = async () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }) });

describe('Fotos do cadastro rápido (WB-370 C1, C2, C6, C7)', () => {
  it('C1: a câmera nativa é um input com capture; a galeria é outro; "Tirar foto" está na tela', () => {
    render(<Harness />);
    expect(screen.getByTestId('lojista.rapido.camera-input')).toHaveAttribute('capture', 'environment');
    expect(screen.getByTestId('lojista.rapido.camera-input')).toHaveAttribute('accept', 'image/*');
    expect(screen.getByTestId('lojista.rapido.gallery-input')).not.toHaveAttribute('capture');
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escolher da galeria' })).toBeInTheDocument();
    expect(screen.getByText(/Deixe o produto ocupando 80% do quadro/)).toBeInTheDocument();
  });

  it('C1: com autoCamera tenta abrir a câmera ao chegar', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click');
    render(<Harness autoCamera />);
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('C2: foto tirada vira capa, avisa a tela (foco no nome), anuncia "Foto adicionada. 1 de 8." e envia em segundo plano com progresso', async () => {
    const onAdded = vi.fn();
    let finish: (() => void) | null = null;
    const upload = vi.fn((_store: string, _blob: Blob, onProgress: (p: number) => void) => {
      onProgress(60);
      return new Promise<{ assetId: string; urls: null }>((resolve) => {
        finish = () => resolve({ assetId: 'asset-1', urls: null });
      });
    });
    render(<Harness onAdded={onAdded} upload={upload} prepare={ready} />);
    fireEvent.change(screen.getByTestId('lojista.rapido.camera-input'), { target: { files: [jpeg()] } });
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('lojista.rapido.photo-live')).toHaveTextContent('Foto adicionada. 1 de 8.');
    expect(await screen.findByText('Enviando a foto… 60%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Enviando a foto 1' })).toHaveAttribute('aria-valuenow', '60');
    expect(screen.getByText('Capa')).toBeInTheDocument();
    await act(async () => {
      (finish as (() => void) | null)?.();
    });
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByTestId('lojista.rapido.photo-live')).toHaveTextContent('Foto enviada.');
    expect(screen.getByText('1 de 8 fotos')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('arquivo que não é imagem aceita (ex.: SVG, acima de 5 MB) é recusado com o motivo, sem enviar', () => {
    const upload = vi.fn();
    render(<Harness upload={upload} prepare={ready} />);
    fireEvent.change(screen.getByTestId('lojista.rapido.gallery-input'), { target: { files: [new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' })] } });
    expect(screen.getByTestId('lojista.rapido.photo-problem')).toHaveTextContent('Use uma foto JPG, PNG ou WebP.');
    fireEvent.change(screen.getByTestId('lojista.rapido.gallery-input'), { target: { files: [jpeg('g.jpg', 6 * 1024 * 1024)] } });
    expect(screen.getByTestId('lojista.rapido.photo-problem')).toHaveTextContent('O máximo é 5 MB');
    expect(upload).not.toHaveBeenCalled();
  });

  it('falha de envio mostra o motivo e "Enviar de novo" repete sem preparar outra vez', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new ApiError({ status: 422, code: 'UPLOAD_REJECTED', title: 'x', detail: 'Imagem com conteúdo inválido.' })).mockResolvedValueOnce({ assetId: 'a2', urls: null });
    const prepare = vi.fn(ready);
    render(<Harness upload={upload} prepare={prepare} />);
    fireEvent.change(screen.getByTestId('lojista.rapido.camera-input'), { target: { files: [jpeg()] } });
    expect(await screen.findByTestId('lojista.rapido.photo-0-error')).toHaveTextContent('Imagem com conteúdo inválido.');
    await userEvent.click(screen.getByTestId('lojista.rapido.photo-0-retry'));
    await waitFor(() => expect(screen.queryByTestId('lojista.rapido.photo-0-error')).not.toBeInTheDocument());
    expect(upload).toHaveBeenCalledTimes(2);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('DEC-126: sem internet a foto espera ("Sem internet. Conecte para enviar a foto.") e nada é enviado sozinho', async () => {
    const upload = vi.fn();
    render(<Harness upload={upload} prepare={ready} online={false} />);
    fireEvent.change(screen.getByTestId('lojista.rapido.camera-input'), { target: { files: [jpeg()] } });
    expect(await screen.findByTestId('lojista.rapido.photo-0-error')).toHaveTextContent('Sem internet. Conecte para enviar a foto.');
    expect(upload).not.toHaveBeenCalled();
  });

  it('remover e "Mover para a frente" têm rótulo próprio; limite de 8 esconde os botões de adicionar', async () => {
    render(<Harness upload={async () => ({ assetId: `a${Math.random()}`, urls: null })} prepare={ready} />);
    for (let i = 0; i < 2; i += 1) {
      fireEvent.change(screen.getByTestId('lojista.rapido.gallery-input'), { target: { files: [jpeg(`f${i}.jpg`)] } });
      await screen.findByText(`${i + 1} de 8 fotos`);
    }
    expect(screen.getByRole('button', { name: 'Mover a foto 2 para a frente' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Foto 1 de 2, remover' }));
    expect(screen.getByText('1 de 8 fotos')).toBeInTheDocument();
    for (let i = 0; i < 7; i += 1) {
      fireEvent.change(screen.getByTestId('lojista.rapido.gallery-input'), { target: { files: [jpeg(`g${i}.jpg`)] } });
      await waitFor(() => expect(screen.getByText(`${i + 2} de 8 fotos`)).toBeInTheDocument());
    }
    expect(screen.queryByRole('button', { name: 'Mais uma foto' })).not.toBeInTheDocument();
  });

  it('C7: o passo a passo de como liberar a câmera está à mão', () => {
    render(<Harness />);
    expect(screen.getByText('A câmera não abriu? Como liberar')).toBeInTheDocument();
    expect(screen.getByText(/Escolha uma foto da galeria/)).toBeInTheDocument();
  });

  it('anúncio de progresso só a 25, 50, 75 e 100%', () => {
    expect([0, 10, 25, 49, 50, 74, 75, 99, 100].map(progressBucket)).toEqual([0, 0, 25, 25, 50, 50, 75, 75, 100]);
  });
});

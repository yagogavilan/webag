import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, networkError } from '@/lib/api/errors';
import type { StoreDocument } from '@/lib/api/lojista';
import type { UploadHooks } from '@/lib/image/upload';
import { DocSlot } from './doc-slot';

vi.mock('@/lib/image/prepare', async (original) => ({
  ...(await original<typeof import('@/lib/image/prepare')>()),
  compressImage: vi.fn(async () => ({ blob: new Blob(['compressed'], { type: 'image/jpeg' }), width: 100, height: 80, dark: false })),
}));

const doc: StoreDocument = { kind: 'id_front', fileName: 'frente.jpg', mimeType: 'image/jpeg', sizeBytes: 250_000, uploadedAt: '2026-11-18T17:00:00Z' };
const T = (id: string) => screen.getByTestId(`lojista.etapa3.slot-id_front${id}`);
const file = (name: string, type: string, size = 1000) => new File([new Uint8Array(size)], name, { type });

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

describe('DocSlot (L5)', () => {
  it('vazio: mostra o formato aceito antes do envio e os dois botões', () => {
    render(<DocSlot kind="id_front" onUploaded={vi.fn()} />);
    expect(screen.getByText('JPG, PNG ou PDF, até 5 MB')).toBeInTheDocument();
    expect(T('-camera')).toHaveTextContent('Tirar foto');
    expect(T('-file')).toHaveTextContent('Escolher arquivo');
    expect(screen.getByRole('group', { name: 'Documento com foto, frente: falta enviar' })).toBeInTheDocument();
  });

  it('arquivo grande é recusado antes de enviar, com o tamanho real', async () => {
    const upload = vi.fn();
    render(<DocSlot kind="id_front" onUploaded={vi.fn()} upload={upload} />);
    await userEvent.upload(T('-file-input'), file('grande.pdf', 'application/pdf', 8 * 1024 * 1024));
    expect(await screen.findByText('Esse arquivo tem 8 MB. O máximo é 5 MB.')).toBeInTheDocument();
    expect(T('-file')).toHaveTextContent('Enviar outro');
    expect(upload).not.toHaveBeenCalled();
  });

  it('tipo errado: instrução de formato', async () => {
    render(<DocSlot kind="id_front" onUploaded={vi.fn()} />);
    await userEvent.upload(T('-file-input'), file('x.gif', 'image/gif'), { applyAccept: false });
    expect(await screen.findByText('Use uma foto (JPG ou PNG) ou PDF.')).toBeInTheDocument();
  });

  it('foto: pré-visualização "Está legível?", comprime e envia só depois de "Usar esta"', async () => {
    const upload = vi.fn(async (_k, blob: Blob, _n, hooks) => {
      hooks.onProgress?.(50);
      expect(blob.size).toBe('compressed'.length);
      return doc;
    });
    const onUploaded = vi.fn();
    render(<DocSlot kind="id_front" onUploaded={onUploaded} upload={upload} />);
    await userEvent.upload(T('-file-input'), file('foto.jpg', 'image/jpeg', 4000));
    expect(await screen.findByRole('dialog', { name: 'Está legível?' })).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('lojista.etapa3.preview-accept'));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(doc));
    expect(upload.mock.calls[0]?.[0]).toBe('id_front');
    expect(upload.mock.calls[0]?.[2]).toBe('foto.jpg');
  });

  it('PDF vai sem recompressão e sem pré-visualização de imagem', async () => {
    const upload = vi.fn(async (_k, blob: Blob) => {
      expect(blob.type).toBe('application/pdf');
      return { ...doc, fileName: 'a.pdf', mimeType: 'application/pdf' };
    });
    render(<DocSlot kind="id_front" onUploaded={vi.fn()} upload={upload} />);
    await userEvent.upload(T('-file-input'), file('a.pdf', 'application/pdf', 2000));
    expect(await screen.findByRole('dialog', { name: 'Usar este arquivo?' })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('lojista.etapa3.preview-accept'));
    await waitFor(() => expect(upload).toHaveBeenCalled());
  });

  it('falha de um envio não é definitiva: mensagem e "Tentar de novo"', async () => {
    const upload = vi.fn().mockRejectedValueOnce(new ApiError({ status: 500, code: 'X', title: 'x' })).mockResolvedValueOnce(doc);
    const onUploaded = vi.fn();
    render(<DocSlot kind="id_front" onUploaded={onUploaded} upload={upload} />);
    await userEvent.upload(T('-file-input'), file('a.pdf', 'application/pdf'));
    await userEvent.click(await screen.findByTestId('lojista.etapa3.preview-accept'));
    expect(await screen.findByText('Não foi possível enviar. Tentar de novo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(doc));
  });

  it('sem conexão: pausa e retoma sozinho quando a rede volta', async () => {
    const upload = vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValueOnce(doc);
    const onUploaded = vi.fn();
    render(<DocSlot kind="id_front" onUploaded={onUploaded} upload={upload} />);
    await userEvent.upload(T('-file-input'), file('a.pdf', 'application/pdf'));
    await userEvent.click(await screen.findByTestId('lojista.etapa3.preview-accept'));
    expect(await screen.findByText('Sem conexão. Retomamos o envio quando você voltar.')).toBeInTheDocument();
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });
    await act(async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(doc));
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('cancelar o envio volta ao estado vazio', async () => {
    const upload = vi.fn((_k, _b, _n, hooks: UploadHooks) => new Promise<StoreDocument>((_, reject) => hooks.signal?.addEventListener('abort', () => reject(new DOMException('x', 'AbortError')))));
    render(<DocSlot kind="id_front" onUploaded={vi.fn()} upload={upload} />);
    await userEvent.upload(T('-file-input'), file('a.pdf', 'application/pdf'));
    await userEvent.click(await screen.findByTestId('lojista.etapa3.preview-accept'));
    await userEvent.click(await screen.findByTestId('lojista.etapa3.slot-id_front-cancel'));
    await waitFor(() => expect(T('-file')).toBeInTheDocument());
  });

  it('enviado: nome, tamanho e "Trocar"; "Falta enviar" só quando pedido', () => {
    const { rerender } = render(<DocSlot kind="id_front" existing={doc} onUploaded={vi.fn()} />);
    expect(screen.getByText('Enviado')).toBeInTheDocument();
    expect(screen.getByText('frente.jpg · 244 KB')).toBeInTheDocument();
    expect(T('-replace')).toHaveTextContent('Trocar');
    rerender(<DocSlot kind="id_front" onUploaded={vi.fn()} missing />);
    expect(T('-missing')).toHaveTextContent('Falta enviar documento com foto, frente.');
  });

  it('modo correção: motivo do admin no item; item conferido fica fechado', () => {
    const { rerender } = render(<DocSlot kind="id_front" existing={doc} correction="A foto do verso está cortada. Tire outra foto." onUploaded={vi.fn()} />);
    expect(T('-correction')).toHaveTextContent('A foto do verso está cortada. Tire outra foto.');
    rerender(<DocSlot kind="id_front" existing={doc} locked onUploaded={vi.fn()} />);
    expect(screen.getByText('Conferido')).toBeInTheDocument();
    expect(screen.queryByTestId('lojista.etapa3.slot-id_front-replace')).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { postToStorage } from './upload';

class FakeXhr {
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 0;
  timeout = 0;
  opened: [string, string] | null = null;
  sent: FormData | null = null;
  open(method: string, url: string) {
    this.opened = [method, url];
  }
  send(form: FormData) {
    this.sent = form;
  }
  abort() {
    this.onabort?.();
  }
}

const policy = { uploadId: 'u1', url: 'https://storage.test/bucket', fields: { key: 'stores/1/doc', policy: 'abc' } };
const factory = (xhr: FakeXhr) => () => xhr as unknown as XMLHttpRequest;

describe('postToStorage', () => {
  it('envia os campos da política antes do arquivo e informa o progresso', async () => {
    const xhr = new FakeXhr();
    const progress = vi.fn();
    const pending = postToStorage(policy, new Blob(['x'], { type: 'image/jpeg' }), 'doc.jpg', { onProgress: progress }, factory(xhr));
    expect(xhr.opened).toEqual(['POST', 'https://storage.test/bucket']);
    expect([...(xhr.sent?.keys() ?? [])]).toEqual(['key', 'policy', 'file']);
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    xhr.status = 204;
    xhr.onload?.();
    await pending;
    expect(progress).toHaveBeenCalledWith(50);
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it('falha de rede vira erro NETWORK (o slot espera a conexão voltar)', async () => {
    const xhr = new FakeXhr();
    const pending = postToStorage(policy, new Blob(['x']), 'doc.jpg', {}, factory(xhr));
    xhr.onerror?.();
    await expect(pending).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('recusa do armazenamento vira erro com o status', async () => {
    const xhr = new FakeXhr();
    const pending = postToStorage(policy, new Blob(['x']), 'doc.jpg', {}, factory(xhr));
    xhr.status = 403;
    xhr.onload?.();
    await expect(pending).rejects.toMatchObject({ status: 403 });
  });

  it('cancelar aborta o envio', async () => {
    const xhr = new FakeXhr();
    const controller = new AbortController();
    const pending = postToStorage(policy, new Blob(['x']), 'doc.jpg', { signal: controller.signal }, factory(xhr));
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

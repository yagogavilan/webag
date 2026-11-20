import { createHmac, randomBytes } from 'node:crypto';
import type { Bucket, ObjectStorage, PresignedPost } from './object-storage.js';

interface Stored {
  body: Buffer;
  contentType: string;
}

/**
 * Driver em memória: SÓ testes (o boot de produção o recusa). Imita o que importa para a segurança: a policy do POST
 * pré-assinado (tamanho e tipo fixos) e a URL de leitura com expiração.
 */
export class MemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, Stored>();
  private readonly secret = randomBytes(16).toString('hex');
  /** Policies emitidas: `upload()` as aplica como o S3 aplicaria. */
  private readonly policies = new Map<string, { maxBytes: number; contentType: string; expiresAt: number }>();

  private k(bucket: Bucket, key: string): string {
    return `${bucket}:${key}`;
  }

  presignedPost(bucket: Bucket, key: string, options: { contentType: string; maxBytes: number; expiresSeconds: number }): Promise<PresignedPost> {
    const expiresAt = Date.now() + options.expiresSeconds * 1000;
    this.policies.set(this.k(bucket, key), { maxBytes: options.maxBytes, contentType: options.contentType, expiresAt });
    return Promise.resolve({ url: 'memory://upload', fields: { key, 'Content-Type': options.contentType }, expiresAt: new Date(expiresAt) });
  }

  /** Simula o cliente enviando ao S3 com a policy emitida. Devolve o status HTTP que o S3 devolveria. */
  upload(bucket: Bucket, key: string, body: Buffer, contentType: string): 204 | 400 | 403 {
    const policy = this.policies.get(this.k(bucket, key));
    if (!policy || policy.expiresAt < Date.now()) return 403;
    if (body.length < 1 || body.length > policy.maxBytes || contentType !== policy.contentType) return 400;
    this.objects.set(this.k(bucket, key), { body, contentType });
    return 204;
  }

  getObject(bucket: Bucket, key: string, options: { maxBytes: number }): Promise<Buffer | null> {
    const found = this.objects.get(this.k(bucket, key));
    return Promise.resolve(found ? found.body.subarray(0, options.maxBytes + 1) : null);
  }

  putObject(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(this.k(bucket, key), { body, contentType });
    return Promise.resolve();
  }

  deleteObject(bucket: Bucket, key: string): Promise<void> {
    this.objects.delete(this.k(bucket, key));
    return Promise.resolve();
  }

  presignedGetUrl(bucket: Bucket, key: string, options: { expiresSeconds: number; contentType: string }): Promise<string> {
    const exp = Date.now() + options.expiresSeconds * 1000;
    const sig = createHmac('sha256', this.secret).update(`${bucket}:${key}:${exp}`).digest('hex').slice(0, 16);
    return Promise.resolve(`memory://${bucket}/${key}?exp=${exp}&ct=${encodeURIComponent(options.contentType)}&sig=${sig}`);
  }

  /** Simula o GET da URL assinada no instante `at`: 200 com URL válida; 403 sem assinatura, adulterada ou vencida. */
  fetchSigned(url: string | null, at = Date.now()): { status: 200 | 403; body?: Buffer; contentType?: string } {
    const match = url ? /^memory:\/\/(public|private)\/(.+)\?exp=(\d+)&ct=([^&]+)&sig=([0-9a-f]+)$/.exec(url) : null;
    if (!match) return { status: 403 };
    const [, bucket, key, exp, ct, sig] = match as unknown as [string, Bucket, string, string, string, string];
    const expected = createHmac('sha256', this.secret).update(`${bucket}:${key}:${exp}`).digest('hex').slice(0, 16);
    if (sig !== expected || Number(exp) < at) return { status: 403 };
    const found = this.objects.get(this.k(bucket, key));
    return found ? { status: 200, body: found.body, contentType: decodeURIComponent(ct) } : { status: 403 };
  }

  /** GET anônimo direto no bucket privado, sem URL assinada: sempre 403 (SEC-051). */
  fetchAnonymous(bucket: Bucket, key: string): { status: 200 | 403 } {
    return bucket === 'public' && this.objects.has(this.k(bucket, key)) ? { status: 200 } : { status: 403 };
  }

  publicUrl(key: string): string {
    return `memory://public/${key}`;
  }

  has(bucket: Bucket, key: string): boolean {
    return this.objects.has(this.k(bucket, key));
  }

  keys(bucket: Bucket): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(`${bucket}:`)).map((k) => k.slice(bucket.length + 1));
  }
}

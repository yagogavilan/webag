/** Armazenamento de objetos S3-compatível (ADR-005). Dois buckets: `public` (variantes re-codificadas) e `private`. */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export type Bucket = 'public' | 'private';

export interface PresignedPost {
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectStorage {
  /** POST pré-assinado com `content-length-range` e `Content-Type` fixos (PUT não limita tamanho). */
  presignedPost(bucket: Bucket, key: string, options: { contentType: string; maxBytes: number; expiresSeconds: number }): Promise<PresignedPost>;
  /** Lê o objeto (no máximo `maxBytes + 1`); `null` se não existir. */
  getObject(bucket: Bucket, key: string, options: { maxBytes: number }): Promise<Buffer | null>;
  putObject(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void>;
  deleteObject(bucket: Bucket, key: string): Promise<void>;
  /** URL de leitura assinada e curta (SEC-051: <= 5 min). `contentType` vem do banco, nunca do arquivo. */
  presignedGetUrl(bucket: Bucket, key: string, options: { expiresSeconds: number; contentType: string; downloadName?: string }): Promise<string>;
  /** URL pública estável de um objeto do bucket público. */
  publicUrl(key: string): string;
}

/** Validade máxima da URL de documento privado (SEC-051). */
export const PRIVATE_URL_TTL_SECONDS = 300;

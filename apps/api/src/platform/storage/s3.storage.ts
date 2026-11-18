import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Bucket, ObjectStorage, PresignedPost } from './object-storage.js';

export interface S3Options {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucketPublic: string;
  bucketPrivate: string;
  publicUrl: string;
  forcePathStyle: boolean;
}

/** Driver S3 (RustFS no dev, R2/S3 em produção): trocar de provedor é só `.env` (ADR-005). */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;

  constructor(private readonly options: S3Options) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
    });
  }

  private bucketName(bucket: Bucket): string {
    return bucket === 'public' ? this.options.bucketPublic : this.options.bucketPrivate;
  }

  async presignedPost(bucket: Bucket, key: string, options: { contentType: string; maxBytes: number; expiresSeconds: number }): Promise<PresignedPost> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucketName(bucket),
      Key: key,
      Conditions: [
        ['content-length-range', 1, options.maxBytes],
        ['eq', '$Content-Type', options.contentType],
      ],
      Fields: { 'Content-Type': options.contentType },
      Expires: options.expiresSeconds,
    });
    return { url, fields, expiresAt: new Date(Date.now() + options.expiresSeconds * 1000) };
  }

  async getObject(bucket: Bucket, key: string, options: { maxBytes: number }): Promise<Buffer | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key, Range: `bytes=0-${options.maxBytes}` }));
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') return null;
      throw error;
    }
  }

  async putObject(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
        // Variantes públicas são imutáveis (a chave muda se o arquivo muda).
        ...(bucket === 'public' ? { CacheControl: 'public, max-age=31536000, immutable' } : {}),
      }),
    );
  }

  async deleteObject(bucket: Bucket, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
  }

  presignedGetUrl(bucket: Bucket, key: string, options: { expiresSeconds: number; contentType: string; downloadName?: string }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        // O tipo vem do banco, não do arquivo; `attachment` impede renderizar HTML/PDF dentro do domínio do storage.
        ResponseContentType: options.contentType,
        ResponseContentDisposition: `attachment; filename="${(options.downloadName ?? 'documento').replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      }),
      { expiresIn: options.expiresSeconds },
    );
  }

  publicUrl(key: string): string {
    return `${this.options.publicUrl.replace(/\/$/, '')}/${key}`;
  }
}

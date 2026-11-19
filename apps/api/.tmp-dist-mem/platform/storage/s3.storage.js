import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
/** Driver S3 (RustFS no dev, R2/S3 em produção): trocar de provedor é só `.env` (ADR-005). */
export class S3ObjectStorage {
    options;
    client;
    constructor(options) {
        this.options = options;
        this.client = new S3Client({
            endpoint: options.endpoint,
            region: options.region,
            forcePathStyle: options.forcePathStyle,
            credentials: { accessKeyId: options.accessKey, secretAccessKey: options.secretKey },
        });
    }
    bucketName(bucket) {
        return bucket === 'public' ? this.options.bucketPublic : this.options.bucketPrivate;
    }
    async presignedPost(bucket, key, options) {
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
    async getObject(bucket, key, options) {
        try {
            const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: key, Range: `bytes=0-${options.maxBytes}` }));
            const bytes = await result.Body?.transformToByteArray();
            return bytes ? Buffer.from(bytes) : null;
        }
        catch (error) {
            const name = error.name;
            if (name === 'NoSuchKey' || name === 'NotFound')
                return null;
            throw error;
        }
    }
    async putObject(bucket, key, body, contentType) {
        await this.client.send(new PutObjectCommand({
            Bucket: this.bucketName(bucket),
            Key: key,
            Body: body,
            ContentType: contentType,
            // Variantes públicas são imutáveis (a chave muda se o arquivo muda).
            ...(bucket === 'public' ? { CacheControl: 'public, max-age=31536000, immutable' } : {}),
        }));
    }
    async deleteObject(bucket, key) {
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: key }));
    }
    presignedGetUrl(bucket, key, options) {
        return getSignedUrl(this.client, new GetObjectCommand({
            Bucket: this.bucketName(bucket),
            Key: key,
            // O tipo vem do banco, não do arquivo; `attachment` impede renderizar HTML/PDF dentro do domínio do storage.
            ResponseContentType: options.contentType,
            ResponseContentDisposition: `attachment; filename="${(options.downloadName ?? 'documento').replace(/[^A-Za-z0-9._-]/g, '_')}"`,
        }), { expiresIn: options.expiresSeconds });
    }
    publicUrl(key) {
        return `${this.options.publicUrl.replace(/\/$/, '')}/${key}`;
    }
}
//# sourceMappingURL=s3.storage.js.map
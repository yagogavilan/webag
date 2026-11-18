import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { MemoryObjectStorage } from './memory.storage.js';
import { OBJECT_STORAGE } from './object-storage.js';
import { S3ObjectStorage } from './s3.storage.js';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        if (config.get('STORAGE_DRIVER', { infer: true }) === 'memory') return new MemoryObjectStorage();
        const endpoint = config.get('S3_ENDPOINT', { infer: true });
        return new S3ObjectStorage({
          endpoint,
          region: config.get('S3_REGION', { infer: true }),
          accessKey: config.get('S3_ACCESS_KEY', { infer: true }),
          secretKey: config.get('S3_SECRET_KEY', { infer: true }),
          bucketPublic: config.get('S3_BUCKET_PUBLIC', { infer: true }),
          bucketPrivate: config.get('S3_BUCKET_PRIVATE', { infer: true }),
          publicUrl: config.get('S3_PUBLIC_URL', { infer: true }),
          // RustFS/MinIO exigem path-style; AWS/R2 aceitam. Padrão: path-style quando o endpoint não é da AWS.
          forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }) ?? !/amazonaws\.com/.test(endpoint),
        });
      },
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}

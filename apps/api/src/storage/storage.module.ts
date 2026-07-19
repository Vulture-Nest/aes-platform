import { Global, Module } from '@nestjs/common';
import { MinioStorageService } from './minio-storage.service';
import { STORAGE_SERVICE } from './storage.service';

/**
 * Binds the StorageService token to the MinIO implementation. Swap the provider here
 * (e.g. GraphStorageService) for production without changing any consumer.
 */
@Global()
@Module({
  providers: [{ provide: STORAGE_SERVICE, useClass: MinioStorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}

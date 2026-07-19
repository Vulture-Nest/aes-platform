import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { Readable } from 'stream';
import type { AppConfig } from '../config/configuration';
import { PutObjectResult, StorageService } from './storage.service';

/**
 * MinIO-backed StorageService for local/dev. Talks S3 over the endpoint from config;
 * production replaces this provider with a Graph/SharePoint implementation.
 */
@Injectable()
export class MinioStorageService implements StorageService, OnModuleInit {
  private readonly logger = new Logger(MinioStorageService.name);
  private readonly client: MinioClient;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const storage = this.config.get('storage', { infer: true });
    this.bucket = storage.bucket;
    this.client = new MinioClient({
      endPoint: storage.endpoint,
      port: storage.port,
      useSSL: storage.useSSL,
      accessKey: storage.accessKey,
      secretKey: storage.secretKey,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucket();
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created storage bucket "${this.bucket}"`);
    }
  }

  async put(key: string, body: Buffer, contentType?: string): Promise<PutObjectResult> {
    const info = await this.client.putObject(
      this.bucket,
      key,
      body,
      body.length,
      contentType ? { 'Content-Type': contentType } : undefined,
    );
    return { bucket: this.bucket, key, etag: info.etag };
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    return this.streamToBuffer(stream);
  }

  getSignedUrl(key: string, expirySeconds = 900): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async remove(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  private streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (c) => chunks.push(c as Buffer));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }
}

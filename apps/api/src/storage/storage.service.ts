/**
 * Storage abstraction. Local dev uses MinIO; production swaps in a SharePoint/Graph
 * implementation without touching callers. Feature modules depend on this interface
 * via the STORAGE_SERVICE token, never on a concrete client.
 */
export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

export interface PutObjectResult {
  bucket: string;
  key: string;
  etag?: string;
}

export interface StorageService {
  /** Idempotently ensure the backing bucket/container exists. */
  ensureBucket(): Promise<void>;

  /** Store an object and return its location. */
  put(key: string, body: Buffer, contentType?: string): Promise<PutObjectResult>;

  /** Retrieve an object's bytes. */
  get(key: string): Promise<Buffer>;

  /** Time-limited download URL for clients. */
  getSignedUrl(key: string, expirySeconds?: number): Promise<string>;

  /** Remove an object. */
  remove(key: string): Promise<void>;
}

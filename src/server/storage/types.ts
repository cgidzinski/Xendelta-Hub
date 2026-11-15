import type { Readable, Writable } from "stream";

// One bucket of objects (docs/storage.md). Production is Cloudflare R2 through the S3 API (s3Store.ts); tests and local
// development without keys use an in-memory bucket (memoryStore.ts). Every key is a path inside the bucket
// ("xendrive/<userId>/<name>", "avatar/<userId>.jpg"); the same keys were used on Google Cloud Storage.

export interface ObjectInfo {
  key: string;
  size: number;
  contentType?: string;
  lastModified?: Date;
}

export interface PutOptions {
  contentType: string;
  cacheControl?: string;
}

export interface ObjectStore {
  /** The bucket's name, for logs and the admin pages. */
  readonly name: string;
  put(key: string, body: Buffer, options: PutOptions): Promise<void>;
  /** Removes the object; a missing one is not an error. */
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Size and type, or null when the object doesn't exist. */
  head(key: string): Promise<ObjectInfo | null>;
  read(key: string): Promise<Readable>;
  /**
   * A stream to write a new object into (a database backup). `done` resolves once the object is stored, and rejects if
   * the upload failed.
   */
  write(key: string, options: PutOptions): { stream: Writable; done: Promise<void> };
  list(prefix: string): Promise<ObjectInfo[]>;
  /** Copy an object from this bucket or another one into this bucket. */
  copyFrom(source: ObjectStore, sourceKey: string, key: string): Promise<void>;
  /** A link anyone holding it can download the object with, until it expires. */
  signedUrl(key: string, minutes: number, options?: { downloadName?: string }): Promise<string>;

  // Uploads sent in chunks (XenDrive). Every part but the last must be at least 5 MB.
  startMultipart(key: string, options: PutOptions): Promise<string>;
  /** Uploads one part (numbered from 1) and returns its ETag, which completing needs. */
  uploadPart(key: string, uploadId: string, partNumber: number, body: Buffer): Promise<string>;
  completeMultipart(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>): Promise<void>;
  abortMultipart(key: string, uploadId: string): Promise<void>;
}

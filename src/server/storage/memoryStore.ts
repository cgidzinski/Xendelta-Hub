import { PassThrough, Readable } from "stream";
import { randomUUID } from "crypto";
import type { ObjectInfo, ObjectStore, PutOptions } from "./types";

interface StoredObject {
  body: Buffer;
  contentType: string;
  cacheControl?: string;
  lastModified: Date;
}

/**
 * A bucket kept in memory: used by the tests (`STORAGE_DRIVER=memory`, set by testing/testApp.ts) and for local
 * development without R2 keys. It behaves like R2 for everything the app relies on, except that it accepts parts of
 * any size (R2 wants every part but the last to be at least 5 MB; the client sends 10 MB chunks).
 */
export class MemoryStore implements ObjectStore {
  readonly objects = new Map<string, StoredObject>();
  private readonly uploads = new Map<string, { key: string; options: PutOptions; parts: Map<number, Buffer> }>();

  constructor(readonly name: string) {}

  /** Forget everything (between tests). */
  clear() {
    this.objects.clear();
    this.uploads.clear();
  }

  /** Multipart uploads started and neither completed nor aborted. */
  openUploads(): string[] {
    return [...this.uploads.keys()];
  }

  keys(): string[] {
    return [...this.objects.keys()];
  }

  async put(key: string, body: Buffer, options: PutOptions) {
    this.objects.set(key, {
      body,
      contentType: options.contentType,
      cacheControl: options.cacheControl,
      lastModified: new Date(),
    });
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async exists(key: string) {
    return this.objects.has(key);
  }

  async head(key: string): Promise<ObjectInfo | null> {
    const o = this.objects.get(key);
    return o ? { key, size: o.body.length, contentType: o.contentType, lastModified: o.lastModified } : null;
  }

  async read(key: string): Promise<Readable> {
    const o = this.objects.get(key);
    if (!o) throw Object.assign(new Error(`No such object: ${key}`), { name: "NoSuchKey" });
    return Readable.from([o.body]);
  }

  write(key: string, options: PutOptions) {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    const done = new Promise<void>((resolve, reject) => {
      stream.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
      stream.on("end", () => {
        void this.put(key, Buffer.concat(chunks), options).then(resolve, reject);
      });
      stream.on("error", reject);
    });
    return { stream, done };
  }

  async list(prefix: string): Promise<ObjectInfo[]> {
    return [...this.objects.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, o]) => ({ key, size: o.body.length, contentType: o.contentType, lastModified: o.lastModified }));
  }

  async copyFrom(source: ObjectStore, sourceKey: string, key: string) {
    if (!(source instanceof MemoryStore)) throw new Error("A memory bucket can only copy from another memory bucket");
    const o = (source as MemoryStore).objects.get(sourceKey);
    if (!o) throw Object.assign(new Error(`No such object: ${sourceKey}`), { name: "NoSuchKey" });
    this.objects.set(key, { ...o, lastModified: new Date() });
  }

  async signedUrl(key: string, minutes: number, options: { downloadName?: string; signingDate?: Date } = {}) {
    const name = options.downloadName ? `&download=${encodeURIComponent(options.downloadName)}` : "";
    const window = options.signingDate ? `&at=${options.signingDate.getTime()}` : "";
    return `https://storage.test/${this.name}/${key}?expires=${minutes}${name}${window}`;
  }

  async startMultipart(key: string, options: PutOptions) {
    const id = randomUUID();
    this.uploads.set(id, { key, options, parts: new Map() });
    return id;
  }

  async uploadPart(key: string, uploadId: string, partNumber: number, body: Buffer) {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) throw new Error("No such upload");
    upload.parts.set(partNumber, body);
    return `"etag-${partNumber}"`;
  }

  async completeMultipart(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) throw new Error("No such upload");
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const bodies = ordered.map((p) => {
      const body = upload.parts.get(p.partNumber);
      if (!body) throw new Error(`Part ${p.partNumber} was never uploaded`);
      return body;
    });
    await this.put(key, Buffer.concat(bodies), upload.options);
    this.uploads.delete(uploadId);
  }

  async abortMultipart(_key: string, uploadId: string) {
    this.uploads.delete(uploadId);
  }
}

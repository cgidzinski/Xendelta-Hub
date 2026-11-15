import { PassThrough, Readable } from "stream";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectInfo, ObjectStore, PutOptions } from "./types";

/** A missing object, whichever way the S3 API says it. */
const isNotFound = (e: unknown) => {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NotFound" || err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
};

/** A bucket on Cloudflare R2 (or any S3-compatible store), reached through the S3 API. */
export class S3Store implements ObjectStore {
  constructor(
    private readonly client: S3Client,
    readonly name: string,
  ) {}

  async put(key: string, body: Buffer, options: PutOptions) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.name,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async delete(key: string) {
    // S3's delete already succeeds for a missing object.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.name, Key: key }));
  }

  async exists(key: string) {
    return (await this.head(key)) !== null;
  }

  async head(key: string): Promise<ObjectInfo | null> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.name, Key: key }));
      return { key, size: r.ContentLength ?? 0, contentType: r.ContentType, lastModified: r.LastModified };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async read(key: string): Promise<Readable> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.name, Key: key }));
    return r.Body as Readable;
  }

  write(key: string, options: PutOptions) {
    const stream = new PassThrough();
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.name,
        Key: key,
        Body: stream,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      },
    });
    const done = upload.done().then(() => undefined);
    return { stream, done };
  }

  async list(prefix: string): Promise<ObjectInfo[]> {
    const out: ObjectInfo[] = [];
    let token: string | undefined;
    do {
      const r = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.name, Prefix: prefix, ContinuationToken: token }),
      );
      for (const o of r.Contents ?? []) {
        if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified });
      }
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async copyFrom(source: ObjectStore, sourceKey: string, key: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.name,
        Key: key,
        CopySource: `${source.name}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`,
      }),
    );
  }

  async signedUrl(key: string, minutes: number, options: { downloadName?: string; signingDate?: Date } = {}) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.name,
        Key: key,
        // With a name, the browser saves the file under it instead of showing it.
        ...(options.downloadName
          ? {
              ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(options.downloadName)}`,
            }
          : {}),
      }),
      { expiresIn: Math.round(minutes * 60), ...(options.signingDate ? { signingDate: options.signingDate } : {}) },
    );
  }

  async startMultipart(key: string, options: PutOptions) {
    const r = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.name,
        Key: key,
        ContentType: options.contentType,
        CacheControl: options.cacheControl,
      }),
    );
    if (!r.UploadId) throw new Error("The storage didn't start the upload");
    return r.UploadId;
  }

  async uploadPart(key: string, uploadId: string, partNumber: number, body: Buffer) {
    const r = await this.client.send(
      new UploadPartCommand({ Bucket: this.name, Key: key, UploadId: uploadId, PartNumber: partNumber, Body: body }),
    );
    if (!r.ETag) throw new Error(`The storage didn't accept part ${partNumber}`);
    return r.ETag;
  }

  async completeMultipart(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.name,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: [...parts]
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipart(key: string, uploadId: string) {
    try {
      await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.name, Key: key, UploadId: uploadId }));
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }
}

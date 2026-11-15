import { S3Client } from "@aws-sdk/client-s3";
import { MemoryStore } from "./memoryStore";
import { S3Store } from "./s3Store";
import type { ObjectStore } from "./types";

// Where files live (docs/storage.md): two buckets on Cloudflare R2, reached through the S3 API.
//   private: XenDrive files (app photos and chat attachments included) and database backups. Read through signed links.
//   public:  profile and group pictures, custom emoji, Recipaint and blog images. Read at STORAGE_PUBLIC_BASE_URL.
// STORAGE_DRIVER=memory keeps both in memory instead (tests, and local development without R2 keys).

export type { ObjectInfo, ObjectStore, PutOptions } from "./types";
export { MemoryStore } from "./memoryStore";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is not set (docs/storage.md)`);
  return value;
};

function createStores(): { privateStore: ObjectStore; publicStore: ObjectStore } {
  if (process.env.STORAGE_DRIVER === "memory") {
    return { privateStore: new MemoryStore("memory-private"), publicStore: new MemoryStore("memory-public") };
  }
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: required("R2_ACCESS_KEY_ID"), secretAccessKey: required("R2_SECRET_ACCESS_KEY") },
  });
  return {
    privateStore: new S3Store(client, required("R2_PRIVATE_BUCKET")),
    publicStore: new S3Store(client, required("R2_PUBLIC_BUCKET")),
  };
}

// Made on first use rather than at import, so the environment (and a test's STORAGE_DRIVER) is read when it's needed.
let stores: ReturnType<typeof createStores> | null = null;
const current = () => (stores ??= createStores());

/** Stands for the real bucket, made on first use; `instanceof` and every method behave as on the bucket itself. */
function lazy(which: "privateStore" | "publicStore"): ObjectStore {
  return new Proxy({} as ObjectStore, {
    get: (_t, prop) => {
      const target = current()[which] as unknown as Record<PropertyKey, unknown>;
      const value = target[prop];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
    getPrototypeOf: () => Object.getPrototypeOf(current()[which]),
  });
}

export const privateStore: ObjectStore = lazy("privateStore");
export const publicStore: ObjectStore = lazy("publicStore");

/** Where public objects are served from, without a trailing slash ("https://files.example.com"). */
export function publicBaseUrl(): string {
  if (process.env.STORAGE_DRIVER === "memory" && !process.env.STORAGE_PUBLIC_BASE_URL)
    return "https://public.storage.test";
  return required("STORAGE_PUBLIC_BASE_URL").replace(/\/+$/, "");
}

/** The public link for an object in the public bucket. */
export const publicUrlFor = (key: string) => `${publicBaseUrl()}/${key}`;

/**
 * The object key behind a public link: one of ours ("<base>/avatar/u1.jpg") or one stored before the move to R2
 * ("https://storage.googleapis.com/<bucket>/avatar/u1.jpg"). Null for anything else (a default avatar, a stranger's URL).
 */
export function publicKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = `${publicBaseUrl()}/`;
  if (url.startsWith(base)) return decodeURIComponent(url.slice(base.length).split("?")[0]) || null;
  const legacy = url.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/(.+?)(\?.*)?$/);
  return legacy ? decodeURIComponent(legacy[1]) : null;
}

/** The in-memory buckets (STORAGE_DRIVER=memory only), for tests to look into or empty. */
export function memoryStores(): { privateStore: MemoryStore; publicStore: MemoryStore } {
  const { privateStore: p, publicStore: q } = current();
  if (!(p instanceof MemoryStore) || !(q instanceof MemoryStore)) {
    throw new Error("memoryStores() needs STORAGE_DRIVER=memory");
  }
  return { privateStore: p, publicStore: q };
}

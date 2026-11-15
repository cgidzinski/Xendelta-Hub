// Storage moves from Google Cloud Storage to Cloudflare R2 (#375). The objects are copied with the same keys (Cloudflare's
// Super Slurper), so private files need nothing: `storage_path` is unchanged. Two things in the database do change:
//
//   1. Public links stored on documents (profile and group pictures, custom emoji, Recipaint and blog images, anything
//      else that kept a "https://storage.googleapis.com/<bucket>/..." URL) now point at STORAGE_PUBLIC_BASE_URL, same key.
//   2. Uploads in progress were Google resumable uploads; they can't be finished on R2, so their sessions are dropped
//      (the person retries the upload).
//
// `up` is repeatable: it only rewrites URLs that still point at Google. It needs STORAGE_PUBLIC_BASE_URL and stops
// without changing anything when it's missing, so it simply runs again once the setting is there.
//
// `down` points the links back at the Google bucket named in GCS_PUBLIC_BUCKET_NAME (dropped sessions stay dropped).
import type { Connection } from "mongoose";

/** Every collection that can hold a public storage URL somewhere in its documents. */
const COLLECTIONS = [
  "users",
  "xensplits",
  "customemojis",
  "blogposts",
  "recipes",
  "recipeprogresses",
  "paints",
  "xenkitchenitems",
  "communities",
  "conversations",
];

const GOOGLE = /https:\/\/storage\.googleapis\.com\/[^/\s"'()<>]+\//g;

/** The same value with every matching URL prefix replaced; strings anywhere inside objects and arrays. */
function rewrite(value: unknown, pattern: RegExp, replacement: string): unknown {
  if (typeof value === "string") return value.replace(pattern, replacement);
  if (Array.isArray(value)) return value.map((v) => rewrite(v, pattern, replacement));
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, pattern, replacement)]));
  }
  return value;
}

async function rewriteAll(connection: Connection, pattern: RegExp, replacement: string) {
  const existing = new Set((await connection.db!.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const name of COLLECTIONS.filter((c) => existing.has(c))) {
    const collection = connection.collection(name);
    for await (const doc of collection.find({})) {
      const changes: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(doc)) {
        if (field === "_id") continue;
        const next = rewrite(value, pattern, replacement);
        if (JSON.stringify(next) !== JSON.stringify(value)) changes[field] = next;
      }
      if (Object.keys(changes).length > 0) await collection.updateOne({ _id: doc._id }, { $set: changes });
    }
  }
}

export async function up(connection: Connection): Promise<void> {
  const base = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (!base)
    throw new Error("STORAGE_PUBLIC_BASE_URL is not set: set it to the R2 public bucket's address, then run again");
  await rewriteAll(connection, GOOGLE, `${base}/`);
  await connection.collection("xendriveuploadsessions").deleteMany({ storage_upload_id: { $exists: false } });
}

export async function down(connection: Connection): Promise<void> {
  const base = process.env.STORAGE_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  const bucket = process.env.GCS_PUBLIC_BUCKET_NAME;
  if (!base || !bucket) throw new Error("down needs STORAGE_PUBLIC_BASE_URL and GCS_PUBLIC_BUCKET_NAME");
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await rewriteAll(connection, new RegExp(`${escaped}/`, "g"), `https://storage.googleapis.com/${bucket}/`);
}

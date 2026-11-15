import mongoose from "mongoose";
import { BACKUP_NAME_PATTERN } from "@shared/admin";
import { RECIPAINT_ASSET_FOLDER, thumbGcsPathFor } from "@shared/recipaint/assetUrls";
import { privateStore, publicKeyFromUrl, publicStore, type ObjectInfo, type ObjectStore } from "../storage";

// Finds stored objects nothing in the database points at (npm run storage:orphans; docs/storage.md), and database
// records whose object is missing. Read-only unless `removeOrphans` is called.
//
//   private bucket: an object is used when a XenDrive file's storage_path is its key, or it's a database backup.
//   public bucket:  an object is used when any document anywhere holds its public link (an avatar, a recipe image, a
//                   link inside a blog post's text...), a custom emoji's storagePath is its key, or it's the thumbnail of
//                   a Recipaint image that is used.

/** Objects younger than this are never orphans: their record may not be saved yet (an upload in progress). */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export interface OrphanReport {
  private: { total: number; orphans: ObjectInfo[] };
  public: { total: number; orphans: ObjectInfo[] };
  /** XenDrive files whose object isn't in the bucket. Reported only; never deleted. */
  missing: Array<{ id: string; storage_path: string }>;
}

const URL_IN_TEXT = /https?:\/\/[^\s"'()<>\]]+/g;

/** Every public object key the database refers to, found by walking every string in every collection. */
async function publicKeysInUse(): Promise<Set<string>> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Not connected to the database");
  const keys = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (!value.includes("http")) return;
      for (const url of value.match(URL_IN_TEXT) ?? []) {
        const key = publicKeyFromUrl(url);
        if (key) keys.add(key);
      }
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
      if ((value as { _bsontype?: string })._bsontype) return; // an ObjectId or another BSON value
      Object.values(value).forEach(visit);
    }
  };
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith("system.")) continue;
    for await (const doc of db.collection(name).find({})) visit(doc);
  }
  for await (const emoji of db.collection("customemojis").find({}, { projection: { storagePath: 1 } })) {
    if (typeof emoji.storagePath === "string") keys.add(emoji.storagePath);
  }
  // A Recipaint image that is used keeps its thumbnail.
  for (const key of [...keys]) {
    if (key.startsWith(`${RECIPAINT_ASSET_FOLDER}/`) && !key.startsWith(`${RECIPAINT_ASSET_FOLDER}/thumbs/`)) {
      keys.add(thumbGcsPathFor(key.slice(key.lastIndexOf("/") + 1)));
    }
  }
  return keys;
}

const isFresh = (o: ObjectInfo, now: number) => !!o.lastModified && now - o.lastModified.getTime() < ORPHAN_GRACE_MS;

export async function findOrphans(now: Date = new Date()): Promise<OrphanReport> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Not connected to the database");
  const files = await db
    .collection("xendrivefiles")
    .find({}, { projection: { storage_path: 1 } })
    .toArray();
  const privatePaths = new Set(files.map((f) => String(f.storage_path)));

  const [privateObjects, publicObjects, publicKeys] = await Promise.all([
    privateStore.list(""),
    publicStore.list(""),
    publicKeysInUse(),
  ]);
  const privateKeys = new Set(privateObjects.map((o) => o.key));
  const t = now.getTime();

  return {
    private: {
      total: privateObjects.length,
      orphans: privateObjects.filter(
        (o) => !privatePaths.has(o.key) && !BACKUP_NAME_PATTERN.test(o.key) && !isFresh(o, t),
      ),
    },
    public: {
      total: publicObjects.length,
      orphans: publicObjects.filter((o) => !publicKeys.has(o.key) && !isFresh(o, t)),
    },
    missing: files
      .filter((f) => !privateKeys.has(String(f.storage_path)))
      .map((f) => ({ id: String(f._id), storage_path: String(f.storage_path) })),
  };
}

/** Delete the orphans a report found. Returns how many objects and bytes went. */
export async function removeOrphans(report: OrphanReport): Promise<{ objects: number; bytes: number }> {
  let objects = 0;
  let bytes = 0;
  const run = async (store: ObjectStore, orphans: ObjectInfo[]) => {
    for (const o of orphans) {
      await store.delete(o.key);
      objects += 1;
      bytes += o.size;
    }
  };
  await run(privateStore, report.private.orphans);
  await run(publicStore, report.public.orphans);
  return { objects, bytes };
}

/** Orphans per top-level folder, for the printout. */
export function byFolder(orphans: ObjectInfo[]): Record<string, { count: number; bytes: number }> {
  const out: Record<string, { count: number; bytes: number }> = {};
  for (const o of orphans) {
    const top = o.key.includes("/") ? o.key.split("/")[0] : "(top level)";
    out[top] ??= { count: 0, bytes: 0 };
    out[top].count += 1;
    out[top].bytes += o.size;
  }
  return out;
}

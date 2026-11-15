import { BACKUP_NAME_PATTERN } from "@shared/admin";
import { FileRecord } from "../models/fileRecord";
import { privateStore, publicStore, type ObjectInfo, type ObjectStore } from "../storage";

// Finds stored objects that have no FileRecord (npm run storage:orphans; docs/storage.md), and records whose object is
// missing. Read-only unless `removeOrphans` is called.
//
// Every object the app stores has a record (models/fileRecord.ts): the file itself, its thumbnail and its preview.
// An object no record names, other than a database backup, is an orphan: an upload that was never saved, or what a
// crash left behind. Nothing is read from other collections, so nothing a document points at can be deleted.

/** Objects younger than this are never orphans: their record may not be saved yet (an upload in progress). */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export interface OrphanReport {
  private: { total: number; orphans: ObjectInfo[] };
  public: { total: number; orphans: ObjectInfo[] };
  /** Records whose object isn't in its bucket. Reported only; never deleted. */
  missing: Array<{ id: string; bucket: "private" | "public"; key: string }>;
}

const isFresh = (o: ObjectInfo, now: number) => !!o.lastModified && now - o.lastModified.getTime() < ORPHAN_GRACE_MS;

export async function findOrphans(now: Date = new Date()): Promise<OrphanReport> {
  const [privateObjects, publicObjects] = await Promise.all([privateStore.list(""), publicStore.list("")]);
  const present = {
    private: new Set(privateObjects.map((o) => o.key)),
    public: new Set(publicObjects.map((o) => o.key)),
  };
  const used = { private: new Set<string>(), public: new Set<string>() };
  const missing: OrphanReport["missing"] = [];

  for await (const r of FileRecord.find({}, "bucket key thumbKey previewKey").lean().cursor()) {
    used[r.bucket].add(r.key);
    if (r.thumbKey) used[r.bucket].add(r.thumbKey);
    if (r.previewKey) used[r.bucket].add(r.previewKey);
    if (!present[r.bucket].has(r.key)) missing.push({ id: String(r._id), bucket: r.bucket, key: r.key });
  }
  const t = now.getTime();

  return {
    private: {
      total: privateObjects.length,
      orphans: privateObjects.filter(
        (o) => !used.private.has(o.key) && !BACKUP_NAME_PATTERN.test(o.key) && !isFresh(o, t),
      ),
    },
    public: {
      total: publicObjects.length,
      orphans: publicObjects.filter((o) => !used.public.has(o.key) && !isFresh(o, t)),
    },
    missing,
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

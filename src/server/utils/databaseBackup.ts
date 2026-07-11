import zlib from "zlib";
import readline from "readline";
import { EJSON } from "bson";
import type { Db, Document } from "mongodb";

const BATCH_SIZE = 500;
const META_PREFIX = "#META\t";
const COLLECTION_PREFIX = "#COLLECTION\t";

export interface CollectionStat {
  name: string;
  count: number;
}

export interface ExportMeta {
  exportedBy: string;
}

export interface CollectionRestoreSummary {
  name: string;
  deleted: number;
  inserted: number;
  error?: string;
}

// Enumerates real (non-system) collections dynamically, rather than relying on the
// hardcoded Mongoose model list, since collections are created lazily and orphaned
// ones may exist.
export async function listBackupCollections(db: Db): Promise<string[]> {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  return collections
    .map((collection) => collection.name)
    .filter((name) => !name.startsWith("system."))
    .sort();
}

export async function getCollectionStats(db: Db): Promise<CollectionStat[]> {
  const names = await listBackupCollections(db);
  return Promise.all(
    names.map(async (name) => ({
      name,
      count: await db.collection(name).estimatedDocumentCount(),
    }))
  );
}

// Note: does not attach its own "error" listener - streamExport already subscribes to
// "error" on both the gzip stream and destStream once, up front, which is enough to
// surface write failures through its overall `finished` promise. Attaching a fresh
// listener per call here would leak listeners across a large export's many writes.
function writeLine(stream: NodeJS.WritableStream, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = stream.write(line + "\n", (err) => {
      if (err) reject(err);
    });
    if (ok) {
      resolve();
    } else {
      stream.once("drain", resolve);
    }
  });
}

// Streams every document from every collection as gzip-compressed NDJSON to destStream.
// Uses BSON EJSON (canonical mode) rather than plain JSON so ObjectId/Date/etc round-trip
// exactly on restore instead of degrading to plain strings.
export async function streamExport(db: Db, destStream: NodeJS.WritableStream, meta: ExportMeta): Promise<void> {
  const collectionNames = await listBackupCollections(db);
  const gzip = zlib.createGzip();

  const finished = new Promise<void>((resolve, reject) => {
    destStream.once("finish", resolve);
    destStream.once("error", reject);
    gzip.once("error", reject);
  });

  gzip.pipe(destStream);

  const metaLine = JSON.stringify({
    exportedAt: new Date().toISOString(),
    exportedBy: meta.exportedBy,
    collections: collectionNames,
  });
  await writeLine(gzip, META_PREFIX + metaLine);

  for (const name of collectionNames) {
    await writeLine(gzip, COLLECTION_PREFIX + name);
    const cursor = db.collection(name).find({});
    for await (const doc of cursor) {
      await writeLine(gzip, EJSON.stringify(doc, { relaxed: false }));
    }
  }

  gzip.end();
  await finished;
}

// Restores a gzip NDJSON dump produced by streamExport. Wipes every currently-existing
// collection first (deleteMany, not drop - drop would also remove indexes, which are only
// recreated by Mongoose at app startup), then inserts the dump's documents via the native
// driver (not Mongoose models) so document pre("save") hooks don't mutate restored data.
export async function restoreFromGzipStream(db: Db, srcStream: NodeJS.ReadableStream): Promise<CollectionRestoreSummary[]> {
  const existingNames = await listBackupCollections(db);
  const summaries = new Map<string, CollectionRestoreSummary>();

  for (const name of existingNames) {
    const { deletedCount } = await db.collection(name).deleteMany({});
    summaries.set(name, { name, deleted: deletedCount ?? 0, inserted: 0 });
  }

  const gunzip = zlib.createGunzip();
  srcStream.pipe(gunzip);
  const rl = readline.createInterface({ input: gunzip, crlfDelay: Infinity });

  let currentCollection: string | null = null;
  let batch: Document[] = [];

  const flush = async () => {
    if (!currentCollection || batch.length === 0) return;
    const docs = batch;
    batch = [];
    const summary = summaries.get(currentCollection) ?? { name: currentCollection, deleted: 0, inserted: 0 };
    try {
      const result = await db.collection(currentCollection).insertMany(docs, { ordered: false });
      summary.inserted += result.insertedCount;
    } catch (err) {
      summary.error = err instanceof Error ? err.message : String(err);
    }
    summaries.set(currentCollection, summary);
  };

  for await (const rawLine of rl) {
    if (!rawLine) continue;
    if (rawLine.startsWith(META_PREFIX)) {
      continue;
    }
    if (rawLine.startsWith(COLLECTION_PREFIX)) {
      await flush();
      currentCollection = rawLine.slice(COLLECTION_PREFIX.length).trim();
      continue;
    }
    batch.push(EJSON.parse(rawLine, { relaxed: false }) as Document);
    if (batch.length >= BATCH_SIZE) {
      await flush();
    }
  }
  await flush();

  return Array.from(summaries.values());
}

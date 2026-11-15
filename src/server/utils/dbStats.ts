import mongoose from "mongoose";

const LIMIT_BYTES = 16 * 1024 * 1024;

// Some apps keep everything for a group, book or notebook inside one document, and MongoDB refuses a document over 16 MB.
// This finds the biggest ones so an admin can see which are getting close (npm run db:stats prints the full report).
const WATCHED: Array<{ collection: string; label: string; nameField: string }> = [
  { collection: "xensplits", label: "XenSplit", nameField: "name" },
  { collection: "xenbudgets", label: "XenBudget", nameField: "name" },
  { collection: "xenkitchens", label: "XenKitchen", nameField: "name" },
  { collection: "xenroutines", label: "XenRoutine", nameField: "name" },
];

export interface DocumentSize {
  label: string;
  collection: string;
  bytes: number;
  percentOfLimit: number;
}

/** The largest documents across the apps that embed their data, biggest first. Read-only. */
export async function largestDocuments(limit = 6): Promise<DocumentSize[]> {
  const db = mongoose.connection.db;
  if (!db) return [];
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  const rows: DocumentSize[] = [];
  for (const w of WATCHED.filter((x) => existing.has(x.collection))) {
    const top = await db
      .collection(w.collection)
      .aggregate<{ name?: string; bytes: number }>([
        { $project: { name: `$${w.nameField}`, bytes: { $bsonSize: "$$ROOT" } } },
        { $sort: { bytes: -1 } },
        { $limit: limit },
      ])
      .toArray();
    for (const t of top) {
      rows.push({
        label: `${w.label} "${t.name ?? "Untitled"}"`,
        collection: w.collection,
        bytes: t.bytes,
        percentOfLimit: Math.round((t.bytes / LIMIT_BYTES) * 1000) / 10,
      });
    }
  }
  return rows.sort((a, b) => b.bytes - a.bytes).slice(0, limit);
}

export interface LedgerMismatch {
  type: "user" | "community";
  id: string;
  balance: number;
  ledger: number;
}

/**
 * Accounts whose balance differs from what the gem ledger says it should be (applied credits minus applied debits).
 * Each one is a gem movement that bypassed billing/ledger.ts. Read-only.
 */
export async function ledgerMismatches(limit = 50): Promise<{ checked: number; mismatches: LedgerMismatch[] }> {
  const db = mongoose.connection.db;
  if (!db) return { checked: 0, mismatches: [] };
  const net = new Map<string, number>();
  const add = (type: string, id: unknown, amount: number) => {
    if (type === "house" || id == null) return;
    const key = `${type}:${String(id)}`;
    net.set(key, (net.get(key) ?? 0) + amount);
  };
  const sides = await db
    .collection("gemtransactions")
    .aggregate<{ _id: { side: string; type: string; id: unknown }; total: number }>([
      { $match: { status: "applied" } },
      {
        $facet: {
          credits: [{ $group: { _id: { side: "to", type: "$to.type", id: "$to.id" }, total: { $sum: "$amount" } } }],
          debits: [
            { $group: { _id: { side: "from", type: "$from.type", id: "$from.id" }, total: { $sum: "$amount" } } },
          ],
        },
      },
      { $project: { all: { $concatArrays: ["$credits", "$debits"] } } },
      { $unwind: "$all" },
      { $replaceRoot: { newRoot: "$all" } },
    ])
    .toArray();
  for (const s of sides) add(s._id.type, s._id.id, s._id.side === "to" ? s.total : -s.total);

  const mismatches: LedgerMismatch[] = [];
  let checked = 0;
  const accounts = [
    { type: "user" as const, collection: "users", field: "gems" },
    { type: "community" as const, collection: "communities", field: "fund" },
  ];
  for (const a of accounts) {
    const cursor = db.collection(a.collection).find({}, { projection: { [a.field]: 1 } });
    for await (const doc of cursor) {
      checked++;
      const balance = Number(doc[a.field] ?? 0);
      const ledger = net.get(`${a.type}:${String(doc._id)}`) ?? 0;
      if (balance !== ledger && mismatches.length < limit) {
        mismatches.push({ type: a.type, id: String(doc._id), balance, ledger });
      }
    }
  }
  return { checked, mismatches };
}

export interface SchemaDrift {
  /** Collections no model uses (left from a removed app), with their document counts. */
  unmodelled: Array<{ collection: string; documents: number }>;
  /** Top-level fields stored on documents that the model's schema doesn't define, with how many documents have each. */
  unknownFields: Array<{ collection: string; field: string; documents: number }>;
  /** Leftovers from older features that the current code no longer writes. */
  legacy: Array<{ label: string; documents: number }>;
}

/** Collections every Mongo deployment has that no model is expected to own. */
const SYSTEM_COLLECTIONS = new Set(["migrations"]);

/**
 * What the database holds that the code no longer describes. Needs every model registered first (the db:stats script
 * loads them). Read-only.
 */
export async function schemaDrift(): Promise<SchemaDrift> {
  const db = mongoose.connection.db;
  if (!db) return { unmodelled: [], unknownFields: [], legacy: [] };
  const models = new Map(
    mongoose.modelNames().map((n) => [mongoose.model(n).collection.collectionName, mongoose.model(n)]),
  );
  const drift: SchemaDrift = { unmodelled: [], unknownFields: [], legacy: [] };

  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith("system.") || SYSTEM_COLLECTIONS.has(name)) continue;
    const model = models.get(name);
    if (!model) {
      drift.unmodelled.push({ collection: name, documents: await db.collection(name).estimatedDocumentCount() });
      continue;
    }
    const known = new Set(["_id", "__v", ...Object.keys(model.schema.paths).map((p) => p.split(".")[0])]);
    const counts = await db
      .collection(name)
      .aggregate<{ _id: string; n: number }>([
        { $project: { keys: { $map: { input: { $objectToArray: "$$ROOT" }, as: "kv", in: "$$kv.k" } } } },
        { $unwind: "$keys" },
        { $match: { keys: { $nin: [...known] } } },
        { $group: { _id: "$keys", n: { $sum: 1 } } },
      ])
      .toArray();
    for (const c of counts) drift.unknownFields.push({ collection: name, field: c._id, documents: c.n });
  }

  const legacyChecks: Array<{ label: string; collection: string; filter: object }> = [
    {
      label: "XenSplit photos never moved to XenDrive",
      collection: "xensplits",
      filter: { "expenses.images": { $elemMatch: { gcs_path: { $exists: true }, file_id: { $exists: false } } } },
    },
    {
      label: "XenBudget photos never moved to XenDrive",
      collection: "xenbudgetitems",
      filter: { images: { $elemMatch: { gcs_path: { $exists: true }, file_id: { $exists: false } } } },
    },
    {
      label: "XenNote photos never moved to XenDrive",
      collection: "xennotes",
      filter: { images: { $elemMatch: { gcs_path: { $exists: true }, file_id: { $exists: false } } } },
    },
    {
      label: "XenKitchen photos never moved to XenDrive",
      collection: "xenkitchenitems",
      filter: { images: { $elemMatch: { gcs_path: { $exists: true }, file_id: { $exists: false } } } },
    },
    {
      label: "People with extra XenDrive space from the old quota",
      collection: "users",
      filter: { "xendrive.spaceAllowed": { $gt: 0 } },
    },
    {
      label: "Files with a plain-text link password",
      collection: "xendrivefiles",
      filter: { password: { $exists: true, $nin: [null, ""] } },
    },
  ];
  for (const check of legacyChecks) {
    const documents = await db.collection(check.collection).countDocuments(check.filter);
    if (documents > 0) drift.legacy.push({ label: check.label, documents });
  }
  // Files whose FileRecord is missing (a record is written with every file; the file-records migration backfills them).
  const [noRecord] = await db
    .collection("xendrivefiles")
    .aggregate<{ n: number }>([
      { $lookup: { from: "filerecords", localField: "_id", foreignField: "_id", as: "record" } },
      { $match: { record: { $size: 0 } } },
      { $count: "n" },
    ])
    .toArray();
  if (noRecord?.n) drift.legacy.push({ label: "XenDrive files without a file record", documents: noRecord.n });
  return drift;
}

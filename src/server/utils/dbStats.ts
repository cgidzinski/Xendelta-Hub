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

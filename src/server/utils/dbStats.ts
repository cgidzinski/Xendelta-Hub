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

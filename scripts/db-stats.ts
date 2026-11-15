/**
 * Read-only health report for the database: how close documents are to MongoDB's 16 MB limit,
 * how big the busiest groups/books are, and whether money amounts have float noise.
 *
 * Run it against any environment (it reads MONGODB_URI like everything else):
 *   npm run db:stats
 *
 * It only runs aggregations; it never writes. Safe on production.
 */
require("dotenv").config({ quiet: true });

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { ledgerMismatches, schemaDrift } from "../src/server/utils/dbStats";

// Every model, so the report can tell which collections and fields the code no longer knows about.
const MODELS = path.join(__dirname, "..", "src", "server", "models");
for (const file of fs.readdirSync(MODELS)) {
  if (file.endsWith(".ts") && !file.endsWith(".test.ts")) require(path.join(MODELS, file));
}

const LIMIT = 16 * 1024 * 1024;
const mb = (n: number) => (n / 1024 / 1024).toFixed(2) + " MB";
const kb = (n: number) => (n / 1024).toFixed(1) + " KB";
const pct = (n: number) => ((n / LIMIT) * 100).toFixed(2) + "% of the 16 MB document limit";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarise(label: string, sizes: number[], counts?: number[], countLabel = "items") {
  const s = [...sizes].sort((a, b) => a - b);
  console.log(`  ${label}: ${s.length} document(s)`);
  if (s.length === 0) return;
  const total = s.reduce((a, b) => a + b, 0);
  console.log(
    `    size  avg ${kb(total / s.length)}   p95 ${kb(percentile(s, 95))}   max ${kb(s[s.length - 1])}  (${pct(s[s.length - 1])})`,
  );
  if (counts && counts.length) {
    const c = [...counts].sort((a, b) => a - b);
    console.log(
      `    ${countLabel}  avg ${(c.reduce((a, b) => a + b, 0) / c.length).toFixed(1)}   max ${c[c.length - 1]}`,
    );
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`\nDatabase: ${db.databaseName}\n`);

  const has = async (name: string) => (await db.listCollections({ name }).toArray()).length > 0;

  // ---- XenSplit groups: everything lives inside one document each ----
  if (await has("xensplits")) {
    console.log("XenSplit groups (expenses/settlements/exchanges are embedded in the group document)");
    const rows = await db
      .collection("xensplits")
      .aggregate([
        {
          $project: {
            size: { $bsonSize: "$$ROOT" },
            expenses: { $size: { $ifNull: ["$expenses", []] } },
            settlements: { $size: { $ifNull: ["$settlements", []] } },
            exchanges: { $size: { $ifNull: ["$exchanges", []] } },
            legacy: { $size: { $ifNull: ["$recurring_expenses", []] } },
          },
        },
      ])
      .toArray();
    summarise(
      "groups",
      rows.map((r) => r.size),
      rows.map((r) => r.expenses),
      "expenses/group",
    );
    const perExpense = rows.filter((r) => r.expenses > 0).map((r) => r.size / r.expenses);
    if (perExpense.length) {
      const avg = perExpense.reduce((a, b) => a + b, 0) / perExpense.length;
      console.log(
        `    ~${(avg / 1024).toFixed(2)} KB per expense  =>  a group would hit the limit at roughly ${Math.floor(LIMIT / avg).toLocaleString()} expenses`,
      );
    }
    console.log(
      `    groups still holding legacy embedded recurring_expenses: ${rows.filter((r) => r.legacy > 0).length}`,
    );
    console.log("");
  }

  // ---- Chat: conversations, with messages in their own collection ----
  if (await has("conversations")) {
    console.log("Chat (messages are their own collection, one document each)");
    const sizes = await db
      .collection("conversations")
      .aggregate([{ $project: { size: { $bsonSize: "$$ROOT" } } }])
      .toArray();
    summarise(
      "conversations",
      sizes.map((r) => r.size),
    );
    if (await has("messages")) {
      const perChat = await db
        .collection("messages")
        .aggregate<{ n: number }>([{ $group: { _id: "$conversationId", n: { $sum: 1 } } }])
        .toArray();
      const total = perChat.reduce((sum, c) => sum + c.n, 0);
      const busiest = perChat.reduce((max, c) => Math.max(max, c.n), 0);
      console.log(`  messages: ${total} in ${perChat.length} conversation(s), busiest has ${busiest}`);
    }
    console.log("");
  }

  // ---- XenBudget: books and items are separate collections already ----
  if (await has("xenbudgetitems")) {
    console.log("XenBudget (items are already a separate collection)");
    const books = await db.collection("xenbudgetbooks").countDocuments();
    const items = await db.collection("xenbudgetitems").countDocuments();
    const perBook = await db
      .collection("xenbudgetitems")
      .aggregate([{ $group: { _id: "$book_id", n: { $sum: 1 } } }])
      .toArray();
    console.log(`  books: ${books}   items: ${items}   busiest book: ${Math.max(0, ...perBook.map((b) => b.n))} items`);
    const bookRows = await db
      .collection("xenbudgetbooks")
      .aggregate([{ $project: { size: { $bsonSize: "$$ROOT" } } }])
      .toArray();
    summarise(
      "book documents",
      bookRows.map((r) => r.size),
    );
    console.log("");
  }

  // ---- Money: how many stored amounts carry float noise (more than 2 decimals)? ----
  console.log("Money amounts with float noise (more than 2 decimal places stored)");
  if (await has("xenbudgetitems")) {
    const total = await db.collection("xenbudgetitems").countDocuments();
    const noisy = await db
      .collection("xenbudgetitems")
      .countDocuments({ $expr: { $ne: [{ $round: ["$amount", 2] }, "$amount"] } });
    console.log(`  XenBudget items: ${noisy} of ${total}`);
  }
  if (await has("xensplits")) {
    const r = await db
      .collection("xensplits")
      .aggregate([
        { $unwind: "$expenses" },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            noisy: { $sum: { $cond: [{ $ne: [{ $round: ["$expenses.amount", 2] }, "$expenses.amount"] }, 1, 0] } },
          },
        },
      ])
      .toArray();
    console.log(`  XenSplit expenses: ${r[0]?.noisy ?? 0} of ${r[0]?.total ?? 0}`);
  }

  // ---- Gem ledger: does every balance match its transactions? ----
  console.log("\nGem ledger (balances vs applied transactions)");
  const { checked, mismatches } = await ledgerMismatches();
  console.log(`  accounts checked: ${checked}, mismatches: ${mismatches.length}`);
  for (const m of mismatches) {
    console.log(
      `    ${m.type} ${m.id}: balance ${m.balance}, ledger says ${m.ledger} (${m.balance - m.ledger > 0 ? "+" : ""}${m.balance - m.ledger})`,
    );
  }

  // ---- What the database holds that the code no longer describes (report only) ----
  console.log("\nUnused data (nothing in the code reads it)");
  const drift = await schemaDrift();
  if (!drift.unmodelled.length && !drift.unknownFields.length && !drift.legacy.length) console.log("  none");
  for (const c of drift.unmodelled)
    console.log(`  collection with no model: ${c.collection} (${c.documents} documents)`);
  for (const f of drift.unknownFields) {
    console.log(`  field no schema defines: ${f.collection}.${f.field} (${f.documents} documents)`);
  }
  for (const l of drift.legacy) console.log(`  ${l.label}: ${l.documents}`);

  // ---- Whole database ----
  const stats = await db.stats();
  console.log(
    `\nWhole database: ${mb(stats.dataSize)} data, ${mb(stats.storageSize)} on disk, ${stats.collections} collections\n`,
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("db-stats failed:", e.message);
  process.exit(1);
});

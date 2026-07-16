/**
 * One-time cleanup: removes the retired `do_not_simplify` field from
 * existing XenSplit expense subdocuments. The app no longer reads or writes
 * this field (see the "Direct" expense option removal) — this just scrubs
 * the stray key left behind on documents written before that change.
 *
 * Safe to run multiple times (no-op once nothing matches).
 *
 * Usage:
 *   tsx scripts/cleanup-do-not-simplify.ts            # dry run — reports what would change
 *   tsx scripts/cleanup-do-not-simplify.ts --apply     # performs the update
 */
require("dotenv").config({ quiet: true });

import mongoose from "mongoose";
const XenSplit = require("../src/server/models/xenSplit");

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  await mongoose.connect(uri);
}

async function main() {
  const apply = process.argv.includes("--apply");

  await connect();

  const matchQuery = { "expenses.do_not_simplify": { $exists: true } };
  const matchedGroups = await XenSplit.countDocuments(matchQuery);

  if (matchedGroups === 0) {
    console.log("No XenSplit groups have a stray do_not_simplify field. Nothing to do.");
    return;
  }

  if (!apply) {
    console.log(`Dry run: ${matchedGroups} group(s) have at least one expense with a do_not_simplify field.`);
    console.log("Re-run with --apply to remove it.");
    return;
  }

  console.log(`Removing do_not_simplify from expenses in ${matchedGroups} group(s)...`);
  const result = await XenSplit.updateMany(matchQuery, { $unset: { "expenses.$[].do_not_simplify": "" } });
  const matched = result.matchedCount ?? result.n;
  const modified = result.modifiedCount ?? result.nModified;
  console.log(`Done: matched ${matched} group(s), modified ${modified}.`);

  const remaining = await XenSplit.countDocuments(matchQuery);
  if (remaining > 0) {
    console.warn(`Warning: ${remaining} group(s) still have a do_not_simplify field after the update.`);
  }
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore - connection may never have opened
    }
    process.exit(1);
  });

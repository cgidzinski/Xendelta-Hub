/**
 * Find stored files no file record names, and delete them (docs/storage.md).
 *
 *   npm run storage:orphans              dry run: lists what would be deleted, changes nothing
 *   npm run storage:orphans -- --delete  deletes them
 *
 * The database and the buckets must belong together (production's database with production's buckets). Pointed at the
 * wrong database, nearly everything looks unused: --delete then refuses when more than a quarter of a bucket would go,
 * unless --force is added after checking the dry run.
 *
 * Reads MONGODB_URI and the R2 settings like the server. Files newer than a day are never touched (an upload may still
 * be in progress). File records whose object is missing are listed, never deleted.
 */
require("dotenv").config({ quiet: true });

import mongoose from "mongoose";
import { byFolder, findOrphans, removeOrphans } from "../src/server/utils/storageOrphans";

/** A bucket losing more than this share of its files at once means the database and buckets don't match. */
const MAX_SHARE = 0.25;

const size = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(2)} GB`
    : n >= 1024 ** 2
      ? `${(n / 1024 ** 2).toFixed(1)} MB`
      : `${(n / 1024).toFixed(1)} KB`;

async function main() {
  const remove = process.argv.includes("--delete");
  const force = process.argv.includes("--force");
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  console.log(
    `\nDatabase: ${mongoose.connection.db!.databaseName}${remove ? "" : "  (dry run: nothing is deleted)"}\n`,
  );

  const report = await findOrphans();
  const parts = [
    ["Private bucket", report.private],
    ["Public bucket", report.public],
  ] as const;
  for (const [label, part] of parts) {
    console.log(`${label}: ${part.total} files, ${part.orphans.length} unused`);
    for (const [folder, { count, bytes }] of Object.entries(byFolder(part.orphans))) {
      console.log(`  ${folder}/: ${count} (${size(bytes)})`);
    }
    for (const o of part.orphans) console.log(`    ${o.key}  ${size(o.size)}`);
  }
  if (report.missing.length) {
    console.log(`\nFile records whose stored file is missing (not changed): ${report.missing.length}`);
    for (const m of report.missing) console.log(`  ${m.id}  ${m.bucket}/${m.key}`);
  }

  const total = report.private.orphans.length + report.public.orphans.length;
  const tooMany = parts.filter(([, part]) => part.total >= 8 && part.orphans.length > part.total * MAX_SHARE);
  if (remove && total > 0 && tooMany.length > 0 && !force) {
    console.log(
      `
Not deleting: ${tooMany.map(([label]) => label.toLowerCase()).join(" and ")} would lose more than a quarter of ` +
        `their files. Check that MONGODB_URI is the database these buckets belong to; add --force if this is right.`,
    );
    process.exitCode = 1;
  } else if (remove && total > 0) {
    const done = await removeOrphans(report);
    console.log(`\nDeleted ${done.objects} files (${size(done.bytes)}).`);
  } else if (total > 0) {
    console.log(`\nRun again with --delete to remove these ${total} files.`);
  } else {
    console.log("\nNothing unused.");
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("storage-orphans failed:", e.message);
  process.exit(1);
});

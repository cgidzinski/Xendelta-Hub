/**
 * Make XenDrive thumbnails for every stored image that doesn't have one yet (docs/storage.md).
 *
 *   npm run storage:thumbs
 *
 * Resumable: each run marks images without a thumbnail as waiting, then works through them in batches. Files that fail
 * keep their original and show an icon, and the next run starts where this one stopped. Reads MONGODB_URI and the R2
 * settings like the server; downloads from R2 are free, and a thumbnail is a few KB.
 */
require("dotenv").config({ quiet: true });

import mongoose from "mongoose";
import { FileRecord } from "../src/server/models/fileRecord";
import { processPendingThumbnails } from "../src/server/utils/xendriveThumbs";

const BATCH = 50;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  console.log(`\nDatabase: ${mongoose.connection.db!.databaseName}\n`);

  // New uploads are already marked pending; older rows predate the field and start at "none".
  const marked = await FileRecord.updateMany(
    { bucket: "private", thumbStatus: "none", mimeType: { $regex: /^image\// } },
    { $set: { thumbStatus: "pending" } },
  );
  console.log(`Images waiting for a thumbnail: ${marked.modifiedCount}`);

  let total = 0;
  for (;;) {
    const done = await processPendingThumbnails(BATCH);
    if (done === 0) break;
    total += done;
    console.log(`  processed ${done} (${total} so far)`);
  }
  console.log(`\nDone: ${total} processed. Files that failed keep their original and show an icon.\n`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error("storage:thumbs failed:", e.message);
  process.exit(1);
});

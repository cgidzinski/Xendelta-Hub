/**
 * Standalone CLI for exporting/importing the whole MongoDB database.
 *
 * Usage:
 *   tsx scripts/db-backup.ts export [outputPath]
 *   tsx scripts/db-backup.ts import <inputPath> [--yes] [--no-snapshot]
 */
require("dotenv").config({ quiet: true });

import fs from "fs";
import path from "path";
import readline from "readline/promises";
import mongoose from "mongoose";
import { streamExport, restoreFromGzipStream, getCollectionStats } from "../src/server/utils/databaseBackup";

const BACKUP_DIR = path.resolve(__dirname, "..", "backups");

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Failed to obtain database handle after connecting");
  }
  return db;
}

async function runExport(outputPathArg?: string) {
  const db = await connect();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const outputPath = outputPathArg ? path.resolve(outputPathArg) : path.join(BACKUP_DIR, `xendelta-hub-backup-${timestamp()}.ndjson.gz`);

  const stats = await getCollectionStats(db);
  console.log(`Exporting ${stats.length} collections to ${outputPath}`);
  for (const stat of stats) {
    console.log(`  ${stat.name}: ${stat.count} documents`);
  }

  await streamExport(db, fs.createWriteStream(outputPath), { exportedBy: "cli" });
  console.log(`\nExport complete: ${outputPath}`);
}

async function confirmRestore(inputPath: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `This will DELETE all data in every collection of the connected database and replace it with the contents of "${inputPath}".\nType "yes" to continue: `
    );
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function runImport(inputPathArg: string | undefined, flags: Set<string>) {
  if (!inputPathArg) {
    throw new Error("Usage: tsx scripts/db-backup.ts import <path-to-backup.gz> [--yes] [--no-snapshot]");
  }
  const inputPath = path.resolve(inputPathArg);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  if (!flags.has("--yes")) {
    const confirmed = await confirmRestore(inputPath);
    if (!confirmed) {
      console.log("Aborted. Database was not modified.");
      return;
    }
  }

  const db = await connect();

  if (!flags.has("--no-snapshot")) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const snapshotPath = path.join(BACKUP_DIR, `pre-import-${timestamp()}.ndjson.gz`);
    console.log(`Writing safety snapshot to ${snapshotPath}...`);
    await streamExport(db, fs.createWriteStream(snapshotPath), { exportedBy: "cli" });
    console.log("Safety snapshot complete.");
  }

  console.log(`Restoring from ${inputPath}...`);
  const summary = await restoreFromGzipStream(db, fs.createReadStream(inputPath));

  console.log("\nRestore complete:");
  for (const s of summary) {
    const errSuffix = s.error ? ` (ERROR: ${s.error})` : "";
    console.log(`  ${s.name}: deleted ${s.deleted}, inserted ${s.inserted}${errSuffix}`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Set(rest.filter((arg) => arg.startsWith("--")));
  const positional = rest.filter((arg) => !arg.startsWith("--"));

  switch (command) {
    case "export":
      await runExport(positional[0]);
      break;
    case "import":
      await runImport(positional[0], flags);
      break;
    default:
      console.log(
        "Usage:\n" +
          "  tsx scripts/db-backup.ts export [outputPath]\n" +
          "  tsx scripts/db-backup.ts import <inputPath> [--yes] [--no-snapshot]"
      );
      process.exit(1);
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

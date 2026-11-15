import { Types } from "mongoose";
import { FileRecord } from "../models/fileRecord";
import { MeterRun } from "../models/meterRun";
import { recordUsage } from "./usage";
import { HOUSE, communityAccount, userAccount } from "./ledger";
import { privateStore } from "../storage";
import { assertCanSpend, type BillableAccount } from "./settlement";
import { payerFor, type Payer } from "../utils/fileRecords";

// The storage meter (#370, docs/billing.md): every day, the bytes each payer's files take up are added to that payer's
// `storage` usage as byte-days, so a month's usage is the sum of its daily sizes. Sizes come from the FileRecords
// (models/fileRecord.ts): the file itself, never its thumbnail or preview (a house cost). The house's own files are left
// to the house-costs discussion (#373).

const METER = "storage";
const DAY_MS = 86_400_000;
const MAX_CATCH_UP_DAYS = 31;

export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const endOfDay = (day: string) => new Date(`${day}T23:59:59.999Z`);

/** Bytes per payer for the files that existed by the end of `day`. House files are left out. */
async function bytesByPayer(day: string, today: string, now: Date) {
  // For today, everything stored now; for a day we missed, what had been created by its end (a file deleted since is
  // gone from the records, so a catch-up can only over-count, never under-count).
  const createdBy = day === today ? now : endOfDay(day);
  return FileRecord.aggregate<{ _id: { type: "user" | "community"; id: string }; bytes: number }>([
    {
      $match: {
        "payer.type": { $in: ["user", "community"] },
        "payer.id": { $exists: true },
        createdAt: { $lte: createdBy },
      },
    },
    { $group: { _id: { type: "$payer.type", id: "$payer.id" }, bytes: { $sum: { $ifNull: ["$size", 0] } } } },
  ]);
}

/**
 * What the house itself stores, for the admin report (#373): the public pictures it pays for (avatars, group pictures, blog
 * images) as `public_assets`, and the database backups as `backups`. Nobody is billed for these; they are recorded so the
 * report can set what they cost beside what the provider charged. Thumbnails are small and aren't counted.
 */
async function meterHouse(day: string, today: string, now: Date, at: Date): Promise<void> {
  const asOf = day === today ? now : endOfDay(day);
  const [row] = await FileRecord.aggregate<{ bytes: number }>([
    { $match: { "payer.type": "house", createdAt: { $lte: asOf } } },
    { $group: { _id: null, bytes: { $sum: { $ifNull: ["$size", 0] } } } },
  ]);
  await recordUsage(HOUSE, "public_assets", row?.bytes ?? 0, at);
  const backups = await privateStore.list("db-backups/").catch(() => []);
  const bytes = backups.filter((o) => !o.lastModified || o.lastModified <= asOf).reduce((n, o) => n + o.size, 0);
  await recordUsage(HOUSE, "backups", bytes, at);
}

/** Meter one day, once. Returns false when it had already been claimed. */
async function meterDay(day: string, today: string, now: Date): Promise<boolean> {
  await MeterRun.init();
  try {
    await MeterRun.create({ meter: METER, day });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false;
    throw e;
  }
  const at = new Date(`${day}T12:00:00.000Z`);
  let accounts = 0;
  let units = 0;
  for (const row of await bytesByPayer(day, today, now)) {
    if (!Types.ObjectId.isValid(row._id.id) || row.bytes <= 0) continue;
    const account = row._id.type === "community" ? communityAccount(row._id.id) : userAccount(row._id.id);
    await recordUsage(account, METER, row.bytes, at); // one day of these bytes: byte-days
    accounts += 1;
    units += row.bytes;
  }
  await meterHouse(day, today, now, at);
  await MeterRun.updateOne({ meter: METER, day }, { $set: { accounts, units, finishedAt: new Date() } });
  return true;
}

/**
 * Meter today, and any day since the last metered one that was missed (the server was down), up to a month back. The
 * first ever run meters today only. A crash after a day is claimed and before it finishes loses that one day's sample
 * (it is never counted twice), which can only under-bill. Hourly job `storage-meter`.
 */
export async function runStorageMeter(now: Date = new Date()): Promise<string[]> {
  const today = dayOf(now);
  const last = await MeterRun.findOne({ meter: METER }).sort({ day: -1 }).lean();
  const days: string[] = [];
  if (last && last.day < today) {
    for (let t = Date.parse(`${last.day}T00:00:00Z`) + DAY_MS; dayOf(new Date(t)) < today; t += DAY_MS) {
      days.push(dayOf(new Date(t)));
    }
  }
  const catchUp = days.slice(-MAX_CATCH_UP_DAYS);
  const done: string[] = [];
  for (const day of [...catchUp, today]) {
    if (await meterDay(day, today, now)) done.push(day);
  }
  return done;
}

/** The billing account behind a payer, or null for the house (never billed). */
const billable = (payer: Payer): BillableAccount | null =>
  payer.type === "community" && payer.id
    ? communityAccount(payer.id)
    : payer.type === "user" && payer.id
      ? userAccount(payer.id)
      : null;

/**
 * Call before storing a file (XenDrive, an app's photo, a chat attachment, an emoji, a Recipaint image): refuses with a 402
 * when whoever pays has used their free allowance and can't cover more.
 */
export async function assertCanStore(userId: string, source?: { app: string; ref: string } | null): Promise<void> {
  const account = billable(await payerFor(userId, source));
  if (account) await assertCanSpend(account);
}

/** The same check for a payer already known (an emoji's community). */
export async function assertPayerCanStore(payer: Payer): Promise<void> {
  const account = billable(payer);
  if (account) await assertCanSpend(account);
}

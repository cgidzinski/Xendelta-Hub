// Gems change value: 1,000 to the dollar instead of 200 (#376). So that nobody's gems gain or lose value, every
// person's balance and every community's fund is multiplied by 5, as one ledger `rescale` transaction from the house
// (for 4× the balance), applied the way billing/ledger.ts applies any transfer. Closed billing statements are scaled
// too. Gem packs, Shop prices and feedback rewards changed in code alongside this.
//
// `up` is repeatable: each account's rescale has a unique key (`rescale-x5:<type>:<id>`), and its balance only moves
// once (the `gemTxApplied: { $ne }` guard). Statements are scaled once, marked with `rescaledX5`.
//
// `down` can't undo it safely: balances may have been spent or topped up since.
import { Types, type Connection } from "mongoose";

const FACTOR = 5;
const REMEMBERED = 200;

async function rescaleAccounts(connection: Connection, type: "user" | "community", collection: string, field: string) {
  const accounts = connection.collection(collection);
  const transactions = connection.collection("gemtransactions");
  const cursor = accounts.find({ [field]: { $gt: 0 } }, { projection: { [field]: 1 } });
  for await (const account of cursor) {
    const key = `rescale-x5:${type}:${account._id}`;
    const now = new Date();
    await transactions.updateOne(
      { idempotencyKey: key },
      {
        $setOnInsert: {
          _id: new Types.ObjectId(),
          from: { type: "house" },
          to: { type, id: account._id },
          amount: account[field] * (FACTOR - 1),
          kind: "rescale",
          status: "pending",
          idempotencyKey: key,
          meta: { factor: FACTOR, before: account[field] },
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    const tx = await transactions.findOne({ idempotencyKey: key });
    if (!tx || tx.status === "applied") continue;
    await accounts.updateOne(
      { _id: account._id, gemTxApplied: { $ne: tx._id } },
      // The driver's types don't know gemTxApplied is an array; the update is the ledger's own debit/credit shape.
      { $inc: { [field]: tx.amount }, $push: { gemTxApplied: { $each: [tx._id], $slice: -REMEMBERED } } } as never,
    );
    await transactions.updateOne({ _id: tx._id }, { $set: { status: "applied", appliedAt: new Date() } });
  }
}

export async function up(connection: Connection): Promise<void> {
  await rescaleAccounts(connection, "user", "users", "gems");
  await rescaleAccounts(connection, "community", "communities", "fund");

  const statements = connection.collection("billingstatements");
  const cursor = statements.find({ rescaledX5: { $ne: true } });
  for await (const s of cursor) {
    const lines = (s.lines ?? []).map((l: { gems?: number; rate?: number }) => ({
      ...l,
      gems: (l.gems ?? 0) * FACTOR,
      rate: (l.rate ?? 0) * FACTOR,
    }));
    await statements.updateOne(
      { _id: s._id, rescaledX5: { $ne: true } },
      {
        $set: {
          lines,
          usageGems: (s.usageGems ?? 0) * FACTOR,
          freeTierGems: (s.freeTierGems ?? 0) * FACTOR,
          freeTierUsed: (s.freeTierUsed ?? 0) * FACTOR,
          amountDue: (s.amountDue ?? 0) * FACTOR,
          paid: (s.paid ?? 0) * FACTOR,
          unpaid: (s.unpaid ?? 0) * FACTOR,
          rescaledX5: true,
        },
      },
    );
  }
}

export async function down(): Promise<void> {
  throw new Error("irreversible: balances may have been spent or topped up since they were multiplied");
}

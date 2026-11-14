// The gem ledger (billing/ledger.ts) starts recording every gem movement. So that each balance can be checked against
// its history (`npm run db:stats`), everyone who already holds gems gets one `opening_balance` transaction for what
// they hold now, from the house. Balances themselves don't change.
//
// `up` is repeatable: the idempotency key `opening:<userId>` is unique, so a person never gets two.
//
// `down` removes the opening transactions again; balances are untouched either way.
import type { Connection } from "mongoose";

export async function up(connection: Connection): Promise<void> {
  const users = connection.collection("users");
  const transactions = connection.collection("gemtransactions");
  const now = new Date();
  const cursor = users.find({ gems: { $gt: 0 } }, { projection: { gems: 1 } });
  for await (const user of cursor) {
    await transactions.updateOne(
      { idempotencyKey: `opening:${user._id}` },
      {
        $setOnInsert: {
          from: { type: "house" },
          to: { type: "user", id: user._id },
          amount: user.gems,
          kind: "opening_balance",
          status: "applied",
          idempotencyKey: `opening:${user._id}`,
          appliedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
  }
}

export async function down(connection: Connection): Promise<void> {
  await connection.collection("gemtransactions").deleteMany({ kind: "opening_balance" });
}

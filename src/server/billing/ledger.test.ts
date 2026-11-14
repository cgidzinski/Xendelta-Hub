import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { startTestApp, createUser, type TestApp } from "../testing/testApp";

// The gem ledger: movements happen exactly once, never overdraw, and an interrupted one is finished by the sweep.

let t: TestApp;
let ledger: typeof import("./ledger");
beforeAll(async () => {
  t = await startTestApp([]);
  ledger = await import("./ledger.js");
  await import("../models/community.js");
}, 180_000);
afterAll(async () => {
  await t?.stop();
}, 60_000);

const User = () => mongoose.model("User") as any;
const Community = () => mongoose.model("Community") as any;
const Tx = () => mongoose.model("GemTransaction") as any;
const gemsOf = async (id: unknown) => (await User().findById(id, "gems").lean()).gems;
const key = () => `test:${new mongoose.Types.ObjectId()}`;

async function newCommunity(fund = 0) {
  return Community().create({ name: "Club", members: [], fund });
}

describe("transfer", () => {
  it("moves gems from a person to a community once, even when retried with the same key", async () => {
    const { user } = await createUser({ gems: 100 });
    const community = await newCommunity();
    const input = {
      from: ledger.userAccount(user._id),
      to: ledger.communityAccount(community._id),
      amount: 30,
      kind: "donation" as const,
      idempotencyKey: key(),
    };
    const first = await ledger.transfer(input);
    const again = await ledger.transfer(input);
    expect(String(again._id)).toBe(String(first._id));
    expect(first.status).toBe("applied");
    expect(await gemsOf(user._id)).toBe(70);
    expect((await Community().findById(community._id).lean()).fund).toBe(30);
  });

  it("refuses to overdraw and changes nothing", async () => {
    const { user } = await createUser({ gems: 10 });
    const k = key();
    await expect(
      ledger.transfer({
        from: ledger.userAccount(user._id),
        to: ledger.HOUSE,
        amount: 11,
        kind: "bill",
        idempotencyKey: k,
      }),
    ).rejects.toMatchObject({ status: 402 });
    expect(await gemsOf(user._id)).toBe(10);
    expect((await Tx().findOne({ idempotencyKey: k }).lean()).status).toBe("failed");
  });

  it("lets the house credit without a balance, and rejects fractions", async () => {
    const { user } = await createUser();
    await ledger.transfer({
      from: ledger.HOUSE,
      to: ledger.userAccount(user._id),
      amount: 5,
      kind: "admin_adjustment",
      idempotencyKey: key(),
    });
    expect(await gemsOf(user._id)).toBe(5);
    await expect(
      ledger.transfer({
        from: ledger.HOUSE,
        to: ledger.userAccount(user._id),
        amount: 1.5,
        kind: "admin_adjustment",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("fails cleanly when an account is missing", async () => {
    const { user } = await createUser({ gems: 50 });
    await expect(
      ledger.transfer({
        from: ledger.userAccount(user._id),
        to: ledger.communityAccount(new mongoose.Types.ObjectId()),
        amount: 5,
        kind: "donation",
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await gemsOf(user._id)).toBe(50);
  });

  it("pushes the debit's extra values in the same write", async () => {
    const { user } = await createUser({ gems: 20 });
    const itemId = new mongoose.Types.ObjectId();
    await ledger.transfer({
      from: ledger.userAccount(user._id),
      to: ledger.HOUSE,
      amount: 20,
      kind: "shop_purchase",
      idempotencyKey: key(),
      debitPush: { inventory: { _id: itemId, itemKey: "golden-badge", used: false } },
    });
    const after = await User().findById(user._id).lean();
    expect(after.gems).toBe(0);
    expect(after.inventory.map((i: any) => String(i._id))).toEqual([String(itemId)]);
  });

  it("never sends the applied-transaction list with a person", async () => {
    const { user } = await createUser({ gems: 5 });
    await ledger.transfer({
      from: ledger.userAccount(user._id),
      to: ledger.HOUSE,
      amount: 1,
      kind: "bill",
      idempotencyKey: key(),
    });
    const loaded = await User().findById(user._id).lean();
    expect(loaded.gemTxApplied).toBeUndefined();
  });
});

describe("reconcilePendingGems", () => {
  it("finishes a transfer that crashed after the debit, without debiting twice", async () => {
    const { user } = await createUser({ gems: 40 });
    const community = await newCommunity();
    // What a crash right after the debit leaves behind: a pending row and a debited balance that remembers it.
    const tx = await Tx().create({
      from: { type: "user", id: user._id },
      to: { type: "community", id: community._id },
      amount: 15,
      kind: "donation",
      idempotencyKey: key(),
      createdAt: new Date(Date.now() - 5 * 60_000),
    });
    await User().updateOne({ _id: user._id }, { $inc: { gems: -15 }, $push: { gemTxApplied: tx._id } });

    const result = await ledger.reconcilePendingGems();
    expect(result.applied).toBeGreaterThanOrEqual(1);
    expect(await gemsOf(user._id)).toBe(25);
    expect((await Community().findById(community._id).lean()).fund).toBe(15);
    expect((await Tx().findById(tx._id).lean()).status).toBe("applied");

    // Running it again changes nothing.
    await ledger.reconcilePendingGems();
    expect(await gemsOf(user._id)).toBe(25);
    expect((await Community().findById(community._id).lean()).fund).toBe(15);
  });

  it("leaves recent pending rows alone (a transfer may still be running)", async () => {
    const { user } = await createUser({ gems: 10 });
    const tx = await Tx().create({
      from: { type: "user", id: user._id },
      to: { type: "house" },
      amount: 3,
      kind: "bill",
      idempotencyKey: key(),
    });
    await ledger.reconcilePendingGems();
    expect((await Tx().findById(tx._id).lean()).status).toBe("pending");
    expect(await gemsOf(user._id)).toBe(10);
  });
});

describe("ledgerMismatches", () => {
  it("flags a balance changed outside the ledger", async () => {
    const { ledgerMismatches } = await import("../utils/dbStats.js");
    const { user } = await createUser();
    await ledger.transfer({
      from: ledger.HOUSE,
      to: ledger.userAccount(user._id),
      amount: 7,
      kind: "admin_adjustment",
      idempotencyKey: key(),
    });
    const ok = await ledgerMismatches(1000);
    expect(ok.mismatches.find((m) => m.id === String(user._id))).toBeUndefined();

    await User().updateOne({ _id: user._id }, { $inc: { gems: 3 } });
    const bad = await ledgerMismatches(1000);
    expect(bad.mismatches.find((m) => m.id === String(user._id))).toMatchObject({ balance: 10, ledger: 7 });
  });
});

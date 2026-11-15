import { Types, type Model } from "mongoose";
import { GemTransaction, type GemTransactionDocument, type GemTransactionKind } from "../models/gemTransaction";
import { User } from "../models/user";
import { Community } from "../models/community";
import { AppError } from "../utils/http";

// The gem ledger: every movement of gems, between a person, a community's fund and the house, is a GemTransaction applied
// here. There are no database transactions (no replica set), so each movement is made crash-safe and retry-safe instead:
//
//   1. insert the row as `pending` under a unique idempotency key (a retry finds the same row);
//   2. debit, then credit, each one guarded update that also records the transaction id on the account
//      (`gemTxApplied: { $ne: txId }`), so neither side can happen twice; the debit also needs the balance;
//   3. mark the row `applied`.
//
// A crash between the steps leaves a `pending` row, which `reconcilePendingGems` (hourly) finishes. The house has no
// balance: it is where bought gems come from and where bills go. docs/billing.md has the whole design.

export type GemAccount = { type: "user"; id: string } | { type: "community"; id: string } | { type: "house" };

export const HOUSE: GemAccount = { type: "house" };
export const userAccount = (id: unknown) => ({ type: "user" as const, id: String(id) });
export const communityAccount = (id: unknown) => ({ type: "community" as const, id: String(id) });

export interface TransferInput {
  from: GemAccount;
  to: GemAccount;
  /** Whole gems, at least 1. */
  amount: number;
  kind: GemTransactionKind;
  /** The same key always means the same movement: a retry returns the first one instead of moving gems again. */
  idempotencyKey: string;
  /** Values pushed onto the paying person's arrays in the debit's own write, e.g. `{ inventory: item }` for a purchase. */
  debitPush?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

/** How many applied transaction ids each account remembers. Only recent ones matter: the sweep runs within the hour. */
const REMEMBERED = 200;

const accountModel = (type: "user" | "community"): Model<any> => (type === "user" ? User : Community) as Model<any>;
const balanceField = (type: "user" | "community") => (type === "user" ? "gems" : "fund");

function storedAccount(account: GemAccount) {
  return account.type === "house" ? { type: "house" } : { type: account.type, id: new Types.ObjectId(account.id) };
}

function accountOf(stored: { type?: string | null; id?: unknown } | null | undefined): GemAccount {
  if (!stored || stored.type === "house") return HOUSE;
  return { type: stored.type as "user" | "community", id: String(stored.id) };
}

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

async function accountExists(account: GemAccount): Promise<boolean> {
  if (account.type === "house") return true;
  if (!Types.ObjectId.isValid(account.id)) return false;
  return !!(await accountModel(account.type).exists({ _id: account.id }));
}

/**
 * Move gems from one account to another, exactly once. Returns the applied transaction. Throws `AppError(402)` when the
 * paying account doesn't have the gems (the row is kept as `failed`, nothing moved), and 404 when an account is missing.
 */
export async function transfer(input: TransferInput): Promise<GemTransactionDocument> {
  const { from, to, amount, kind, idempotencyKey, debitPush, meta } = input;
  if (!Number.isInteger(amount) || amount < 1) throw new AppError(400, "Gem amounts are whole numbers of at least 1");
  if (from.type === "house" && to.type === "house") throw new AppError(400, "The house can't pay itself");
  if (debitPush && from.type !== "user") throw new Error("debitPush is only for a person paying");

  let tx: GemTransactionDocument;
  try {
    tx = await GemTransaction.create({
      from: storedAccount(from),
      to: storedAccount(to),
      amount,
      kind,
      idempotencyKey,
      ...(debitPush ? { debitPush } : {}),
      ...(meta ? { meta } : {}),
    });
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    const existing = await GemTransaction.findOne({ idempotencyKey }).exec();
    if (!existing) throw e;
    tx = existing;
  }

  if (tx.status === "applied") return tx;
  if (tx.status === "failed") throw failure(tx);

  // Checked before any gems move, so a missing account fails cleanly instead of after the debit.
  for (const account of [from, to]) {
    if (!(await accountExists(account))) {
      await markFailed(tx, "account_missing");
      throw new AppError(404, account.type === "community" ? "Community not found" : "User not found");
    }
  }
  return applyTransaction(tx);
}

function failure(tx: GemTransactionDocument): AppError {
  if (tx.failureReason === "account_missing") return new AppError(404, "Account not found");
  return new AppError(402, tx.from?.type === "community" ? "Not enough gems in the fund" : "Not enough gems");
}

async function markFailed(tx: GemTransactionDocument, reason: string) {
  await GemTransaction.updateOne(
    { _id: tx._id, status: "pending" },
    { $set: { status: "failed", failureReason: reason } },
  );
  tx.status = "failed";
  tx.failureReason = reason;
}

/** Make each side of a pending transaction happen (each at most once), then mark it applied. */
async function applyTransaction(tx: GemTransactionDocument): Promise<GemTransactionDocument> {
  const from = accountOf(tx.from);
  const to = accountOf(tx.to);
  const txId = tx._id;
  const remember = { gemTxApplied: { $each: [txId], $slice: -REMEMBERED } };

  if (from.type !== "house") {
    const field = balanceField(from.type);
    const extraPush = (tx.debitPush ?? {}) as Record<string, unknown>;
    const debited = await accountModel(from.type)
      .updateOne(
        { _id: from.id, gemTxApplied: { $ne: txId }, [field]: { $gte: tx.amount } },
        { $inc: { [field]: -tx.amount }, $push: { ...extraPush, ...remember } },
      )
      .exec();
    if (debited.modifiedCount === 0) {
      const alreadyDebited = await accountModel(from.type).exists({ _id: from.id, gemTxApplied: txId });
      if (!alreadyDebited) {
        await markFailed(tx, "insufficient");
        throw failure(tx);
      }
    }
  }

  if (to.type !== "house") {
    const field = balanceField(to.type);
    // No match means it was credited already, or the account was deleted after the check; either way, nothing to redo.
    await accountModel(to.type)
      .updateOne({ _id: to.id, gemTxApplied: { $ne: txId } }, { $inc: { [field]: tx.amount }, $push: remember })
      .exec();
  }

  const appliedAt = new Date();
  await GemTransaction.updateOne({ _id: txId }, { $set: { status: "applied", appliedAt } }).exec();
  tx.status = "applied";
  tx.appliedAt = appliedAt;
  return tx;
}

/**
 * Finish transfers interrupted by a crash or restart: every `pending` row older than a minute is applied (or marked
 * failed when the payer no longer has the gems). Safe to run any time and from several places at once.
 */
export async function reconcilePendingGems(olderThanMs = 60_000): Promise<{ applied: number; failed: number }> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const pending = await GemTransaction.find({ status: "pending", createdAt: { $lt: cutoff } })
    .sort({ createdAt: 1 })
    .limit(1000)
    .exec();
  let applied = 0;
  let failed = 0;
  for (const tx of pending) {
    try {
      await applyTransaction(tx);
      applied++;
    } catch (e) {
      failed++;
      if (!(e instanceof AppError)) console.error(`Gem ledger: could not finish transaction ${tx._id}:`, e);
    }
  }
  return { applied, failed };
}

/** The current balance of an account, in whole gems (the house has none). */
export async function balanceOf(account: GemAccount): Promise<number> {
  if (account.type === "house") return 0;
  const field = balanceField(account.type);
  const doc = await accountModel(account.type).findById(account.id, field).lean<Record<string, number>>().exec();
  return doc?.[field] ?? 0;
}

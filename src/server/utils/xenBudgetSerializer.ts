// Wire shapes for XenBudget. Route handlers never return raw mongoose docs - the same
// convention as xenSplitSerializer.ts - so the client contract stays in one place.

import { serializePiggyBanks } from "./xenBudgetPiggyBanks";

/** Flattens populated User refs into { user_id, username, avatar }. */
export function transformMembers(obj: any): any {
  return {
    ...obj,
    members: Array.isArray(obj.members)
      ? obj.members.map((m: any) =>
        m._id
          ? { user_id: m._id.toString(), username: m.username || "Unknown", avatar: m.avatar || null }
          : { user_id: m.toString(), username: "Unknown", avatar: null }
      )
      : obj.members,
  };
}

/**
 * Book response payload. The book must already be populate("members", "username avatar")-ed.
 * `item_count` is optional because the list view counts items in one batched query rather
 * than per book.
 *
 * `withPiggyBankLedgers` is false for the books list only: a goal's totals are always sent, but
 * shipping every goal's whole contribution history for every book would be a lot of
 * payload for a screen that never draws one.
 */
export function serializeBook(
  book: any, itemCount?: number, reviewCount?: number, needsReviewCount?: number, lastItemAt?: Date,
  withPiggyBankLedgers = true,
): any {
  const obj = typeof book.toObject === "function" ? book.toObject() : book;
  return {
    ...transformMembers(obj),
    _id: obj._id.toString(),
    piggy_banks: serializePiggyBanks(obj.piggy_banks, withPiggyBankLedgers),
    is_creator: undefined,  // filled in per-request by the route; see serializeBookFor
    ...(itemCount === undefined ? {} : { item_count: itemCount }),
    ...(reviewCount === undefined ? {} : { review_count: reviewCount }),
    ...(needsReviewCount === undefined ? {} : { needs_review_count: needsReviewCount }),
    ...(lastItemAt === undefined ? {} : { last_item_at: lastItemAt.toISOString() }),
  };
}

/**
 * Book payload for a specific caller. `is_creator` drives whether the client shows
 * member-management and book-deletion controls; the server still enforces it separately.
 */
export function serializeBookFor(
  book: any, userId: string, itemCount?: number, reviewCount?: number, needsReviewCount?: number, lastItemAt?: Date,
  withPiggyBankLedgers = true,
): any {
  const obj = serializeBook(book, itemCount, reviewCount, needsReviewCount, lastItemAt, withPiggyBankLedgers);
  obj.is_creator = obj.created_by === userId;
  return obj;
}

export function serializeBooksFor(
  books: any[], userId: string, counts?: Map<string, number>, lastItemAt?: Map<string, Date>,
): any[] {
  return books.map((b) => serializeBookFor(
    b, userId, counts?.get(b._id.toString()) ?? 0, undefined, undefined, lastItemAt?.get(b._id.toString()),
    false,
  ));
}

export function serializeItem(item: any, batchLabelById?: Map<string, string>): any {
  const obj = typeof item.toObject === "function" ? item.toObject() : item;
  const batchId = obj.import_batch_id?.toString();
  const sourceLabel = batchLabelById && batchId ? batchLabelById.get(batchId) : undefined;
  return {
    ...obj,
    _id: obj._id.toString(),
    book_id: obj.book_id?.toString(),
    import_batch_id: batchId,
    applied_rule_ids: (obj.applied_rule_ids || []).map((id: any) => id.toString()),
    images: Array.isArray(obj.images)
      ? obj.images.map((img: any) => ({
        _id: img._id?.toString() ?? img._id,
        gcs_path: img.gcs_path,
      }))
      : obj.images,
    ...(sourceLabel ? { source_label: sourceLabel } : {}),
  };
}

export function serializeItems(items: any[], batchLabelById?: Map<string, string>): any[] {
  return items.map((item) => serializeItem(item, batchLabelById));
}

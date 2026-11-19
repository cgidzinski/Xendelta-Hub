import type { Query, Schema } from "mongoose";

// Trash: a deleted note or file is kept for TRASH_DAYS days, hidden from everything, and can be restored until then.
// A schema spreads `softDeleteFields` into its definition and adds the plugin. That gives it `deleted_at` (null = not in the trash; also true of documents saved before
// this existed, since a query for null matches a missing field) and `deleted_by` (who put it there; only they see it
// in their Trash). Every read and update then skips what is in the trash, so lists, search, share links, reminders and
// counts need no change of their own. Reads that must see it (the Trash view, restoring, emptying) opt in with
// `.setOptions({ includeDeleted: true })`. Deletes are not filtered: "delete forever" and deleting a whole notebook
// or folder reach trashed items too.
export const TRASH_DAYS = 30;
export const TRASH_MS = TRASH_DAYS * 86_400_000;

declare module "mongoose" {
  interface QueryOptions {
    /** Include documents that are in the trash. */
    includeDeleted?: boolean;
  }
}

const FILTERED = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "updateOne",
  "updateMany",
  "countDocuments",
  "distinct",
] as const;

/**
 * The two fields, spread into the schema's definition (`...softDeleteFields`) so the schema-inferred type has them.
 * `deleted_at` null = not in the trash; `deleted_by` = who put it there.
 */
export const softDeleteFields = {
  deleted_at: { type: Date, default: null },
  deleted_by: { type: String, default: null },
};

export function softDeletePlugin(schema: Schema): void {
  // The Trash view and the daily purge: only what is in the trash.
  schema.index({ deleted_by: 1, deleted_at: -1 }, { partialFilterExpression: { deleted_at: { $type: "date" } } });
  schema.index({ deleted_at: 1 }, { partialFilterExpression: { deleted_at: { $type: "date" } } });

  schema.pre([...FILTERED], function (this: Query<unknown, unknown>) {
    if (this.getOptions().includeDeleted) return;
    this.where({ deleted_at: null });
  });
  // Aggregations (counts per notebook, per folder, labels) skip the trash too. Put first so the index still applies.
  schema.pre("aggregate", function () {
    this.pipeline().unshift({ $match: { deleted_at: null } });
  });
}

/** The cut-off: items put in the trash before this have been there long enough to go. */
export const trashCutoff = (now = new Date()) => new Date(now.getTime() - TRASH_MS);

/** When an item put in the trash at `deletedAt` is removed for good. */
export const purgeDate = (deletedAt: Date) => new Date(deletedAt.getTime() + TRASH_MS);

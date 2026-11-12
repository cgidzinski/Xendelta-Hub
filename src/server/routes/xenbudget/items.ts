import { Request, Response } from "express";
import { escapeRegex } from "@shared/regex";
import { XenBudgetItem } from "../../models/xenBudget";
import {
  validate,
  validateParams,
  createXenBudgetItemSchema,
  updateXenBudgetItemSchema,
  xenBudgetBookIdParamSchema,
  xenBudgetItemParamSchema,
  xenBudgetItemImageParamSchema,
} from "../../utils/validation";
import { resolveCategories, computeImportHash, roundMoney } from "../../utils/xenBudgetUtils";
import { MAX_XENBUDGET_IMAGES_PER_ITEM } from "../../constants";
import { uploadXenBudgetImages } from "../../config/multer";
import { generateSignedUrl } from "../../utils/gcsUtils";
import { storeAppFiles, removeAppFiles, signedUrlsFor } from "../../utils/appFiles";
import { XENBUDGET_SOURCE, removeItemPhotos } from "../../utils/xenBudgetFiles";
import { applyRules, normalizeFlagNames, withDerivedUncategorised } from "../../utils/xenBudgetRules";
import { merchantMatchPattern } from "../../utils/xenBudgetRecurring";
import { serializeItem, serializeItems } from "../../utils/xenBudgetSerializer";
import { csvLine } from "../../utils/csvWriter";
import { PUBLIC_USER_FIELDS } from "../../utils/publicUser";
import {
  baseItemMatch,
  bookDateToUtc,
  broadcastBook,
  buildRuleShares,
  buildShares,
  callerId,
  draftCategoryWeights,
  draftFromRow,
  loadBookForMember,
  mongoose,
  plainRules,
  resolveBatchLabel,
} from "./shared";

const MAX_ITEMS_PAGE = 200;

// Allow-listed: `sort` is user-controlled and must never be interpolated into a Mongo
// field name directly. `date_desc` is the default and the only mode the client omits.
const ITEM_SORT_MODES: Record<string, { field: "date" | "amount" | "description"; dir: 1 | -1 }> = {
  date_desc: { field: "date", dir: -1 },
  date_asc: { field: "date", dir: 1 },
  amount_asc: { field: "amount", dir: 1 },
  amount_desc: { field: "amount", dir: -1 },
  description_asc: { field: "description", dir: 1 },
  description_desc: { field: "description", dir: -1 },
};

// A case-insensitive collation for a human-expected A-Z order ("Banana" after "apple"),
// matching the collation the description index is built with - a query and its supporting
// index must agree on collation or Mongo silently falls back to an in-memory sort.
const NAME_COLLATION = { locale: "en", strength: 2 };

/**
 * Opaque keyset-pagination cursor, generalized across the three sortable fields. Earlier
 * this was a naive `${date}_${id}` string split on "_", which breaks the moment a
 * `description` value contains an underscore - base64url-encoded JSON has no such
 * delimiter collision.
 */
function encodeItemCursor(field: string, value: unknown, id: string): string {
  return Buffer.from(JSON.stringify({ field, value, id })).toString("base64url");
}

function decodeItemCursor(raw: string): { field: string; value: unknown; id: string } | null {
  try {
    const obj = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!obj || typeof obj.id !== "string" || !mongoose.Types.ObjectId.isValid(obj.id)) return null;
    return obj;
  } catch {
    return null;
  }
}
export function registerItemRoutes(app: any) {
  // --- Items ---------------------------------------------------------------

  // GET /api/xenbudget/books/:bookId/items
  //   ?from&to&categories=a,b&flags=a,b&people=id,id&type&uncategorised&excluded&q&limit&cursor&sort
  app.get(
    "/api/xenbudget/books/:bookId/items",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;

        const q = req.query as Record<string, string>;
        const filter = baseItemMatch(book._id, q);

        // Need/Want is a classification on the category registry, not on the item, so it
        // must be resolved to names first. An item matches when ANY of its categories
        // carries the requested classification.
        if (q.need_want === "need" || q.need_want === "want") {
          const names = (book.categories || []).filter((c: any) => c.need_want === q.need_want).map((c: any) => c.name);
          filter.$and = [...(filter.$and || []), { "categories.name": { $in: names } }];
        }

        if (q.q) filter.description = { $regex: escapeRegex(q.q), $options: "i" };

        // One merchant, as the recurring and merchant analyses group them. Not a plain text
        // search: normalising is lossy ("NETFLIX.COM 8829472" -> "NETFLIX COM"), so the name
        // has to be turned back into a pattern that tolerates the punctuation and reference
        // numbers it dropped. Matched against original_description too, so a rule that
        // renamed the row for readability doesn't hide it from its own merchant.
        if (q.merchant) {
          const pattern = merchantMatchPattern(q.merchant);
          // A name that normalises away to nothing would produce an empty pattern, which
          // matches EVERY row — silently returning the whole book instead of one merchant.
          if (pattern) {
            const rx = { $regex: pattern, $options: "i" };
            filter.$and = [
              ...(filter.$and || []),
              {
                $or: [{ description: rx }, { original_description: rx }],
              },
            ];
          }
        }

        // Filtering by card means "every batch that used this saved mapping", since the
        // batch is what links items back to a preset.
        if (q.card) {
          const batchIds = (book.import_batches || [])
            .filter((b: any) => b.preset_id && b.preset_id.toString() === q.card)
            .map((b: any) => b._id);
          filter.import_batch_id = { $in: batchIds };
        }

        // CSV export of exactly this view.
        //
        // Handled INSIDE the list handler, on the far side of the filter construction above
        // and before pagination, so the export and the list can never be filtered
        // differently — the one property that matters for a file someone hands to somebody
        // else. Exporting from the client would only ever cover the pages it had loaded.
        if (q.format === "csv") {
          await book.populate("members", PUBLIC_USER_FIELDS);
          const usernameById = new Map<string, string>(
            (book.members as any[]).map((m: any) => [m._id.toString(), m.username || "Unknown"]),
          );
          const batchLabels = new Map<string, string>();
          (book.import_batches || []).forEach((b: any) => {
            const label = resolveBatchLabel(b, book);
            if (label) batchLabels.set(b._id.toString(), label);
          });

          const safeName = book.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="xenbudget-${safeName}-items-${new Date().toISOString().slice(0, 10)}.csv"`,
          );

          res.write(
            csvLine([
              "Date",
              "Description",
              "Amount",
              "Type",
              "Currency",
              "Categories",
              "Flags",
              "People",
              "Notes",
              "Source",
              "Card",
            ]),
          );

          // Streamed from a cursor rather than loaded whole, the same way the book export
          // does it: a filtered view can still be tens of thousands of rows, and buffering
          // them all would spike memory per request.
          //
          // Always date order regardless of the on-screen `sort` - a spreadsheet reviewed
          // chronologically is the more useful default, and it isn't worth wiring the sort
          // param through this separate streaming path for a control most people leave at
          // "Newest first".
          const cursor = XenBudgetItem.find(filter).sort({ date: -1, _id: -1 }).lean().cursor();
          for await (const item of cursor as any) {
            res.write(
              csvLine([
                new Date(item.date).toISOString().slice(0, 10),
                item.description || "",
                // Always positive on the row, with `type` carrying the sign — the same
                // convention the schema stores, so a re-import reads back what it wrote.
                item.amount,
                item.type || "expense",
                item.currency || book.default_currency,
                // A weighted category keeps its share, otherwise the row would claim the
                // whole amount landed in each of them.
                (item.categories || [])
                  .map((c: any) =>
                    c.percentage != null && c.percentage < 100 ? `${c.name} (${c.percentage}%)` : c.name,
                  )
                  .join("; "),
                withDerivedUncategorised(item.flags, item.categories).join("; "),
                (item.shares || []).map((s: any) => usernameById.get(s.user_id) || s.user_id).join("; "),
                item.notes || "",
                item.source || "manual",
                (item.import_batch_id && batchLabels.get(item.import_batch_id.toString())) || "",
              ]),
            );
          }
          return res.end();
        }

        // The headline for the filtered list, computed over EVERY matching item rather
        // than the pages loaded so far - a total that grows as you press "Load more" is
        // worse than no total at all. Snapshotted before the cursor narrows the filter
        // below, so page two doesn't come back with a total for page two.
        //
        // Only the first page carries it: the figure is the same for every page of a given
        // filter, and a book fed by CSV imports is exactly the size where re-aggregating
        // the whole thing per "Load more" would be felt.
        const totalsFilter = { ...filter };
        const wantsTotals = !q.cursor;

        const { field: sortField, dir: sortDir } = ITEM_SORT_MODES[q.sort] ?? ITEM_SORT_MODES.date_desc;
        const collation = sortField === "description" ? NAME_COLLATION : undefined;

        // Keyset pagination on the (sortField, _id) sort, so a page boundary can't drop or
        // repeat an item the way a skip/limit offset does when rows are inserted. The cursor
        // is ignored (falls back to page one) if it names a different field than the current
        // sort — a defensive guard against a stale cursor, since `sort` is part of the
        // client's query key and the two should never actually diverge in normal use.
        const cursor = q.cursor ? decodeItemCursor(q.cursor) : null;
        if (cursor && cursor.field === sortField && mongoose.Types.ObjectId.isValid(cursor.id)) {
          const cmp = sortDir === -1 ? "$lt" : "$gt";
          const value = sortField === "date" ? new Date(cursor.value as string) : cursor.value;
          filter.$or = [
            { [sortField]: { [cmp]: value } },
            { [sortField]: value, _id: { [cmp]: new mongoose.Types.ObjectId(cursor.id) } },
          ];
        }

        const limit = Math.min(parseInt(q.limit || "100", 10) || 100, MAX_ITEMS_PAGE);
        let itemsQuery = XenBudgetItem.find(filter).sort({ [sortField]: sortDir, _id: sortDir });
        if (collation) itemsQuery = itemsQuery.collation(collation);
        const [items, totalsRows] = await Promise.all([
          itemsQuery.limit(limit + 1).lean(),
          // Amounts in different currencies can't be added together (the same rule the
          // summary route follows), so the total is per currency and the client shows one
          // line each - which for almost every book is exactly one line.
          wantsTotals
            ? XenBudgetItem.aggregate([
                { $match: totalsFilter },
                {
                  $group: {
                    _id: "$currency",
                    income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
                    expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
                    count: { $sum: 1 },
                  },
                },
                { $sort: { count: -1, _id: 1 } },
              ])
            : [],
        ]);

        const totals = totalsRows.map((row: any) => {
          const income = roundMoney(row.income);
          const expense = roundMoney(row.expense);
          return {
            currency: row._id,
            income,
            expense,
            net: roundMoney(income - expense),
            count: row.count,
          };
        });

        const hasMore = items.length > limit;
        const page = hasMore ? items.slice(0, limit) : items;
        const last = page[page.length - 1];
        const lastSortValue = last
          ? sortField === "date"
            ? new Date(last.date).toISOString()
            : (last as any)[sortField]
          : null;
        const nextCursor = hasMore && last ? encodeItemCursor(sortField, lastSortValue, String(last._id)) : null;

        // Resolve each item's import batch to a card label ("Chase Visa") so the client
        // can show provenance without an extra lookup per item. The label comes from the
        // preset the batch points at, not a denormalized name on the batch itself.
        const batchLabelById = new Map<string, string>();
        (book.import_batches || []).forEach((b: any) => {
          const label = resolveBatchLabel(b, book);
          if (label) batchLabelById.set(b._id.toString(), label);
        });

        res.json({
          status: true,
          message: "Items retrieved",
          data: { items: serializeItems(page, batchLabelById), totals, next_cursor: nextCursor, has_more: hasMore },
        });
      } catch (error) {
        console.error("Error fetching items:", error);
        // A CSV export may already be streaming, in which case the headers are long gone and
        // the only honest signal left is an abrupt end.
        if (res.headersSent) res.end();
        else res.status(500).json({ status: false, message: "Failed to fetch items" });
      }
    },
  );

  // POST /api/xenbudget/books/:bookId/items
  app.post(
    "/api/xenbudget/books/:bookId/items",
    validateParams(xenBudgetBookIdParamSchema),
    validate(createXenBudgetItemSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const userId = callerId(req);
        const body = req.body;

        // Rules run on hand-entered items too, not just imports — otherwise the same
        // transaction would be tagged one way through a CSV and another way by hand.
        // "Skip auto-tagging" leaves the item exactly as it was entered.
        const draft = draftFromRow({ ...body, source: "manual" }, book);
        const {
          item: ruled,
          skipped,
          skippedByRuleName,
        } = body.skip_rules
          ? { item: draft, skipped: false, skippedByRuleName: undefined }
          : applyRules(draft, plainRules(book));
        if (skipped) {
          // A manual add is a deliberate act, so a "skip" rule refuses it by name rather
          // than accepting the item and silently dropping it.
          return res.status(400).json({
            status: false,
            message: `Rule "${skippedByRuleName}" is set to skip items like this. Edit the rule, or change the item.`,
          });
        }

        // A rule that named categories overrides what the form asked for; otherwise the
        // form's own weights are resolved, which is what allows an uneven split.
        const manualCategories =
          ruled.rule_categories.length > 0
            ? draftCategoryWeights(ruled, ruled.amount)
            : resolveCategories(body.category_split_type || "equal", ruled.amount, body.categories || []);

        let shares;
        try {
          // A rule's set_people overrides what the form asked for.
          shares = ruled.people && ruled.people.length > 0 ? buildRuleShares(ruled, book) : buildShares(body, book);
        } catch (e: any) {
          return res.status(400).json({ status: false, message: e.message });
        }

        const amount = ruled.amount;
        // Anchor the picked day as a date-only UTC value.
        const date = bookDateToUtc(ruled.date);
        const item = new XenBudgetItem({
          book_id: book._id,
          type: ruled.type,
          amount,
          currency: body.currency || book.default_currency,
          date,
          description: ruled.description,
          original_description: ruled.original_description || body.description,
          notes: body.notes,
          categories: manualCategories,
          category_split_type:
            ruled.rule_categories.length > 0
              ? (ruled.category_split_type ?? "equal")
              : body.category_split_type || "equal",
          rule_categories: ruled.rule_categories,
          flags: withDerivedUncategorised(ruled.flags, manualCategories),
          rule_flags: ruled.rule_flags,
          applied_rule_ids: ruled.applied_rule_ids,
          share_type: shares.share_type,
          shares: shares.shares,
          source: "manual",
          import_hash: computeImportHash(ruled.date, amount, ruled.description),
          created_by: userId,
        });
        await item.save();
        broadcastBook(book);
        res.json({ status: true, message: "Item added", data: serializeItem(item) });
      } catch (error) {
        console.error("Error creating item:", error);
        res.status(500).json({ status: false, message: "Failed to create item" });
      }
    },
  );

  // PUT /api/xenbudget/books/:bookId/items/:itemId
  app.put(
    "/api/xenbudget/books/:bookId/items/:itemId",
    validateParams(xenBudgetItemParamSchema),
    validate(updateXenBudgetItemSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const item = await XenBudgetItem.findOne({ _id: req.params.itemId, book_id: book._id });
        if (!item) return res.status(404).json({ status: false, message: "Item not found" });

        const body = req.body;
        if (body.type !== undefined) item.type = body.type;
        if (body.amount !== undefined) item.amount = roundMoney(body.amount);
        if (body.currency !== undefined) item.currency = body.currency;
        if (body.date !== undefined) item.date = bookDateToUtc(new Date(body.date));
        if (body.description !== undefined) item.description = body.description;
        if (body.notes !== undefined) item.notes = body.notes;
        if (body.flags !== undefined) {
          item.flags = normalizeFlagNames(body.flags);
          // Provenance has to follow the hand edit. `rule_flags` is what a re-apply sweep
          // strips before running the rules again (stripRuleEffects), so a name left in it
          // after the user removed - or deliberately re-added - that flag is a flag the
          // next sweep silently deletes.
          item.rule_flags = (item.rule_flags || []).filter((f: string) =>
            item.flags.some((n: string) => n.toLowerCase() === f.toLowerCase()),
          );
        }
        if (body.categories !== undefined || body.category_split_type !== undefined || body.amount !== undefined) {
          // Weights have to be recomputed whenever the amount or the split changes, or
          // the per-category rollup stops summing to the item.
          const requested =
            body.categories !== undefined
              ? body.categories
              : item.categories.map((c: any) => ({ name: c.name, amount: c.amount, percentage: c.percentage }));
          item.category_split_type = body.category_split_type || item.category_split_type || "equal";
          item.set("categories", resolveCategories(item.category_split_type, item.amount, requested));
        }
        // Both directions, after the categories are settled: a hand-categorised item is no
        // longer the importer's "nothing matched" case, and one whose last category was
        // just removed is again. Unconditional, so an edit that only touches the flags
        // can't reintroduce the contradiction the form was showing.
        item.flags = withDerivedUncategorised(item.flags, item.categories);

        // Shares have to be recomputed whenever the amount or the split changes, or the
        // per-person totals stop reconciling with the item.
        if (body.shares !== undefined || body.share_type !== undefined || body.amount !== undefined) {
          try {
            const resolved = buildShares(
              {
                amount: item.amount,
                share_type: body.share_type || item.share_type,
                shares:
                  body.shares !== undefined
                    ? body.shares
                    : item.shares.map((s: any) => ({ user_id: s.user_id, amount: s.amount, percentage: s.percentage })),
              },
              book,
            );
            item.set("share_type", resolved.share_type);
            item.set("shares", resolved.shares);
          } catch (e: any) {
            return res.status(400).json({ status: false, message: e.message });
          }
        }

        item.import_hash = computeImportHash(item.date, item.amount, item.description);
        // Marks the item as hand-corrected so a later rules re-apply leaves it alone.
        item.manually_edited = true;
        await item.save();
        broadcastBook(book);
        res.json({ status: true, message: "Item updated", data: serializeItem(item) });
      } catch (error) {
        console.error("Error updating item:", error);
        res.status(500).json({ status: false, message: "Failed to update item" });
      }
    },
  );

  // DELETE /api/xenbudget/books/:bookId/items/:itemId
  app.delete(
    "/api/xenbudget/books/:bookId/items/:itemId",
    validateParams(xenBudgetItemParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const item = await XenBudgetItem.findOneAndDelete({ _id: req.params.itemId, book_id: book._id });
        if (!item) {
          return res.status(404).json({ status: false, message: "Item not found" });
        }
        await removeItemPhotos(item.images ?? []);
        broadcastBook(book);
        res.json({ status: true, message: "Item deleted" });
      } catch (error) {
        console.error("Error deleting item:", error);
        res.status(500).json({ status: false, message: "Failed to delete item" });
      }
    },
  );

  // POST /api/xenbudget/books/:bookId/items/:itemId/images - Upload item images
  app.post(
    "/api/xenbudget/books/:bookId/items/:itemId/images",
    validateParams(xenBudgetItemParamSchema),
    uploadXenBudgetImages.array("images", MAX_XENBUDGET_IMAGES_PER_ITEM),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const item = await XenBudgetItem.findOne({ _id: req.params.itemId, book_id: book._id });
        if (!item) return res.status(404).json({ status: false, message: "Item not found" });

        const files = req.files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) {
          return res.status(400).json({ status: false, message: "No images provided" });
        }

        if (!item.images) item.set("images", []);
        if (item.images.length + files.length > MAX_XENBUDGET_IMAGES_PER_ITEM) {
          return res
            .status(400)
            .json({ status: false, message: `Cannot exceed ${MAX_XENBUDGET_IMAGES_PER_ITEM} images per item` });
        }

        // Stored as XenDrive files owned by the uploader (tagged to this book); all or nothing.
        const userId = callerId(req);
        const stored = await storeAppFiles(
          userId,
          { app: XENBUDGET_SOURCE, ref: req.params.bookId as string },
          files.map((file) => ({ buffer: file.buffer, name: file.originalname, mimeType: file.mimetype })),
        );
        for (const file of stored) item.images.push({ file_id: file._id, uploaded_by: userId });
        try {
          await item.save();
        } catch (error) {
          await removeAppFiles(stored.map((f) => f._id));
          throw error;
        }
        broadcastBook(book);
        res.json({ status: true, message: "Images uploaded", data: serializeItem(item) });
      } catch (error) {
        console.error("Error uploading item images:", error);
        res.status(500).json({ status: false, message: "Failed to upload images" });
      }
    },
  );

  // DELETE /api/xenbudget/books/:bookId/items/:itemId/images/:imageId - Delete an item image
  app.delete(
    "/api/xenbudget/books/:bookId/items/:itemId/images/:imageId",
    validateParams(xenBudgetItemImageParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const item = await XenBudgetItem.findOne({ _id: req.params.itemId, book_id: book._id });
        if (!item) return res.status(404).json({ status: false, message: "Item not found" });

        const imageIndex = (item.images || []).findIndex((img: any) => img._id.toString() === req.params.imageId);
        if (imageIndex === -1) {
          return res.status(404).json({ status: false, message: "Image not found" });
        }

        await removeItemPhotos([item.images[imageIndex]]);
        item.images.splice(imageIndex, 1);
        await item.save();
        broadcastBook(book);
        res.json({ status: true, message: "Image deleted", data: serializeItem(item) });
      } catch (error) {
        console.error("Error deleting item image:", error);
        res.status(500).json({ status: false, message: "Failed to delete image" });
      }
    },
  );

  // GET /api/xenbudget/books/:bookId/items/:itemId/image-urls - Signed URLs for item images
  app.get(
    "/api/xenbudget/books/:bookId/items/:itemId/image-urls",
    validateParams(xenBudgetItemParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const item = await XenBudgetItem.findOne({ _id: req.params.itemId, book_id: book._id });
        if (!item) return res.status(404).json({ status: false, message: "Item not found" });

        if (!item.images || item.images.length === 0) {
          return res.json({ status: true, data: [] });
        }

        const fileUrls = await signedUrlsFor(
          item.images.filter((img: any) => img.file_id).map((img: any) => img.file_id),
          15,
        );
        const signedUrls = (
          await Promise.all(
            item.images.map(async (img: any) => ({
              _id: img._id.toString(),
              // Photos not yet moved to XenDrive still have a storage path.
              signedUrl: img.file_id
                ? fileUrls.get(String(img.file_id))
                : img.gcs_path
                  ? await generateSignedUrl(img.gcs_path, 15)
                  : undefined,
            })),
          )
        ).filter((u): u is { _id: string; signedUrl: string } => !!u.signedUrl);

        res.json({ status: true, data: signedUrls });
      } catch (error) {
        console.error("Error generating signed URLs:", error);
        res.status(500).json({ status: false, message: "Failed to generate image URLs" });
      }
    },
  );
}

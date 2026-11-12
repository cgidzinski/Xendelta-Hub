import { Request, Response } from "express";
import { XenBudgetItem } from "../../models/xenBudget";
import {
  validate,
  validateParams,
  xenBudgetBookIdParamSchema,
  xenBudgetBulkItemsSchema,
  xenBudgetCheckDuplicatesSchema,
  createXenBudgetPresetSchema,
  updateXenBudgetPresetSchema,
  xenBudgetPresetParamSchema,
  xenBudgetBatchParamSchema,
} from "../../utils/validation";
import { computeImportHash, roundMoney } from "../../utils/xenBudgetUtils";
import { FLAG_UNCATEGORISED, FLAG_POSSIBLE_DUPLICATE, FLAG_OFF_BUDGET } from "../../constants";
import { applyRules, withDerivedUncategorised } from "../../utils/xenBudgetRules";

import { serializeBookFor } from "../../utils/xenBudgetSerializer";
import { PUBLIC_USER_FIELDS } from "../../utils/publicUser";
import {
  bookDateToUtc,
  broadcastBook,
  buildRuleShares,
  buildShares,
  callerId,
  draftCategoryWeights,
  draftFromRow,
  isMember,
  loadBookForMember,
  mongoose,
  plainRules,
  resolveBatchLabel,
} from "./shared";

export function registerImportRoutes(app: any) {
  // --- CSV import ----------------------------------------------------------

  // POST /api/xenbudget/books/:bookId/items/check-duplicates
  //
  // Flags rows that look like transactions the book already has. Deliberately advisory:
  // two identical $4 coffees on the same day are both real, so this is never enforced as
  // a constraint — the user decides row by row.
  app.post(
    "/api/xenbudget/books/:bookId/items/check-duplicates",
    validateParams(xenBudgetBookIdParamSchema),
    validate(xenBudgetCheckDuplicatesSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const rows = req.body.items;
        const hashes = rows.map((r: any) => computeImportHash(r.date || new Date(), r.amount, r.description));

        const existing = await XenBudgetItem.find({
          book_id: book._id,
          import_hash: { $in: hashes },
        })
          .select("import_hash description date amount")
          .lean();

        const byHash = new Map<string, any>();
        existing.forEach((e: any) => {
          if (!byHash.has(e.import_hash)) byHash.set(e.import_hash, e);
        });

        res.json({
          status: true,
          message: "Duplicate check complete",
          data: {
            duplicates: rows
              .map((_: any, i: number) => {
                const match = byHash.get(hashes[i]);
                return match
                  ? {
                      index: i,
                      existing: {
                        _id: match._id.toString(),
                        description: match.description,
                        date: match.date,
                        amount: match.amount,
                      },
                    }
                  : null;
              })
              .filter(Boolean),
          },
        });
      } catch (error) {
        console.error("Error checking duplicates:", error);
        res.status(500).json({ status: false, message: "Failed to check duplicates" });
      }
    },
  );

  // POST /api/xenbudget/books/:bookId/items/bulk
  //
  // The CSV import itself. Every row goes through the same rules engine the preview used,
  // so what the user approved is what gets written. Rows a rule skips are counted and
  // named rather than silently dropped.
  app.post(
    "/api/xenbudget/books/:bookId/items/bulk",
    validateParams(xenBudgetBookIdParamSchema),
    validate(xenBudgetBulkItemsSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const userId = callerId(req);
        const rules = plainRules(book);
        // One id for the whole import, so the entire batch can be undone as a unit.
        const batchId = new mongoose.Types.ObjectId();

        // Anyone named must be a member, or the item would carry shares nobody can see.
        const requested: string[] = req.body.default_people || [];
        const invalid = requested.find((id) => !isMember(book, id));
        if (invalid) {
          return res.status(400).json({ status: false, message: "Every owner must be a member of the book" });
        }
        const defaultPeople = requested.length > 0 ? requested : [userId];

        // The batch points at a preset, and the label shown later is resolved from its
        // id — an unknown id would leave the import nameless.
        if (req.body.preset_id && !book.import_presets.id(req.body.preset_id)) {
          return res.status(400).json({ status: false, message: "Unknown mapping preset" });
        }

        const docs: any[] = [];
        const skipped: { index: number; rule: string }[] = [];
        const failed: { index: number; reason: string }[] = [];

        // Rows matching something already in the book are marked rather than refused —
        // two identical charges on the same day are both real, and the user already chose
        // to import these. The flag keeps that decision visible after the wizard closes.
        const incomingHashes = req.body.items.map((row: any) =>
          computeImportHash(row.date || new Date(), roundMoney(Number(row.amount) || 0), row.description || ""),
        );
        const seenBefore = new Set<string>(
          (
            await XenBudgetItem.find({ book_id: book._id, import_hash: { $in: incomingHashes } })
              .select("import_hash")
              .lean()
          ).map((r: any) => r.import_hash),
        );

        req.body.items.forEach((row: any, index: number) => {
          const draft = draftFromRow({ ...row, source: "csv" }, book);
          const {
            item: ruled,
            skipped: wasSkipped,
            skippedByRuleName,
          } = req.body.skip_rules
            ? { item: draft, skipped: false, skippedByRuleName: undefined }
            : applyRules(draft, rules);
          if (wasSkipped) {
            skipped.push({ index, rule: skippedByRuleName || "a rule" });
            return;
          }
          let shares;
          try {
            // A rule's set_people wins, then the row's own, then the import's default
            // owners. Falling back to an even split across every member - what an empty
            // list would do - is rarely right for a personal card statement.
            if (ruled.people && ruled.people.length > 0) {
              shares = buildRuleShares(ruled, book);
            } else {
              const people = (row.people && row.people.length > 0 && row.people) || defaultPeople;
              shares = buildShares(
                { amount: ruled.amount, share_type: "equal", shares: people.map((u: string) => ({ user_id: u })) },
                book,
              );
            }
          } catch (e: any) {
            failed.push({ index, reason: e.message });
            return;
          }
          // Applied by the importer, not by a rule, so these go into `flags` and NOT into
          // `rule_flags`: a later re-apply sweep must not strip a marker that was true at
          // import time. "Uncategorised" is the exception and goes through the shared
          // helper - it is derived state, and a sweep SHOULD take it off once a rule
          // finally categorises the row.
          const importFlags = withDerivedUncategorised(ruled.flags, ruled.categories);
          if (seenBefore.has(incomingHashes[index]) && !importFlags.includes(FLAG_POSSIBLE_DUPLICATE)) {
            importFlags.push(FLAG_POSSIBLE_DUPLICATE);
          }

          docs.push({
            book_id: book._id,
            type: ruled.type,
            amount: ruled.amount,
            currency: row.currency || book.default_currency,
            date: bookDateToUtc(ruled.date),
            description: ruled.description,
            original_description: ruled.original_description || row.description,
            notes: ruled.notes,
            categories: draftCategoryWeights(ruled, ruled.amount),
            category_split_type: ruled.category_split_type ?? "equal",
            rule_categories: ruled.rule_categories,
            flags: importFlags,
            rule_flags: ruled.rule_flags,
            applied_rule_ids: ruled.applied_rule_ids,
            share_type: shares.share_type,
            shares: shares.shares,
            source: "csv",
            import_batch_id: batchId,
            import_hash: computeImportHash(ruled.date, ruled.amount, ruled.description),
            created_by: userId,
          });
        });

        if (docs.length > 0) {
          await XenBudgetItem.insertMany(docs);
          // Recorded only when something was actually written - an import that produced
          // nothing shouldn't leave a row in the history to puzzle over later.
          book.import_batches.push({
            _id: batchId,
            filename: req.body.filename,
            imported_by: userId,
            row_count: docs.length,
            preset_id: req.body.preset_id,
          });
          await book.save();
        }
        broadcastBook(book);

        res.json({
          status: true,
          message: `Imported ${docs.length} item${docs.length === 1 ? "" : "s"}`,
          data: {
            batch_id: batchId.toString(),
            created: docs.length,
            off_budget: docs.filter((d) => d.flags.includes(FLAG_OFF_BUDGET)).length,
            uncategorised: docs.filter((d) => d.flags.includes(FLAG_UNCATEGORISED)).length,
            duplicates: docs.filter((d) => d.flags.includes(FLAG_POSSIBLE_DUPLICATE)).length,
            skipped,
            failed,
          },
        });
      } catch (error) {
        console.error("Error importing items:", error);
        res.status(500).json({ status: false, message: "Failed to import items" });
      }
    },
  );

  // GET /api/xenbudget/books/:bookId/imports - what has been imported, newest first
  app.get(
    "/api/xenbudget/books/:bookId/imports",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        await book.populate("members", PUBLIC_USER_FIELDS);

        // A live count rather than the recorded row_count: items may have been deleted
        // individually since, and a history that overstates what is still there would
        // make "delete this import" look more destructive than it is.
        const counts = new Map<string, number>();
        const rows = await XenBudgetItem.aggregate([
          { $match: { book_id: book._id, import_batch_id: { $ne: null } } },
          { $group: { _id: "$import_batch_id", count: { $sum: 1 } } },
        ]);
        rows.forEach((r: any) => counts.set(r._id.toString(), r.count));

        const memberById = new Map<string, any>();
        (book.members as any[]).forEach((m: any) => {
          if (m._id) memberById.set(m._id.toString(), m);
        });

        const batches = [...book.import_batches]
          .sort((a: any, b: any) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime())
          .map((b: any) => ({
            _id: b._id.toString(),
            source_label: resolveBatchLabel(b, book) ?? "Import",
            filename: b.filename,
            imported_at: b.imported_at,
            imported_by: b.imported_by,
            imported_by_name: memberById.get(b.imported_by)?.username || "Unknown",
            row_count: b.row_count,
            remaining: counts.get(b._id.toString()) || 0,
          }));

        res.json({ status: true, message: "Imports retrieved", data: { imports: batches } });
      } catch (error) {
        console.error("Error listing imports:", error);
        res.status(500).json({ status: false, message: "Failed to list imports" });
      }
    },
  );

  // DELETE /api/xenbudget/books/:bookId/imports/:batchId - undo one import wholesale
  app.delete(
    "/api/xenbudget/books/:bookId/imports/:batchId",
    validateParams(xenBudgetBatchParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const batchId = new mongoose.Types.ObjectId(req.params.batchId);
        const result = await XenBudgetItem.deleteMany({ book_id: book._id, import_batch_id: batchId });
        if (book.import_batches.id(batchId)) {
          book.import_batches.pull({ _id: batchId });
          await book.save();
        }
        broadcastBook(book);
        res.json({
          status: true,
          message: `Removed ${result.deletedCount} imported item${result.deletedCount === 1 ? "" : "s"}`,
          data: { deleted: result.deletedCount },
        });
      } catch (error) {
        console.error("Error undoing import:", error);
        res.status(500).json({ status: false, message: "Failed to undo import" });
      }
    },
  );

  // --- Import presets ------------------------------------------------------

  app.post(
    "/api/xenbudget/books/:bookId/import-presets",
    validateParams(xenBudgetBookIdParamSchema),
    validate(createXenBudgetPresetSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const preset = book.import_presets.create(req.body);
        book.import_presets.push(preset);
        await book.save();
        await book.populate("members", PUBLIC_USER_FIELDS);
        broadcastBook(book);
        res.json({
          status: true,
          message: "Preset saved",
          preset_id: preset._id.toString(),
          data: serializeBookFor(book, callerId(req)),
        });
      } catch (error) {
        console.error("Error saving preset:", error);
        res.status(500).json({ status: false, message: "Failed to save preset" });
      }
    },
  );

  app.put(
    "/api/xenbudget/books/:bookId/import-presets/:presetId",
    validateParams(xenBudgetPresetParamSchema),
    validate(updateXenBudgetPresetSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const preset = book.import_presets.id(req.params.presetId);
        if (!preset) return res.status(404).json({ status: false, message: "Preset not found" });
        Object.assign(preset, req.body);
        await book.save();
        await book.populate("members", PUBLIC_USER_FIELDS);
        broadcastBook(book);
        res.json({ status: true, message: "Preset updated", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error updating preset:", error);
        res.status(500).json({ status: false, message: "Failed to update preset" });
      }
    },
  );

  app.delete(
    "/api/xenbudget/books/:bookId/import-presets/:presetId",
    validateParams(xenBudgetPresetParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const preset = book.import_presets.id(req.params.presetId);
        if (!preset) return res.status(404).json({ status: false, message: "Preset not found" });
        book.import_presets.pull({ _id: preset._id });
        await book.save();
        await book.populate("members", PUBLIC_USER_FIELDS);
        broadcastBook(book);
        res.json({ status: true, message: "Preset deleted", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error deleting preset:", error);
        res.status(500).json({ status: false, message: "Failed to delete preset" });
      }
    },
  );
}

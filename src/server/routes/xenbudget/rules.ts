import { Request, Response } from "express";
import { XenBudgetItem } from "../../models/xenBudget";
import {
  validate,
  validateParams,
  xenBudgetBookIdParamSchema,
  createXenBudgetRuleSchema,
  updateXenBudgetRuleSchema,
  xenBudgetRuleParamSchema,
  reapplyXenBudgetRulesSchema,
} from "../../utils/validation";

import { FLAG_OFF_BUDGET } from "../../constants";
import {
  applyRules,
  ruleMatches,
  stripRuleEffects,
  withDerivedUncategorised,
  type DraftItem,
  type Rule,
} from "../../utils/xenBudgetRules";

import { serializeBookFor } from "../../utils/xenBudgetSerializer";
import {
  broadcastBook,
  buildRuleShares,
  callerId,
  draftCategoryWeights,
  draftFromRow,
  isMember,
  loadBookForMember,
  plainRules,
  toDraft,
} from "./shared";

// One import request's worth of rows. Bank exports are far smaller than this; the cap
// exists so a malformed or hostile request can't ask the server to build an unbounded
// number of documents in memory.
const MAX_BULK_ROWS = 2000;

// A rule that attributes items to someone who isn't in the book would silently produce
// shares nobody can see, so the pairing is checked when the rule is saved.
function validateRulePeople(body: any, book: any): string | null {
  const people: string[] = body?.actions?.set_people || [];
  for (const id of people) {
    if (!isMember(book, id)) return "A rule can only attribute items to members of the book";
  }
  for (const w of body?.actions?.set_people_weights || []) {
    if (!isMember(book, w.user_id)) return "A rule can only attribute items to members of the book";
  }
  return null;
}

function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/**
 * What a sweep would change about one item, or null if nothing. Only the rule-derived
 * fields are compared — a sweep never touches amount, date, currency or notes.
 */
function describeChange(item: any, before: DraftItem, after: DraftItem): any | null {
  const changed =
    !sameNames(before.categories, after.categories) ||
    !sameNames(before.flags, after.flags) ||
    before.description !== after.description ||
    before.type !== after.type;
  if (!changed) return null;
  return {
    _id: item._id.toString(),
    description: after.description,
    before: {
      categories: before.categories,
      flags: before.flags,
      description: before.description,
      type: before.type,
    },
    after: {
      categories: after.categories,
      flags: after.flags,
      description: after.description,
      type: after.type,
    },
  };
}
export function registerRuleRoutes(app: any) {
  // --- Rules ---------------------------------------------------------------

  app.post(
    "/api/xenbudget/books/:bookId/rules",
    validateParams(xenBudgetBookIdParamSchema),
    validate(createXenBudgetRuleSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const error = validateRulePeople(req.body, book);
        if (error) return res.status(400).json({ status: false, message: error });
        // New rules land at the end of the chain unless they say otherwise.
        const priority =
          req.body.priority ?? (book.rules.length ? Math.max(...book.rules.map((r: any) => r.priority ?? 0)) + 1 : 0);
        book.rules.push({ ...req.body, priority });
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Rule created", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error creating rule:", error);
        res.status(500).json({ status: false, message: "Failed to create rule" });
      }
    },
  );

  app.put(
    "/api/xenbudget/books/:bookId/rules/:ruleId",
    validateParams(xenBudgetRuleParamSchema),
    validate(updateXenBudgetRuleSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const rule = book.rules.id(req.params.ruleId);
        if (!rule) return res.status(404).json({ status: false, message: "Rule not found" });
        const error = validateRulePeople(req.body, book);
        if (error) return res.status(400).json({ status: false, message: error });
        Object.assign(rule, req.body);
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Rule updated", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error updating rule:", error);
        res.status(500).json({ status: false, message: "Failed to update rule" });
      }
    },
  );

  // POST /api/xenbudget/books/:bookId/rules/preview
  //
  // Shows which existing items a not-yet-saved rule would match, so an edit can be checked
  // against real transactions before committing. Writes nothing.
  app.post(
    "/api/xenbudget/books/:bookId/rules/preview",
    validateParams(xenBudgetBookIdParamSchema),
    validate(createXenBudgetRuleSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const ruleId = typeof req.query.ruleId === "string" ? req.query.ruleId : "";
        const rule: Rule = {
          _id: "preview",
          name: req.body.name || "preview",
          enabled: req.body.enabled !== false,
          priority: 0,
          match: {
            mode: req.body.match?.mode || "all",
            conditions: req.body.match?.conditions || [],
          },
          actions: {},
          stop_on_match: false,
        };

        // Scan a bounded window of the newest items and return at most a handful of
        // matches — a preview is a sanity check, not a full sweep.
        const MATCH_LIMIT = 10;
        const SCAN_LIMIT = 1000;
        const items = await XenBudgetItem.find({ book_id: book._id })
          .sort({ date: -1, _id: -1 })
          .limit(SCAN_LIMIT)
          .lean();

        const matches: any[] = [];
        for (const item of items) {
          if (matches.length >= MATCH_LIMIT) break;
          if (ruleMatches(rule, toDraft(item))) {
            matches.push({
              _id: item._id.toString(),
              description: item.description,
              amount: item.amount,
              currency: item.currency,
              date: item.date,
              type: item.type,
              already_tagged: ruleId
                ? (item.applied_rule_ids || []).some((id: any) => id.toString() === ruleId)
                : false,
            });
          }
        }

        res.json({
          status: true,
          message: "Rule preview ready",
          data: { matches, limit: MATCH_LIMIT, scanned: items.length },
        });
      } catch (error) {
        console.error("Error previewing rule:", error);
        res.status(500).json({ status: false, message: "Failed to preview rule" });
      }
    },
  );

  app.delete(
    "/api/xenbudget/books/:bookId/rules/:ruleId",
    validateParams(xenBudgetRuleParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const rule = book.rules.id(req.params.ruleId);
        if (!rule) return res.status(404).json({ status: false, message: "Rule not found" });
        book.rules.pull({ _id: rule._id });
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        // Deleting a rule doesn't undo what it already did — that takes a re-apply sweep,
        // which the client offers next. Say so rather than implying it's been reversed.
        res.json({
          status: true,
          message: "Rule deleted. Re-apply rules to undo its effects on existing items.",
          data: serializeBookFor(book, callerId(req)),
        });
      } catch (error) {
        console.error("Error deleting rule:", error);
        res.status(500).json({ status: false, message: "Failed to delete rule" });
      }
    },
  );

  // POST /api/xenbudget/books/:bookId/rules/reapply
  //
  // Sweeps the current rule set over existing items. Every item is first stripped of what
  // rules previously did to it and then re-evaluated, so the result is identical to
  // importing it fresh — which is what makes deleting a rule actually reverse its effects.
  app.post(
    "/api/xenbudget/books/:bookId/rules/reapply",
    validateParams(xenBudgetBookIdParamSchema),
    validate(reapplyXenBudgetRulesSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const dryRun = req.body.dry_run === true;
        const includeManual = req.body.include_manually_edited === true;
        const excludeIds = Array.isArray(req.body.exclude_ids) ? req.body.exclude_ids : [];

        const filter: Record<string, any> = { book_id: book._id };
        if (!includeManual) filter.manually_edited = { $ne: true };
        if (excludeIds.length > 0) filter._id = { $nin: excludeIds };

        const items = await XenBudgetItem.find(filter);
        const rules = plainRules(book);
        const changes: any[] = [];

        for (const item of items) {
          const before = toDraft(item);
          // skipBecomesOffBudget: a "skip" rule can't retroactively delete an item that
          // already exists, so on a sweep it becomes "Off budget". Nothing is destroyed.
          const { item: after } = applyRules(stripRuleEffects(before), rules, { skipBecomesOffBudget: true });
          // Before the diff, so the dry run shows the same thing the sweep writes. This is
          // the path that used to leave "Uncategorised" on a row a rule had just
          // categorised: the flag isn't rule-contributed, so stripRuleEffects never took
          // it off, and nothing else here looked at it.
          after.flags = withDerivedUncategorised(after.flags, after.categories);
          const diff = describeChange(item, before, after);
          if (!diff) continue;
          changes.push(diff);
          if (!dryRun) {
            // Rules name categories; the weights (even or percentage) are derived here.
            item.set("categories", draftCategoryWeights(after, item.amount));
            item.category_split_type = after.category_split_type ?? "equal";
            item.rule_categories = after.rule_categories;
            item.flags = after.flags;
            item.rule_flags = after.rule_flags;
            item.set("applied_rule_ids", after.applied_rule_ids);
            item.description = after.description;
            item.original_description = after.original_description;
            item.type = after.type;
            if (after.people && after.people.length > 0) {
              try {
                const resolved = buildRuleShares(after, book);
                item.set("share_type", resolved.share_type);
                item.set("shares", resolved.shares);
              } catch {
                // A rule naming someone who has since left the book shouldn't fail the
                // whole sweep; leave that item's existing shares alone.
              }
            }
            await item.save();
          }
        }

        if (!dryRun && changes.length > 0) broadcastBook(book);
        res.json({
          status: true,
          message: dryRun ? "Preview ready" : "Rules re-applied",
          data: {
            dry_run: dryRun,
            examined: items.length,
            changed: changes.length,
            skipped_manually_edited: includeManual
              ? 0
              : await XenBudgetItem.countDocuments({ book_id: book._id, manually_edited: true }),
            sample: changes.slice(0, 20),
          },
        });
      } catch (error) {
        console.error("Error re-applying rules:", error);
        res.status(500).json({ status: false, message: "Failed to re-apply rules" });
      }
    },
  );

  // POST /api/xenbudget/books/:bookId/items/preview
  //
  // Runs the rule set over candidate rows and writes nothing. The CSV wizard's preview
  // step calls this so what it shows is produced by exactly the same code as the import.
  app.post(
    "/api/xenbudget/books/:bookId/items/preview",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const rows = Array.isArray(req.body?.items) ? req.body.items : [];
        if (rows.length === 0) {
          return res.status(400).json({ status: false, message: "No rows to preview" });
        }
        if (rows.length > MAX_BULK_ROWS) {
          return res.status(400).json({ status: false, message: `At most ${MAX_BULK_ROWS} rows at a time` });
        }

        const rules = plainRules(book);
        const previews = rows.map((row: any, index: number) => {
          const draft = draftFromRow(row, book);
          const result = req.body.skip_rules
            ? { item: draft, skipped: false, skippedByRuleName: undefined }
            : applyRules(draft, rules);
          return {
            index,
            skipped: result.skipped,
            skipped_by: result.skippedByRuleName,
            original: {
              description: draft.description,
              categories: draft.categories,
              type: draft.type,
              amount: draft.amount,
            },
            item: {
              type: result.item.type,
              amount: result.item.amount,
              date: result.item.date,
              description: result.item.description,
              notes: result.item.notes,
              categories: result.item.categories,
              // Derived here too, so the preview shows the flags the import will actually
              // write rather than the draft's own idea of them.
              flags: withDerivedUncategorised(result.item.flags, result.item.categories),
            },
          };
        });

        res.json({
          status: true,
          message: "Preview ready",
          data: {
            previews,
            skipped: previews.filter((p: any) => p.skipped).length,
            off_budget: previews.filter((p: any) => !p.skipped && p.item.flags.includes(FLAG_OFF_BUDGET)).length,
            flagged: previews.filter((p: any) => !p.skipped && p.item.flags.length > 0).length,
          },
        });
      } catch (error) {
        console.error("Error previewing items:", error);
        res.status(500).json({ status: false, message: "Failed to preview items" });
      }
    },
  );
}

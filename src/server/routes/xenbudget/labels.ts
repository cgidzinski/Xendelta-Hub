import { Request, Response } from "express";
import { AppError } from "../../utils/http";
import { XenBudgetItem } from "../../models/xenBudget";
import {
  validate,
  validateParams,
  createXenBudgetLabelSchema,
  updateXenBudgetLabelSchema,
  xenBudgetBookIdParamSchema,
  xenBudgetLabelParamSchema,
} from "../../utils/validation";

import { STARTER_CATEGORIES } from "../../constants";

import { serializeBookFor } from "../../utils/xenBudgetSerializer";
import { broadcastBook, callerId, ensureSystemLabels, loadBookForMember } from "./shared";
import { PUBLIC_USER_FIELDS } from "../../utils/publicUser";

/**
 * The category half of ensureSystemLabels: re-adds any starter category the book is
 * missing. Unlike flags, starter categories carry no special status - they are ordinary
 * categories a book was seeded with on creation, so this only ever ADDS and never
 * rewrites a colour the user has changed (matched case-insensitively).
 *
 * Returns true when it changed something, so the caller knows whether to save.
 */
function ensureStarterCategories(book: any): boolean {
  let changed = false;
  for (const seed of STARTER_CATEGORIES) {
    const existing = (book.categories || []).find((c: any) => c.name.toLowerCase() === seed.name.toLowerCase());
    if (existing) continue;
    book.categories.push({ name: seed.name, color: seed.color });
    changed = true;
  }
  return changed;
}

/**
 * Replaces every occurrence of `from` with `to` (case-insensitively) in a string list.
 * Shared by the rename route, which has to update every name-based reference a label can
 * have — budgets, rules and import presets — so a rename never leaves a dangling name.
 */
function renameInList(list: string[] | undefined, from: string, to: string): void {
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    if ((list[i] || "").toLowerCase() === from.toLowerCase()) list[i] = to;
  }
}

/**
 * Which rules (and, for categories, import presets) still point at a label by name, so
 * deleting it would leave them dangling. Mirrors the budget guard in the delete route:
 * refuse rather than silently change what a rule or a preset does.
 *
 * Categories are referenced by a rule's set_categories / set_category_weights and by an
 * import preset's default_categories; flags by a rule's add_flags / remove_flags. Both
 * are also referenced by rule conditions whose field is "category" or "flags".
 */
function findLabelReferences(book: any, kind: "categories" | "flags", name: string): string[] {
  const lower = name.toLowerCase();
  const blockers: string[] = [];

  for (const rule of book.rules || []) {
    const actions = rule.actions || {};
    const lists: string[][] =
      kind === "categories"
        ? [actions.set_categories || [], (actions.set_category_weights || []).map((w: any) => w.name)]
        : [actions.add_flags || [], actions.remove_flags || []];
    const referencedInActions = lists.some((list) => list.some((n) => (n || "").toLowerCase() === lower));

    const conditionField = kind === "categories" ? "category" : "flags";
    const referencedInConditions = ((rule.match && rule.match.conditions) || []).some(
      (c: any) => c.field === conditionField && (c.value || "").toLowerCase() === lower,
    );

    if (referencedInActions || referencedInConditions) {
      blockers.push(`rule "${rule.name || "unnamed"}"`);
    }
  }

  if (kind === "categories") {
    for (const preset of book.import_presets || []) {
      if ((preset.default_categories || []).some((n: string) => (n || "").toLowerCase() === lower)) {
        blockers.push(`import preset "${preset.name || "unnamed"}"`);
      }
    }
  }

  return blockers;
}

/**
 * CRUD for one of the book's two label registries. Both behave identically apart from
 * what a rename and a delete have to do to the items that reference them, so the routes
 * are generated rather than written twice and left to drift.
 */
function registerLabelRoutes(app: any, kind: "categories" | "flags") {
  const base = `/api/xenbudget/books/:bookId/${kind}`;
  const singular = kind === "categories" ? "Category" : "Flag";

  // Items store a category as a subdocument and a flag as a bare string, so renaming and
  // removing them reach one level apart.
  const renameOnItems = (bookId: any, from: string, to: string) =>
    kind === "categories"
      ? XenBudgetItem.updateMany(
          { book_id: bookId, "categories.name": from },
          { $set: { "categories.$[el].name": to } },
          { arrayFilters: [{ "el.name": from }] },
        )
      : XenBudgetItem.updateMany(
          { book_id: bookId, flags: from },
          { $set: { "flags.$[el]": to } },
          { arrayFilters: [{ el: from }] },
        );

  const removeFromItems = (bookId: any, name: string) =>
    kind === "categories"
      ? // Dropping the entry leaves the item partially uncategorised rather than silently
        // re-weighting money across the categories that remain - which the user never asked
        // for and would quietly change what their reports say.
        XenBudgetItem.updateMany({ book_id: bookId, "categories.name": name }, { $pull: { categories: { name } } })
      : XenBudgetItem.updateMany({ book_id: bookId, flags: name }, { $pull: { flags: name } });

  app.post(
    base,
    validateParams(xenBudgetBookIdParamSchema),
    validate(createXenBudgetLabelSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const name = req.body.name.trim();
      if (book[kind].some((l: any) => l.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError(400, `That ${singular.toLowerCase()} already exists`);
      }
      book[kind].push({
        name,
        color: req.body.color,
        ...(kind === "categories" ? { need_want: req.body.need_want ?? "none" } : {}),
      });
      await book.save();
      await book.populate("members", PUBLIC_USER_FIELDS);
      broadcastBook(book);
      res.json({ status: true, message: `${singular} created`, data: serializeBookFor(book, callerId(req)) });
    },
  );

  app.put(
    `${base}/:labelId`,
    validateParams(xenBudgetLabelParamSchema),
    validate(updateXenBudgetLabelSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const label = book[kind].id(req.params.labelId);
      if (!label) throw new AppError(404, `${singular} not found`);

      const oldName = label.name;
      if (req.body.name !== undefined && req.body.name.trim() !== oldName) {
        // A built-in flag's name is referenced by rules and by the importer, so renaming
        // one would quietly stop them working.
        if (label.system) {
          throw new AppError(
            400,
            `"${oldName}" is built in and can't be renamed — rules and imports refer to it by name. You can change its colour.`,
          );
        }
        const name = req.body.name.trim();
        if (
          book[kind].some(
            (l: any) => l._id.toString() !== label._id.toString() && l.name.toLowerCase() === name.toLowerCase(),
          )
        ) {
          throw new AppError(400, `That ${singular.toLowerCase()} already exists`);
        }
        label.name = name;
      }
      if (req.body.color !== undefined) label.color = req.body.color;
      if (kind === "categories" && req.body.need_want !== undefined) label.need_want = req.body.need_want;
      await book.save();

      if (label.name !== oldName) {
        await renameOnItems(book._id, oldName, label.name);
        // Budgets, rules and import presets reference names too, so they follow the
        // rename rather than being left pointing at something that no longer exists.
        if (kind === "categories") {
          book.budgets.forEach((b: any) => renameInList(b.categories, oldName, label.name));
          book.import_presets.forEach((p: any) => renameInList(p.default_categories, oldName, label.name));
        }
        book.rules.forEach((r: any) => {
          const actions = r.actions || {};
          if (kind === "categories") {
            renameInList(actions.set_categories, oldName, label.name);
            (actions.set_category_weights || []).forEach((w: any) => {
              if ((w.name || "").toLowerCase() === oldName.toLowerCase()) w.name = label.name;
            });
          } else {
            renameInList(actions.add_flags, oldName, label.name);
            renameInList(actions.remove_flags, oldName, label.name);
          }
          // A rule condition names a category or flag in its `value`; without this a
          // "category is Groceries" condition would silently stop matching.
          const conditionField = kind === "categories" ? "category" : "flags";
          ((r.match && r.match.conditions) || []).forEach((c: any) => {
            if (c.field === conditionField && (c.value || "").toLowerCase() === oldName.toLowerCase()) {
              c.value = label.name;
            }
          });
        });
        await book.save();
      }

      await book.populate("members", PUBLIC_USER_FIELDS);
      broadcastBook(book);
      res.json({ status: true, message: `${singular} updated`, data: serializeBookFor(book, callerId(req)) });
    },
  );

  app.delete(`${base}/:labelId`, validateParams(xenBudgetLabelParamSchema), async (req: Request, res: Response) => {
    const book = await loadBookForMember(req);
    const label = book[kind].id(req.params.labelId);
    if (!label) throw new AppError(404, `${singular} not found`);

    if (label.system) {
      throw new AppError(
        400,
        `"${label.name}" is built in and can't be deleted — rules and imports refer to it by name.`,
      );
    }
    if (kind === "categories") {
      // A budget on a category that no longer exists could never match again, so this
      // is refused rather than left quietly broken.
      const budget = book.budgets.find((b: any) => (b.categories || []).includes(label.name));
      if (budget) {
        throw new AppError(400, `"${label.name}" still has a budget on it. Delete that budget first.`);
      }
    }

    // A rule or import preset that still points at this name would be left dangling,
    // so this is refused rather than silently changing what it does.
    const blockers = findLabelReferences(book, kind, label.name);
    if (blockers.length > 0) {
      throw new AppError(
        400,
        `"${label.name}" is still used by ${blockers.join(" and ")}. Update or delete ${blockers.length === 1 ? "it" : "them"} first.`,
      );
    }

    const name = label.name;
    book[kind].pull({ _id: label._id });
    await book.save();
    await removeFromItems(book._id, name);

    await book.populate("members", PUBLIC_USER_FIELDS);
    broadcastBook(book);
    res.json({ status: true, message: `${singular} deleted`, data: serializeBookFor(book, callerId(req)) });
  });
}
export function registerLabelSectionRoutes(app: any) {
  // --- Labels: categories and flags -----------------------------------------
  //
  // Two parallel registries of the same shape. Items reference labels by NAME, so a
  // rename has to carry across every item that used the old one - otherwise those items
  // silently fall out of that label's filters, budgets and reports.

  registerLabelRoutes(app, "categories");
  registerLabelRoutes(app, "flags");

  // GET /api/xenbudget/books/:bookId/categories/counts
  //   How many items currently carry each category, keyed by name — all-time, every item
  //   type. Deliberately not the summary endpoint's by_category count, which is
  //   expense-only and scoped to whatever date window the caller passes; deleting a
  //   category needs the true total regardless of when the items landed.
  app.get(
    "/api/xenbudget/books/:bookId/categories/counts",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const rows = await XenBudgetItem.aggregate([
        { $match: { book_id: book._id } },
        { $unwind: "$categories" },
        { $group: { _id: "$categories.name", count: { $sum: 1 } } },
      ]);
      const counts: Record<string, number> = {};
      rows.forEach((row: any) => {
        counts[row._id] = row.count;
      });
      res.json({ status: true, message: "Category item counts retrieved", data: counts });
    },
  );

  // POST /api/xenbudget/books/:bookId/reseed-labels
  // Re-adds any starter categories and built-in flags the book is missing - e.g. a book
  // created before a later release added more. Additive only: existing names and colours
  // are left untouched, and a category or flag the user deliberately deleted comes back.
  app.post(
    "/api/xenbudget/books/:bookId/reseed-labels",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const categoriesChanged = ensureStarterCategories(book);
      const flagsChanged = ensureSystemLabels(book);
      if (!categoriesChanged && !flagsChanged) {
        await book.populate("members", PUBLIC_USER_FIELDS);
        return res.json({
          status: true,
          message: "Nothing to re-seed — the starter categories and flags are already all there",
          data: serializeBookFor(book, callerId(req)),
        });
      }
      await book.save();
      await book.populate("members", PUBLIC_USER_FIELDS);
      broadcastBook(book);
      res.json({
        status: true,
        message: "Categories and flags re-seeded",
        data: serializeBookFor(book, callerId(req)),
      });
    },
  );
}

import { Request, Response } from "express";
const { XenBudgetBook, XenBudgetItem } = require("../models/xenBudget");
const { User } = require("../models/user");
import { authenticateToken } from "../middleware/auth";
import { SocketManager } from "../infrastructure/SocketManager";
import {
  validate,
  validateParams,
  createXenBudgetBookSchema,
  updateXenBudgetBookSchema,
  addXenBudgetMembersSchema,
  transferXenBudgetBookSchema,
  createXenBudgetItemSchema,
  updateXenBudgetItemSchema,
  createXenBudgetLabelSchema,
  updateXenBudgetLabelSchema,
  createXenBudgetBudgetSchema,
  updateXenBudgetBudgetSchema,
  xenBudgetBookIdParamSchema,
  xenBudgetItemParamSchema,
  xenBudgetMemberParamSchema,
  xenBudgetLabelParamSchema,
  xenBudgetBudgetParamSchema,
  createXenBudgetRuleSchema,
  updateXenBudgetRuleSchema,
  xenBudgetRuleParamSchema,
  reapplyXenBudgetRulesSchema,
  xenBudgetBulkItemsSchema,
  xenBudgetCheckDuplicatesSchema,
  createXenBudgetPresetSchema,
  updateXenBudgetPresetSchema,
  xenBudgetPresetParamSchema,
  xenBudgetBatchParamSchema,
  xenBudgetRestoreSchema,
} from "../utils/validation";
import {
  resolveShares, resolveCategories, computeImportHash, roundMoney, seedPeriods,
  budgetPeriodRange,
} from "../utils/xenBudgetUtils";
import {
  SYSTEM_TAGS, STARTER_CATEGORIES, TAG_UNCATEGORISED, TAG_POSSIBLE_DUPLICATE,
} from "../constants";
import {
  applyRules, stripRuleEffects, type DraftItem, type Rule,
} from "../utils/xenBudgetRules";
import { tzMonthKey, zonedWallToUtc } from "../utils/statsRange";
import { serializeBookFor, serializeBooksFor, serializeItem, serializeItems } from "../utils/xenBudgetSerializer";
import { notify } from "../utils/notificationUtils";
const mongoose = require("mongoose");

const MAX_ITEMS_PAGE = 200;
// One import request's worth of rows. Bank exports are far smaller than this; the cap
// exists so a malformed or hostile request can't ask the server to build an unbounded
// number of documents in memory.
const MAX_BULK_ROWS = 2000;

/**
 * The timezone to bucket this request's tallies in.
 *
 * Books deliberately have no timezone of their own: months follow whoever is looking,
 * resolved client-side from their profile or their browser and sent as ?tz=. An
 * unresolvable value falls back to UTC rather than throwing - a bad zone should not take
 * out the whole summary.
 */
function requestTimezone(q: Record<string, string>): string {
  if (!q.tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: q.tz });
    return q.tz;
  } catch {
    return "UTC";
  }
}

function callerId(req: Request): string {
  return (req.user as any)._id.toString();
}

function memberIds(book: any): string[] {
  return (book.members as any[]).map((m: any) => (m._id ? m._id.toString() : m.toString()));
}

function isMember(book: any, userId: string): boolean {
  return memberIds(book).includes(userId);
}

// XenSplit repeats its 404/403 block in every handler; XenBudget keeps it here so the
// membership rule is stated once. Returns null having ALREADY sent the response.
async function loadBookForMember(req: Request, res: Response): Promise<any | null> {
  const book = await XenBudgetBook.findById(req.params.bookId);
  if (!book) {
    res.status(404).json({ status: false, message: "Book not found" });
    return null;
  }
  if (!isMember(book, callerId(req))) {
    res.status(403).json({ status: false, message: "Not a member of this book" });
    return null;
  }
  return book;
}

// The creator is the book's main admin: only they manage members, transfer, or delete.
// Every other member can do everything else.
async function loadBookForCreator(req: Request, res: Response): Promise<any | null> {
  const book = await loadBookForMember(req, res);
  if (!book) return null;
  if (book.created_by !== callerId(req)) {
    res.status(403).json({ status: false, message: "Only the book owner can do that" });
    return null;
  }
  return book;
}

/**
 * The one place the shared item filters are built. Every list, tally and chart goes
 * through here, so "an excluded item never reaches a total" is stated once rather than
 * repeated in each pipeline — get that wrong in a single place and the per-tag,
 * per-person and top-line numbers silently stop reconciling.
 *
 * `excluded` is tri-state: hidden (default), "true" for only-excluded, "all" for both.
 */
function baseItemMatch(bookId: any, q: Record<string, string>): Record<string, any> {
  const filter: Record<string, any> = { book_id: bookId };

  if (q.from || q.to) {
    filter.date = {};
    if (q.from) filter.date.$gte = new Date(q.from);
    if (q.to) filter.date.$lte = new Date(q.to);
  }
  if (q.categories) filter["categories.name"] = { $in: q.categories.split(",").filter(Boolean) };
  if (q.tags) filter.tags = { $in: q.tags.split(",").filter(Boolean) };
  // "has no category at all" - the worklist an import leaves behind.
  if (q.uncategorised === "true") filter.categories = { $size: 0 };
  if (q.people) filter["shares.user_id"] = { $in: q.people.split(",").filter(Boolean) };
  if (q.type === "expense" || q.type === "income") filter.type = q.type;
  if (q.currency) filter.currency = q.currency;

  if (q.excluded === "true") filter.excluded = true;
  else if (q.excluded !== "all") filter.excluded = { $ne: true };

  return filter;
}

// A budget's target has to exist in this book, or it would silently never match: a
// person who isn't a member has no shares here, and a misspelled tag is on no item.
function validateBudgetTarget(body: any, book: any): string | null {
  if (body.scope === "person" && !isMember(book, body.person_id)) {
    return "That person is not a member of this book";
  }
  return null;
}

function toBudgetFields(body: any): Record<string, any> {
  return {
    scope: body.scope,
    tag: body.scope === "tag" ? body.tag : undefined,
    person_id: body.scope === "person" ? body.person_id : undefined,
    period: body.period,
    amount: roundMoney(body.amount),
    start_date: body.start_date ? new Date(body.start_date) : undefined,
    end_date: body.end_date ? new Date(body.end_date) : undefined,
    active: body.active !== false,
  };
}

// Subdocument _ids from another book would collide on restore, so they're dropped and
// mongoose assigns fresh ones.
function stripIds(list: any[] | undefined): any[] {
  return (list || []).map((entry: any) => {
    const { _id, ...rest } = entry || {};
    return rest;
  });
}

/**
 * Works out who the exported members are on *this* deployment.
 *
 * Matches by user id first (exact when the same users still exist), then by username (so
 * a backup restored elsewhere still finds the right people). Anyone who matches neither
 * is reported rather than silently dropped — their shares are left pointing at the old id
 * so the money still adds up, and the restore says how many people it couldn't place.
 */
async function resolveRestoreMembers(
  exported: { user_id?: string; username?: string }[],
  importerId: string,
): Promise<{ members: any[]; idMap: Map<string, string>; unmatched: string[] }> {
  const idMap = new Map<string, string>();
  const unmatched: string[] = [];
  const members: string[] = [importerId];

  const ids = exported.map((m) => m.user_id).filter((id): id is string =>
    !!id && mongoose.Types.ObjectId.isValid(id));
  const usernames = exported.map((m) => m.username).filter(Boolean) as string[];

  const found = await User.find({
    $or: [
      ...(ids.length ? [{ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }] : []),
      ...(usernames.length ? [{ username: { $in: usernames } }] : []),
    ],
  }).select("_id username").lean();

  const byId = new Map<string, any>();
  const byUsername = new Map<string, any>();
  found.forEach((u: any) => {
    byId.set(u._id.toString(), u);
    if (u.username) byUsername.set(u.username, u);
  });

  for (const entry of exported) {
    const match = (entry.user_id && byId.get(entry.user_id))
      || (entry.username && byUsername.get(entry.username));
    if (!match) {
      unmatched.push(entry.username || entry.user_id || "unknown");
      continue;
    }
    const newId = match._id.toString();
    if (entry.user_id && entry.user_id !== newId) idMap.set(entry.user_id, newId);
    if (!members.includes(newId)) members.push(newId);
  }

  return { members, idMap, unmatched };
}

function remapUser(id: string | undefined, idMap: Map<string, string>): string | undefined {
  if (!id) return id;
  return idMap.get(id) || id;
}

// Only person_id needs remapping: categories and tags travel by name, which is stable
// across deployments in a way an account id is not.
function remapBudgets(budgets: any[], idMap: Map<string, string>): any[] {
  return budgets.map((b: any) => ({ ...b, person_id: remapUser(b.person_id, idMap) }));
}

function remapRules(rules: any[], idMap: Map<string, string>): any[] {
  return rules.map((r: any) => ({
    ...r,
    actions: {
      ...(r.actions || {}),
      set_people: ((r.actions?.set_people) || []).map((id: string) => remapUser(id, idMap)),
    },
  }));
}

/**
 * Writes restored items. In merge mode, anything whose import_hash already exists in the
 * book is skipped, so restoring over live data doesn't double every item.
 */
async function insertRestoredItems(
  book: any,
  items: any[],
  idMap: Map<string, string>,
  userId: string,
  mode: "merge" | "replace",
): Promise<number> {
  if (!items || items.length === 0) return 0;

  let existingHashes = new Set<string>();
  if (mode === "merge") {
    const rows = await XenBudgetItem.find({ book_id: book._id }).select("import_hash").lean();
    existingHashes = new Set(rows.map((r: any) => r.import_hash).filter(Boolean));
  }

  const docs: any[] = [];
  for (const raw of items) {
    const amount = roundMoney(Number(raw.amount) || 0);
    if (!(amount > 0) || !raw.description) continue;
    const date = raw.date ? new Date(raw.date) : new Date();
    const hash = raw.import_hash || computeImportHash(date, amount, raw.description);
    if (mode === "merge" && existingHashes.has(hash)) continue;
    existingHashes.add(hash);

    docs.push({
      book_id: book._id,
      type: raw.type === "income" ? "income" : "expense",
      amount,
      currency: raw.currency || book.default_currency,
      date,
      description: String(raw.description).slice(0, 500),
      original_description: raw.original_description,
      notes: raw.notes,
      // Always re-resolved rather than trusted as stored. A backup that predates
      // weighting carries bare names, and an entry with no amount would sum as undefined
      // in the per-category rollup - wrong in a way nothing would surface.
      categories: resolveCategories(
        raw.category_split_type || "equal",
        amount,
        (Array.isArray(raw.categories) ? raw.categories : [])
          .map((c: any) => (typeof c === "string" ? { name: c } : c))
          .filter((c: any) => c && c.name),
      ),
      category_split_type: raw.category_split_type || "equal",
      rule_categories: Array.isArray(raw.rule_categories) ? raw.rule_categories : [],
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      rule_tags: Array.isArray(raw.rule_tags) ? raw.rule_tags : [],
      share_type: raw.share_type || "equal",
      // Share user ids are remapped where a person resolved to a different account, so
      // per-person totals still attribute to the right people after a restore.
      shares: (raw.shares || []).map((s: any) => ({
        user_id: remapUser(s.user_id, idMap),
        amount: s.amount,
        percentage: s.percentage,
      })),
      excluded: !!raw.excluded,
      excluded_reason: raw.excluded_reason,
      manually_edited: !!raw.manually_edited,
      source: "restore",
      import_hash: hash,
      created_by: raw.created_by || userId,
      created_at: raw.created_at ? new Date(raw.created_at) : new Date(),
    });
  }

  if (docs.length > 0) await XenBudgetItem.insertMany(docs);
  return docs.length;
}

/**
 * Guarantees every book has the built-in tags.
 *
 * The importer and the rules engine reference these by name, so a book without them would
 * silently fail to tag anything. Runs on create, on restore and on the book-fetch path,
 * which makes it self-healing: adding a fifth built-in later needs no migration. It only
 * ever ADDS - a colour the user has changed is never rewritten.
 *
 * Returns true when it changed something, so the caller knows whether to save.
 */
function ensureSystemLabels(book: any): boolean {
  let changed = false;
  for (const seed of SYSTEM_TAGS) {
    const existing = (book.tags || []).find(
      (t: any) => t.name.toLowerCase() === seed.name.toLowerCase(),
    );
    if (existing) {
      // Keep an existing tag's colour; only mark it as built-in if it wasn't.
      if (!existing.system) { existing.system = true; changed = true; }
      continue;
    }
    book.tags.push({ name: seed.name, color: seed.color, system: true });
    changed = true;
  }
  return changed;
}

/**
 * CRUD for one of the book's two label registries. Both behave identically apart from
 * what a rename and a delete have to do to the items that reference them, so the routes
 * are generated rather than written twice and left to drift.
 */
function registerLabelRoutes(app: any, kind: "categories" | "tags") {
  const base = `/api/xenbudget/books/:bookId/${kind}`;
  const singular = kind === "categories" ? "Category" : "Tag";

  // Items store a category as a subdocument and a tag as a bare string, so renaming and
  // removing them reach one level apart.
  const renameOnItems = (bookId: any, from: string, to: string) => (kind === "categories"
    ? XenBudgetItem.updateMany(
      { book_id: bookId, "categories.name": from },
      { $set: { "categories.$[el].name": to } },
      { arrayFilters: [{ "el.name": from }] },
    )
    : XenBudgetItem.updateMany(
      { book_id: bookId, tags: from },
      { $set: { "tags.$[el]": to } },
      { arrayFilters: [{ el: from }] },
    ));

  const removeFromItems = (bookId: any, name: string) => (kind === "categories"
    // Dropping the entry leaves the item partially uncategorised rather than silently
    // re-weighting money across the categories that remain - which the user never asked
    // for and would quietly change what their reports say.
    ? XenBudgetItem.updateMany({ book_id: bookId, "categories.name": name }, { $pull: { categories: { name } } })
    : XenBudgetItem.updateMany({ book_id: bookId, tags: name }, { $pull: { tags: name } }));

  app.post(base,
    validateParams(xenBudgetBookIdParamSchema), validate(createXenBudgetLabelSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const name = req.body.name.trim();
        if (book[kind].some((l: any) => l.name.toLowerCase() === name.toLowerCase())) {
          return res.status(400).json({ status: false, message: `That ${singular.toLowerCase()} already exists` });
        }
        book[kind].push({ name, color: req.body.color });
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: `${singular} created`, data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error(`Error creating ${kind}:`, error);
        res.status(500).json({ status: false, message: `Failed to create ${singular.toLowerCase()}` });
      }
    });

  app.put(`${base}/:labelId`,
    validateParams(xenBudgetLabelParamSchema), validate(updateXenBudgetLabelSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const label = book[kind].id(req.params.labelId);
        if (!label) return res.status(404).json({ status: false, message: `${singular} not found` });

        const oldName = label.name;
        if (req.body.name !== undefined && req.body.name.trim() !== oldName) {
          // A built-in tag's name is referenced by rules and by the importer, so renaming
          // one would quietly stop them working.
          if (label.system) {
            return res.status(400).json({
              status: false,
              message: `"${oldName}" is built in and can't be renamed — rules and imports refer to it by name. You can change its colour.`,
            });
          }
          const name = req.body.name.trim();
          if (book[kind].some((l: any) => l._id.toString() !== label._id.toString()
            && l.name.toLowerCase() === name.toLowerCase())) {
            return res.status(400).json({ status: false, message: `That ${singular.toLowerCase()} already exists` });
          }
          label.name = name;
        }
        if (req.body.color !== undefined) label.color = req.body.color;
        await book.save();

        if (label.name !== oldName) {
          await renameOnItems(book._id, oldName, label.name);
          // Budgets and rules reference categories by name too, so they follow the rename
          // rather than being left pointing at something that no longer exists.
          if (kind === "categories") {
            book.budgets.forEach((b: any) => { if (b.category === oldName) b.category = label.name; });
          }
          book.rules.forEach((r: any) => {
            const list = kind === "categories" ? r.actions?.set_categories : r.actions?.add_tags;
            if (list) {
              for (let i = 0; i < list.length; i++) if (list[i] === oldName) list[i] = label.name;
            }
          });
          await book.save();
        }

        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: `${singular} updated`, data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error(`Error updating ${kind}:`, error);
        res.status(500).json({ status: false, message: `Failed to update ${singular.toLowerCase()}` });
      }
    });

  app.delete(`${base}/:labelId`,
    validateParams(xenBudgetLabelParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const label = book[kind].id(req.params.labelId);
        if (!label) return res.status(404).json({ status: false, message: `${singular} not found` });

        if (label.system) {
          return res.status(400).json({
            status: false,
            message: `"${label.name}" is built in and can't be deleted — rules and imports refer to it by name.`,
          });
        }
        if (kind === "categories") {
          // A budget on a category that no longer exists could never match again, so this
          // is refused rather than left quietly broken.
          const budget = book.budgets.find((b: any) => b.scope === "category" && b.category === label.name);
          if (budget) {
            return res.status(400).json({
              status: false,
              message: `"${label.name}" still has a budget on it. Delete that budget first.`,
            });
          }
        }

        const name = label.name;
        book[kind].pull({ _id: label._id });
        await book.save();
        await removeFromItems(book._id, name);

        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: `${singular} deleted`, data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error(`Error deleting ${kind}:`, error);
        res.status(500).json({ status: false, message: `Failed to delete ${singular.toLowerCase()}` });
      }
    });
}

/**
 * Turns the names a rule or an import produced into stored weights, split evenly. A
 * caller that wants an uneven split (the item form) resolves its own and passes them in.
 */
function evenCategoryWeights(names: string[], amount: number) {
  return resolveCategories("equal", amount, (names || []).map((name) => ({ name })));
}

function broadcastBook(book: any) {
  SocketManager.getInstance().notifyXenBudgetBookUpdate(book._id.toString(), memberIds(book));
}

// Builds the stored shares for an item, defaulting to an even split across everyone in
// the book when the caller doesn't name anyone. Throws a plain Error for a bad request so
// callers can turn it into a 400.
function buildShares(body: any, book: any): { share_type: string; shares: any[] } {
  const shareType = body.share_type || "equal";
  const requested = body.shares || [];
  const bookMembers = memberIds(book);

  for (const s of requested) {
    if (!bookMembers.includes(s.user_id)) {
      throw new Error("Every person on an item must be a member of the book");
    }
  }
  if (shareType === "exact" || shareType === "percent") {
    if (requested.length === 0) throw new Error(`A ${shareType} split needs at least one person`);
  }
  return {
    share_type: shareType,
    shares: resolveShares(shareType, roundMoney(body.amount), requested, bookMembers),
  };
}

// A rule that attributes items to someone who isn't in the book would silently produce
// shares nobody can see, so the pairing is checked when the rule is saved.
function validateRulePeople(body: any, book: any): string | null {
  const people: string[] = body?.actions?.set_people || [];
  for (const id of people) {
    if (!isMember(book, id)) return "A rule can only attribute items to members of the book";
  }
  return null;
}

/** The book's rules as plain objects the (pure) engine can work with. */
function plainRules(book: any): Rule[] {
  return (book.rules || []).map((r: any) => ({
    _id: r._id.toString(),
    name: r.name,
    enabled: r.enabled,
    priority: r.priority,
    match: {
      mode: r.match?.mode,
      conditions: (r.match?.conditions || []).map((c: any) => ({
        field: c.field, op: c.op, value: c.value, value2: c.value2, case_sensitive: c.case_sensitive,
      })),
    },
    actions: {
      set_categories: r.actions?.set_categories || [],
      add_tags: r.actions?.add_tags || [],
      remove_tags: r.actions?.remove_tags || [],
      set_type: r.actions?.set_type ?? null,
      set_people: r.actions?.set_people || [],
      set_description: r.actions?.set_description,
      disposition: r.actions?.disposition,
    },
    stop_on_match: r.stop_on_match,
  }));
}

/** A stored item as the engine sees it. */
function toDraft(item: any): DraftItem {
  return {
    type: item.type,
    amount: item.amount,
    date: item.date,
    description: item.description,
    original_description: item.original_description,
    categories: (item.categories || []).map((c: any) => c.name),
    tags: [...(item.tags || [])],
    excluded: !!item.excluded,
    excluded_reason: item.excluded_reason,
    applied_rule_ids: (item.applied_rule_ids || []).map((id: any) => id.toString()),
    rule_categories: [...(item.rule_categories || [])],
    rule_tags: [...(item.rule_tags || [])],
    source: item.source,
  };
}

/** A candidate row (a mapped CSV line, or a manual add) as the engine sees it. */
function draftFromRow(row: any, book: any): DraftItem {
  return {
    type: row.type === "income" ? "income" : "expense",
    amount: roundMoney(Number(row.amount) || 0),
    date: row.date ? new Date(row.date) : new Date(),
    description: String(row.description || "").slice(0, 500),
    categories: Array.isArray(row.categories) ? [...row.categories] : [],
    tags: Array.isArray(row.tags) ? [...row.tags] : [],
    excluded: false,
    applied_rule_ids: [],
    rule_categories: [],
    rule_tags: [],
    source: row.source || "csv",
  };
}

function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/**
 * What a sweep would change about one item, or null if nothing. Only the rule-derived
 * fields are compared — a sweep never touches amount, date, currency or notes.
 */
function describeChange(item: any, before: DraftItem, after: DraftItem): any | null {
  const changed = !sameNames(before.categories, after.categories)
    || !sameNames(before.tags, after.tags)
    || before.excluded !== after.excluded
    || before.description !== after.description
    || before.type !== after.type;
  if (!changed) return null;
  return {
    _id: item._id.toString(),
    description: after.description,
    before: {
      categories: before.categories, tags: before.tags, excluded: before.excluded,
      description: before.description, type: before.type,
    },
    after: {
      categories: after.categories, tags: after.tags, excluded: after.excluded,
      description: after.description, type: after.type,
    },
  };
}

module.exports = function (app: any) {
  // Auth for every XenBudget route
  app.use("/api/xenbudget", authenticateToken);

  // --- Books ---------------------------------------------------------------

  // GET /api/xenbudget/books - books the caller is a member of
  app.get("/api/xenbudget/books", async (req: Request, res: Response) => {
    try {
      const userId = callerId(req);
      const books = await XenBudgetBook.find({ members: userId })
        .populate("members", "username avatar")
        .sort({ created_at: -1 });

      // One grouped count for the whole list rather than a query per book.
      const counts = new Map<string, number>();
      if (books.length > 0) {
        const rows = await XenBudgetItem.aggregate([
          { $match: { book_id: { $in: books.map((b: any) => b._id) }, excluded: { $ne: true } } },
          { $group: { _id: "$book_id", count: { $sum: 1 } } },
        ]);
        rows.forEach((r: any) => counts.set(r._id.toString(), r.count));
      }

      res.json({
        status: true,
        message: "Books retrieved",
        data: serializeBooksFor(books, userId, counts),
      });
    } catch (error) {
      console.error("Error fetching books:", error);
      res.status(500).json({ status: false, message: "Failed to fetch books" });
    }
  });

  // POST /api/xenbudget/books
  app.post("/api/xenbudget/books", validate(createXenBudgetBookSchema), async (req: Request, res: Response) => {
    try {
      const userId = callerId(req);
      const { name, memberIds: requestedMemberIds, default_currency } = req.body;

      const members: string[] = [userId];
      if (requestedMemberIds && requestedMemberIds.length > 0) {
        const objectIds = requestedMemberIds.map((id: string) => new mongoose.Types.ObjectId(id));
        const users = await User.find({ _id: { $in: objectIds } }).select("_id").lean();
        for (const u of users) {
          const uid = (u._id as any).toString();
          if (!members.includes(uid)) members.push(uid);
        }
      }

      const book = new XenBudgetBook({
        name,
        default_currency: default_currency || "CAD",
        created_by: userId,
        members,
        // Starter categories so budgets and imports have something to work with on day
        // one; they carry no special status and can be renamed or deleted freely.
        categories: STARTER_CATEGORIES.map((c) => ({ ...c })),
      });
      ensureSystemLabels(book);
      await book.save();
      await book.populate("members", "username avatar");

      SocketManager.getInstance().notifyXenBudgetBooksUpdated(members);
      for (const uid of members) {
        if (uid === userId) continue;
        notify(uid, "Added to a budget book", `You were added to "${book.name}"`,
          `/internal/xenbudget/books/${book._id}/overview`, "account_balance_wallet");
      }

      res.json({ status: true, message: "Book created", data: serializeBookFor(book, userId, 0) });
    } catch (error) {
      console.error("Error creating book:", error);
      res.status(500).json({ status: false, message: "Failed to create book" });
    }
  });

  // GET /api/xenbudget/books/:bookId
  app.get("/api/xenbudget/books/:bookId", validateParams(xenBudgetBookIdParamSchema), async (req: Request, res: Response) => {
    try {
      const book = await loadBookForMember(req, res);
      if (!book) return;
      // Self-healing: a book that predates a newly added built-in gets it here rather
      // than needing a migration.
      if (ensureSystemLabels(book)) await book.save();
      await book.populate("members", "username avatar");
      const count = await XenBudgetItem.countDocuments({ book_id: book._id, excluded: { $ne: true } });
      res.json({ status: true, message: "Book retrieved", data: serializeBookFor(book, callerId(req), count) });
    } catch (error) {
      console.error("Error fetching book:", error);
      res.status(500).json({ status: false, message: "Failed to fetch book" });
    }
  });

  // PUT /api/xenbudget/books/:bookId - any member may rename/retime the book
  app.put("/api/xenbudget/books/:bookId",
    validateParams(xenBudgetBookIdParamSchema), validate(updateXenBudgetBookSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const { name, default_currency, archived } = req.body;
        if (name !== undefined) book.name = name;
        if (default_currency !== undefined) book.default_currency = default_currency;
        if (archived !== undefined) book.archived = archived;
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        SocketManager.getInstance().notifyXenBudgetBooksUpdated(memberIds(book));
        res.json({ status: true, message: "Book updated", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error updating book:", error);
        res.status(500).json({ status: false, message: "Failed to update book" });
      }
    });

  // DELETE /api/xenbudget/books/:bookId - owner only; takes the items with it
  app.delete("/api/xenbudget/books/:bookId", validateParams(xenBudgetBookIdParamSchema), async (req: Request, res: Response) => {
    try {
      const book = await loadBookForCreator(req, res);
      if (!book) return;
      const notifyIds = memberIds(book);
      await XenBudgetItem.deleteMany({ book_id: book._id });
      await XenBudgetBook.deleteOne({ _id: book._id });
      SocketManager.getInstance().notifyXenBudgetBooksUpdated(notifyIds);
      res.json({ status: true, message: "Book deleted" });
    } catch (error) {
      console.error("Error deleting book:", error);
      res.status(500).json({ status: false, message: "Failed to delete book" });
    }
  });

  // --- Members -------------------------------------------------------------

  // POST /api/xenbudget/books/:bookId/members - owner only
  app.post("/api/xenbudget/books/:bookId/members",
    validateParams(xenBudgetBookIdParamSchema), validate(addXenBudgetMembersSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForCreator(req, res);
        if (!book) return;
        const existing = memberIds(book);
        const objectIds = req.body.memberIds.map((id: string) => new mongoose.Types.ObjectId(id));
        const users = await User.find({ _id: { $in: objectIds } }).select("_id").lean();

        const added: string[] = [];
        for (const u of users) {
          const uid = (u._id as any).toString();
          if (!existing.includes(uid)) {
            book.members.push(u._id);
            added.push(uid);
          }
        }
        if (added.length === 0) {
          return res.status(400).json({ status: false, message: "Those users are already members" });
        }
        await book.save();
        await book.populate("members", "username avatar");

        SocketManager.getInstance().notifyXenBudgetBooksUpdated(memberIds(book));
        broadcastBook(book);
        for (const uid of added) {
          notify(uid, "Added to a budget book", `You were added to "${book.name}"`,
            `/internal/xenbudget/books/${book._id}/overview`, "account_balance_wallet");
        }
        res.json({ status: true, message: "Members added", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error adding members:", error);
        res.status(500).json({ status: false, message: "Failed to add members" });
      }
    });

  // DELETE /api/xenbudget/books/:bookId/members/:userId - owner removing anyone, or a
  // member leaving. The owner can't leave their own book; they transfer or delete it.
  app.delete("/api/xenbudget/books/:bookId/members/:userId",
    validateParams(xenBudgetMemberParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const userId = callerId(req);
        const target = req.params.userId;

        if (target !== userId && book.created_by !== userId) {
          return res.status(403).json({ status: false, message: "Only the book owner can remove other members" });
        }
        if (target === book.created_by) {
          return res.status(400).json({ status: false, message: "Transfer or delete the book instead of removing its owner" });
        }
        if (!isMember(book, target)) {
          return res.status(404).json({ status: false, message: "That user is not a member" });
        }

        const notifyIds = memberIds(book);
        book.members = book.members.filter((m: any) => m.toString() !== target);
        await book.save();
        await book.populate("members", "username avatar");
        SocketManager.getInstance().notifyXenBudgetBooksUpdated(notifyIds);
        broadcastBook(book);
        res.json({ status: true, message: "Member removed", data: serializeBookFor(book, userId) });
      } catch (error) {
        console.error("Error removing member:", error);
        res.status(500).json({ status: false, message: "Failed to remove member" });
      }
    });

  // POST /api/xenbudget/books/:bookId/transfer - hand the book to another member
  app.post("/api/xenbudget/books/:bookId/transfer",
    validateParams(xenBudgetBookIdParamSchema), validate(transferXenBudgetBookSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForCreator(req, res);
        if (!book) return;
        const target = req.body.userId;
        if (!isMember(book, target)) {
          return res.status(400).json({ status: false, message: "The new owner must already be a member" });
        }
        book.created_by = target;
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        SocketManager.getInstance().notifyXenBudgetBooksUpdated(memberIds(book));
        notify(target, "You now own a budget book", `You were made the owner of "${book.name}"`,
          `/internal/xenbudget/books/${book._id}/overview`, "account_balance_wallet");
        res.json({ status: true, message: "Book transferred", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error transferring book:", error);
        res.status(500).json({ status: false, message: "Failed to transfer book" });
      }
    });

  // --- Labels: categories and tags -----------------------------------------
  //
  // Two parallel registries of the same shape. Items reference labels by NAME, so a
  // rename has to carry across every item that used the old one - otherwise those items
  // silently fall out of that label's filters, budgets and reports.

  registerLabelRoutes(app, "categories");
  registerLabelRoutes(app, "tags");


  // --- Rules ---------------------------------------------------------------

  app.post("/api/xenbudget/books/:bookId/rules",
    validateParams(xenBudgetBookIdParamSchema), validate(createXenBudgetRuleSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const error = validateRulePeople(req.body, book);
        if (error) return res.status(400).json({ status: false, message: error });
        // New rules land at the end of the chain unless they say otherwise.
        const priority = req.body.priority ?? (book.rules.length
          ? Math.max(...book.rules.map((r: any) => r.priority ?? 0)) + 1
          : 0);
        book.rules.push({ ...req.body, priority });
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Rule created", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error creating rule:", error);
        res.status(500).json({ status: false, message: "Failed to create rule" });
      }
    });

  app.put("/api/xenbudget/books/:bookId/rules/:ruleId",
    validateParams(xenBudgetRuleParamSchema), validate(updateXenBudgetRuleSchema),
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
    });

  app.delete("/api/xenbudget/books/:bookId/rules/:ruleId",
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
    });

  // POST /api/xenbudget/books/:bookId/rules/reapply
  //
  // Sweeps the current rule set over existing items. Every item is first stripped of what
  // rules previously did to it and then re-evaluated, so the result is identical to
  // importing it fresh — which is what makes deleting a rule actually reverse its effects.
  app.post("/api/xenbudget/books/:bookId/rules/reapply",
    validateParams(xenBudgetBookIdParamSchema), validate(reapplyXenBudgetRulesSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const dryRun = req.body.dry_run === true;
        const includeManual = req.body.include_manually_edited === true;

        const filter: Record<string, any> = { book_id: book._id };
        if (!includeManual) filter.manually_edited = { $ne: true };

        const items = await XenBudgetItem.find(filter);
        const rules = plainRules(book);
        const changes: any[] = [];

        for (const item of items) {
          const before = toDraft(item);
          // skipBecomesExclude: a "skip" rule can't retroactively delete an item that
          // already exists, so on a sweep it excludes instead. Nothing is destroyed.
          const { item: after } = applyRules(stripRuleEffects(before), rules, { skipBecomesExclude: true });
          const diff = describeChange(item, before, after);
          if (!diff) continue;
          changes.push(diff);
          if (!dryRun) {
            // Rules name categories; the weights are derived here, evenly split.
            item.categories = evenCategoryWeights(after.categories, item.amount);
            item.category_split_type = "equal";
            item.rule_categories = after.rule_categories;
            item.tags = after.tags;
            item.rule_tags = after.rule_tags;
            item.applied_rule_ids = after.applied_rule_ids;
            item.excluded = after.excluded;
            item.excluded_reason = after.excluded_reason;
            item.description = after.description;
            item.original_description = after.original_description;
            item.type = after.type;
            if (after.people && after.people.length > 0) {
              try {
                const resolved = buildShares(
                  { amount: item.amount, share_type: "equal", shares: after.people.map((p) => ({ user_id: p })) },
                  book,
                );
                item.share_type = resolved.share_type;
                item.shares = resolved.shares;
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
    });

  // POST /api/xenbudget/books/:bookId/items/preview
  //
  // Runs the rule set over candidate rows and writes nothing. The CSV wizard's preview
  // step calls this so what it shows is produced by exactly the same code as the import.
  app.post("/api/xenbudget/books/:bookId/items/preview",
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
          const result = applyRules(draft, rules);
          return {
            index,
            skipped: result.skipped,
            skipped_by: result.skippedByRuleName,
            original: {
              description: draft.description, categories: draft.categories,
              type: draft.type, amount: draft.amount,
            },
            item: {
              type: result.item.type,
              amount: result.item.amount,
              date: result.item.date,
              description: result.item.description,
              categories: result.item.categories,
              tags: result.item.tags,
              excluded: result.item.excluded,
              excluded_reason: result.item.excluded_reason,
            },
          };
        });

        res.json({
          status: true,
          message: "Preview ready",
          data: {
            previews,
            skipped: previews.filter((p: any) => p.skipped).length,
            excluded: previews.filter((p: any) => !p.skipped && p.item.excluded).length,
            tagged: previews.filter((p: any) => !p.skipped && p.item.tags.length > 0).length,
          },
        });
      } catch (error) {
        console.error("Error previewing items:", error);
        res.status(500).json({ status: false, message: "Failed to preview items" });
      }
    });

  // --- Backup: export and restore ------------------------------------------
  //
  // Per-book, user-facing backup. scripts/db-backup.ts already does whole-database
  // NDJSON.gz backup/restore, but that is an operator tool that wipes every collection.
  // This is deliberately a different format: plain, inspectable JSON, one book.

  // GET /api/xenbudget/books/:bookId/export
  app.get("/api/xenbudget/books/:bookId/export",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        await book.populate("members", "username avatar");

        const safeName = book.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Content-Disposition",
          `attachment; filename="xenbudget-${safeName}-${new Date().toISOString().slice(0, 10)}.json"`);

        // format_version is carried from day one so a future schema change can migrate an
        // older file rather than reject it.
        res.write('{\n  "format_version": 1,\n');
        res.write(`  "exported_at": ${JSON.stringify(new Date().toISOString())},\n`);
        res.write(`  "book": ${JSON.stringify({
          name: book.name,
          default_currency: book.default_currency,
          categories: book.categories,
          tags: book.tags,
          budgets: book.budgets,
          rules: book.rules,
          import_presets: book.import_presets,
          // Both id and username: the id is exact when the same users still exist, and
          // the username lets a restore re-match people on a different deployment.
          members: (book.members as any[]).map((m: any) => ({
            user_id: m._id ? m._id.toString() : m.toString(),
            username: m.username || undefined,
          })),
        }, null, 2)},\n`);
        res.write('  "items": [');

        // Streamed from a cursor rather than loaded whole: a well-used book is tens of
        // thousands of items, and buffering them all would spike memory per request.
        let first = true;
        const cursor = XenBudgetItem.find({ book_id: book._id }).sort({ date: 1 }).lean().cursor();
        for await (const item of cursor) {
          const { _id, book_id, __v, ...rest } = item as any;
          res.write((first ? "\n    " : ",\n    ") + JSON.stringify(rest));
          first = false;
        }
        res.write("\n  ]\n}\n");
        res.end();
      } catch (error) {
        console.error("Error exporting book:", error);
        // The response may already be streaming, in which case headers are long gone and
        // the only honest signal left is an abrupt end.
        if (res.headersSent) res.end();
        else res.status(500).json({ status: false, message: "Failed to export book" });
      }
    });

  // POST /api/xenbudget/books/import - restore as a NEW book
  app.post("/api/xenbudget/books/import", validate(xenBudgetRestoreSchema),
    async (req: Request, res: Response) => {
      try {
        const userId = callerId(req);
        const payload = req.body;
        const { members, idMap, unmatched } = await resolveRestoreMembers(payload.book.members || [], userId);

        const book = new XenBudgetBook({
          name: payload.book.name,
          default_currency: payload.book.default_currency || "CAD",
          created_by: userId,
          members,
          categories: stripIds(payload.book.categories),
          tags: stripIds(payload.book.tags),
          budgets: remapBudgets(stripIds(payload.book.budgets), idMap),
          rules: remapRules(stripIds(payload.book.rules), idMap),
          import_presets: stripIds(payload.book.import_presets),
        });
        // A restore must still end up with the built-ins, even from an older export.
        ensureSystemLabels(book);
        await book.save();

        const inserted = await insertRestoredItems(book, payload.items, idMap, userId, "merge");
        await book.populate("members", "username avatar");
        SocketManager.getInstance().notifyXenBudgetBooksUpdated(members.map(String));

        res.json({
          status: true,
          message: `Restored ${inserted} item${inserted === 1 ? "" : "s"}`,
          data: { book: serializeBookFor(book, userId, inserted), restored: inserted, unmatched_people: unmatched },
        });
      } catch (error) {
        console.error("Error restoring book:", error);
        res.status(500).json({ status: false, message: "Failed to restore book" });
      }
    });

  // POST /api/xenbudget/books/:bookId/import - restore INTO this book
  app.post("/api/xenbudget/books/:bookId/import",
    validateParams(xenBudgetBookIdParamSchema), validate(xenBudgetRestoreSchema),
    async (req: Request, res: Response) => {
      try {
        const mode = req.body.mode === "replace" ? "replace" : "merge";
        // Replacing destroys everything already in the book, so it is the owner's call.
        const book = mode === "replace"
          ? await loadBookForCreator(req, res)
          : await loadBookForMember(req, res);
        if (!book) return;

        const userId = callerId(req);
        const { idMap, unmatched } = await resolveRestoreMembers(req.body.book.members || [], userId);

        let removed = 0;
        if (mode === "replace") {
          const result = await XenBudgetItem.deleteMany({ book_id: book._id });
          removed = result.deletedCount || 0;
          book.categories = stripIds(req.body.book.categories);
          book.tags = stripIds(req.body.book.tags);
          ensureSystemLabels(book);
          book.budgets = remapBudgets(stripIds(req.body.book.budgets), idMap);
          book.rules = remapRules(stripIds(req.body.book.rules), idMap);
          book.import_presets = stripIds(req.body.book.import_presets);
          await book.save();
        }

        const inserted = await insertRestoredItems(book, req.body.items, idMap, userId, mode);
        await book.populate("members", "username avatar");
        broadcastBook(book);

        res.json({
          status: true,
          message: mode === "replace"
            ? `Replaced ${removed} item${removed === 1 ? "" : "s"} with ${inserted}`
            : `Added ${inserted} item${inserted === 1 ? "" : "s"}`,
          data: {
            mode, restored: inserted, removed,
            skipped_duplicates: req.body.items.length - inserted,
            unmatched_people: unmatched,
          },
        });
      } catch (error) {
        console.error("Error restoring into book:", error);
        res.status(500).json({ status: false, message: "Failed to restore into book" });
      }
    });

  // --- CSV import ----------------------------------------------------------

  // POST /api/xenbudget/books/:bookId/items/check-duplicates
  //
  // Flags rows that look like transactions the book already has. Deliberately advisory:
  // two identical $4 coffees on the same day are both real, so this is never enforced as
  // a constraint — the user decides row by row.
  app.post("/api/xenbudget/books/:bookId/items/check-duplicates",
    validateParams(xenBudgetBookIdParamSchema), validate(xenBudgetCheckDuplicatesSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const rows = req.body.items;
        const hashes = rows.map((r: any) => computeImportHash(r.date || new Date(), r.amount, r.description));

        const existing = await XenBudgetItem.find({
          book_id: book._id,
          import_hash: { $in: hashes },
        }).select("import_hash description date amount").lean();

        const byHash = new Map<string, any>();
        existing.forEach((e: any) => { if (!byHash.has(e.import_hash)) byHash.set(e.import_hash, e); });

        res.json({
          status: true,
          message: "Duplicate check complete",
          data: {
            duplicates: rows.map((_: any, i: number) => {
              const match = byHash.get(hashes[i]);
              return match
                ? { index: i, existing: { _id: match._id.toString(), description: match.description, date: match.date, amount: match.amount } }
                : null;
            }).filter(Boolean),
          },
        });
      } catch (error) {
        console.error("Error checking duplicates:", error);
        res.status(500).json({ status: false, message: "Failed to check duplicates" });
      }
    });

  // POST /api/xenbudget/books/:bookId/items/bulk
  //
  // The CSV import itself. Every row goes through the same rules engine the preview used,
  // so what the user approved is what gets written. Rows a rule skips are counted and
  // named rather than silently dropped.
  app.post("/api/xenbudget/books/:bookId/items/bulk",
    validateParams(xenBudgetBookIdParamSchema), validate(xenBudgetBulkItemsSchema),
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

        const docs: any[] = [];
        const skipped: { index: number; rule: string }[] = [];
        const failed: { index: number; reason: string }[] = [];

        // Rows matching something already in the book are marked rather than refused —
        // two identical charges on the same day are both real, and the user already chose
        // to import these. The tag keeps that decision visible after the wizard closes.
        const incomingHashes = req.body.items.map((row: any) => computeImportHash(
          row.date || new Date(), roundMoney(Number(row.amount) || 0), row.description || "",
        ));
        const seenBefore = new Set<string>(
          (await XenBudgetItem.find({ book_id: book._id, import_hash: { $in: incomingHashes } })
            .select("import_hash").lean()).map((r: any) => r.import_hash),
        );

        req.body.items.forEach((row: any, index: number) => {
          const { item: ruled, skipped: wasSkipped, skippedByRuleName } = applyRules(
            draftFromRow({ ...row, source: "csv" }, book),
            rules,
          );
          if (wasSkipped) {
            skipped.push({ index, rule: skippedByRuleName || "a rule" });
            return;
          }
          let shares;
          try {
            // A rule's set_people wins, then the row's own, then the import's default
            // owners. Falling back to an even split across every member - what an empty
            // list would do - is rarely right for a personal card statement.
            const people = (ruled.people && ruled.people.length > 0 && ruled.people)
              || (row.people && row.people.length > 0 && row.people)
              || defaultPeople;
            shares = buildShares(
              { amount: ruled.amount, share_type: "equal", shares: people.map((u: string) => ({ user_id: u })) },
              book,
            );
          } catch (e: any) {
            failed.push({ index, reason: e.message });
            return;
          }
          // Applied by the importer, not by a rule, so these go into `tags` and NOT into
          // `rule_tags`: a later re-apply sweep must not strip a marker that was true at
          // import time.
          const importTags = [...ruled.tags];
          if (ruled.categories.length === 0 && ruled.type === "expense"
            && !importTags.includes(TAG_UNCATEGORISED)) {
            importTags.push(TAG_UNCATEGORISED);
          }
          if (seenBefore.has(incomingHashes[index]) && !importTags.includes(TAG_POSSIBLE_DUPLICATE)) {
            importTags.push(TAG_POSSIBLE_DUPLICATE);
          }

          docs.push({
            book_id: book._id,
            type: ruled.type,
            amount: ruled.amount,
            currency: row.currency || book.default_currency,
            date: ruled.date,
            description: ruled.description,
            original_description: ruled.original_description || row.description,
            categories: evenCategoryWeights(ruled.categories, ruled.amount),
            category_split_type: "equal",
            rule_categories: ruled.rule_categories,
            tags: importTags,
            rule_tags: ruled.rule_tags,
            applied_rule_ids: ruled.applied_rule_ids,
            excluded: ruled.excluded,
            excluded_reason: ruled.excluded_reason,
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
            source_label: (req.body.source_label || "").trim() || req.body.filename || "Import",
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
            excluded: docs.filter((d) => d.excluded).length,
            uncategorised: docs.filter((d) => d.tags.includes(TAG_UNCATEGORISED)).length,
            duplicates: docs.filter((d) => d.tags.includes(TAG_POSSIBLE_DUPLICATE)).length,
            skipped,
            failed,
          },
        });
      } catch (error) {
        console.error("Error importing items:", error);
        res.status(500).json({ status: false, message: "Failed to import items" });
      }
    });

  // GET /api/xenbudget/books/:bookId/imports - what has been imported, newest first
  app.get("/api/xenbudget/books/:bookId/imports",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        await book.populate("members", "username avatar");

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
        (book.members as any[]).forEach((m: any) => { if (m._id) memberById.set(m._id.toString(), m); });

        const batches = [...book.import_batches]
          .sort((a: any, b: any) => new Date(b.imported_at).getTime() - new Date(a.imported_at).getTime())
          .map((b: any) => ({
            _id: b._id.toString(),
            source_label: b.source_label,
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
    });

  // DELETE /api/xenbudget/books/:bookId/imports/:batchId - undo one import wholesale
  app.delete("/api/xenbudget/books/:bookId/imports/:batchId",
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
    });

  // --- Import presets ------------------------------------------------------

  app.post("/api/xenbudget/books/:bookId/import-presets",
    validateParams(xenBudgetBookIdParamSchema), validate(createXenBudgetPresetSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        book.import_presets.push(req.body);
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Preset saved", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error saving preset:", error);
        res.status(500).json({ status: false, message: "Failed to save preset" });
      }
    });

  app.put("/api/xenbudget/books/:bookId/import-presets/:presetId",
    validateParams(xenBudgetPresetParamSchema), validate(updateXenBudgetPresetSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const preset = book.import_presets.id(req.params.presetId);
        if (!preset) return res.status(404).json({ status: false, message: "Preset not found" });
        Object.assign(preset, req.body);
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Preset updated", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error updating preset:", error);
        res.status(500).json({ status: false, message: "Failed to update preset" });
      }
    });

  app.delete("/api/xenbudget/books/:bookId/import-presets/:presetId",
    validateParams(xenBudgetPresetParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const preset = book.import_presets.id(req.params.presetId);
        if (!preset) return res.status(404).json({ status: false, message: "Preset not found" });
        book.import_presets.pull({ _id: preset._id });
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Preset deleted", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error deleting preset:", error);
        res.status(500).json({ status: false, message: "Failed to delete preset" });
      }
    });

  // --- Budgets -------------------------------------------------------------

  app.post("/api/xenbudget/books/:bookId/budgets",
    validateParams(xenBudgetBookIdParamSchema), validate(createXenBudgetBudgetSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const error = validateBudgetTarget(req.body, book);
        if (error) return res.status(400).json({ status: false, message: error });

        book.budgets.push(toBudgetFields(req.body));
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Budget created", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error creating budget:", error);
        res.status(500).json({ status: false, message: "Failed to create budget" });
      }
    });

  app.put("/api/xenbudget/books/:bookId/budgets/:budgetId",
    validateParams(xenBudgetBudgetParamSchema), validate(updateXenBudgetBudgetSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const budget = book.budgets.id(req.params.budgetId);
        if (!budget) return res.status(404).json({ status: false, message: "Budget not found" });
        const error = validateBudgetTarget(req.body, book);
        if (error) return res.status(400).json({ status: false, message: error });

        Object.assign(budget, toBudgetFields(req.body));
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Budget updated", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error updating budget:", error);
        res.status(500).json({ status: false, message: "Failed to update budget" });
      }
    });

  app.delete("/api/xenbudget/books/:bookId/budgets/:budgetId",
    validateParams(xenBudgetBudgetParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const budget = book.budgets.id(req.params.budgetId);
        if (!budget) return res.status(404).json({ status: false, message: "Budget not found" });
        book.budgets.pull({ _id: budget._id });
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Budget deleted", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error deleting budget:", error);
        res.status(500).json({ status: false, message: "Failed to delete budget" });
      }
    });

  // GET /api/xenbudget/books/:bookId/budget-status?as_of&currency
  //
  // What each active budget has spent in the period it is *currently* in. Every budget
  // carries its own anchor and period length, so their windows differ; they're all
  // resolved up front and then measured in one $facet pass over the union range rather
  // than one query per budget.
  app.get("/api/xenbudget/books/:bookId/budget-status",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const q = req.query as Record<string, string>;
        const tz = requestTimezone(q);
        const asOf = q.as_of ? new Date(q.as_of) : new Date();
        const currency = q.currency || book.default_currency;

        const budgets = book.budgets.filter((b: any) => b.active !== false);
        if (budgets.length === 0) {
          return res.json({ status: true, message: "No budgets", data: { as_of: asOf.toISOString(), currency, budgets: [] } });
        }

        const ranges = budgets.map((b: any) => budgetPeriodRange(b, asOf, tz));
        const unionFrom = new Date(Math.min(...ranges.map((r: any) => r.from.getTime())));
        const unionTo = new Date(Math.max(...ranges.map((r: any) => r.to.getTime())));

        // Budgets cap spending, so income never counts against them.
        const base = {
          book_id: book._id,
          currency,
          type: "expense",
          excluded: { $ne: true },
          date: { $gte: unionFrom, $lt: unionTo },
        };

        const facet: Record<string, any[]> = {};
        budgets.forEach((b: any, i: number) => {
          const r = ranges[i];
          // `to` is exclusive: the instant a period ends is the instant the next begins,
          // so $lt (not $lte) keeps a boundary item from being counted twice.
          const inPeriod = { date: { $gte: r.from, $lt: r.to } };
          if (b.scope === "person") {
            facet[`b${i}`] = [
              { $match: inPeriod },
              { $unwind: "$shares" },
              { $match: { "shares.user_id": b.person_id } },
              { $group: { _id: null, total: { $sum: "$shares.amount" }, count: { $sum: 1 } } },
            ];
          } else if (b.scope === "category") {
            // Mirrors the person branch above: unwind, match, and sum the WEIGHT, so a
            // purchase split 70/30 counts 70% against this category rather than all of it.
            facet[`b${i}`] = [
              { $match: inPeriod },
              { $unwind: "$categories" },
              { $match: { "categories.name": b.category } },
              { $group: { _id: null, total: { $sum: "$categories.amount" }, count: { $sum: 1 } } },
            ];
          } else {
            facet[`b${i}`] = [
              { $match: inPeriod },
              { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
            ];
          }
        });

        const [results] = await XenBudgetItem.aggregate([{ $match: base }, { $facet: facet }]);

        const memberById = new Map<string, any>();
        (book.members as any[]).forEach((m: any) => {
          if (m._id) memberById.set(m._id.toString(), m);
        });

        res.json({
          status: true,
          message: "Budget status retrieved",
          data: {
            as_of: asOf.toISOString(),
            currency,
            timezone: tz,
            budgets: budgets.map((b: any, i: number) => {
              const row = results?.[`b${i}`]?.[0];
              const spent = roundMoney(row?.total || 0);
              const amount = roundMoney(b.amount);
              return {
                _id: b._id.toString(),
                scope: b.scope,
                category: b.category,
                person_id: b.person_id,
                person_name: b.person_id ? (memberById.get(b.person_id)?.username || "Unknown") : undefined,
                period: b.period,
                amount,
                spent,
                remaining: roundMoney(amount - spent),
                // Uncapped rather than clamped, so the bar can show how far over it went.
                percent: amount > 0 ? Math.round((spent / amount) * 100) : 0,
                over: spent > amount,
                item_count: row?.count || 0,
                period_from: ranges[i].from.toISOString(),
                period_to: ranges[i].to.toISOString(),
              };
            }),
          },
        });
      } catch (error) {
        console.error("Error building budget status:", error);
        res.status(500).json({ status: false, message: "Failed to build budget status" });
      }
    });

  // --- Summary -------------------------------------------------------------

  // GET /api/xenbudget/books/:bookId/summary?from&to&group_by=month|week|day&currency
  //
  // The engine behind both the live tally and the report page. One $facet pass, so the
  // per-period, per-tag, per-person and top-line numbers are computed over exactly the
  // same set of items and always reconcile with each other.
  app.get("/api/xenbudget/books/:bookId/summary",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const q = req.query as Record<string, string>;
        const tz = requestTimezone(q);

        // Amounts in different currencies can't be added together, so a summary is always
        // scoped to one - the same thing XenSplit's analytics does. The full list of
        // currencies present comes back too, so the UI can offer a switcher rather than
        // silently hiding money.
        const currencies: string[] = await XenBudgetItem.distinct("currency", { book_id: book._id });
        const currency = q.currency && currencies.includes(q.currency)
          ? q.currency
          : (currencies.includes(book.default_currency) ? book.default_currency : currencies[0]);

        const groupBy = q.group_by === "day" ? "day" : q.group_by === "week" ? "week" : "month";
        const format = groupBy === "day" ? "%Y-%m-%d" : groupBy === "week" ? "%G-W%V" : "%Y-%m";

        // Default window: the current month in the *viewer's* timezone.
        const now = new Date();
        const from = q.from ? new Date(q.from) : zonedWallToUtc(`${tzMonthKey(now, tz)}-01`, tz);
        const to = q.to ? new Date(q.to) : now;

        const match = baseItemMatch(book._id, { ...q, currency, from: from.toISOString(), to: to.toISOString() });

        const expenseOnly = { $match: { type: "expense" } };
        const [facets] = currency ? await XenBudgetItem.aggregate([
          { $match: match },
          {
            $facet: {
              byPeriod: [
                {
                  $group: {
                    _id: { $dateToString: { format, date: "$date", timezone: tz } },
                    expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
                    income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
                    count: { $sum: 1 },
                  },
                },
                { $sort: { _id: 1 } },
              ],
              // Sums the category's WEIGHT, not the item's full amount. Unwinding and
              // summing $amount - which is what the old tags array did - counts an item
              // once per label, so anything carrying two of them inflated the totals.
              byCategory: [
                expenseOnly,
                { $unwind: "$categories" },
                { $group: { _id: "$categories.name", total: { $sum: "$categories.amount" }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
              ],
              byPerson: [
                expenseOnly,
                { $unwind: "$shares" },
                { $group: { _id: "$shares.user_id", total: { $sum: "$shares.amount" }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
              ],
              uncategorised: [
                expenseOnly,
                { $match: { $or: [{ categories: { $size: 0 } }, { categories: { $exists: false } }] } },
                { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
              ],
              totals: [
                {
                  $group: {
                    _id: null,
                    expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
                    income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
                    count: { $sum: 1 },
                  },
                },
              ],
            },
          },
        ]) : [null];

        const byPeriodRaw: any[] = facets?.byPeriod ?? [];
        const byCategory: any[] = facets?.byCategory ?? [];
        const byPersonRaw: any[] = facets?.byPerson ?? [];
        const totalsRow = facets?.totals?.[0];
        const uncategorisedRow = facets?.uncategorised?.[0];

        // Resolve usernames in JS with one batched query rather than a $lookup, matching
        // the casino leaderboard's approach.
        const personIds = byPersonRaw.map((r: any) => r._id).filter(Boolean);
        const userMap = new Map<string, any>();
        if (personIds.length > 0) {
          const users = await User.find({
            _id: { $in: personIds.filter((id: string) => mongoose.Types.ObjectId.isValid(id)) },
          }).select("username avatar").lean();
          users.forEach((u: any) => userMap.set(u._id.toString(), u));
        }

        res.json({
          status: true,
          message: "Summary retrieved",
          data: {
            from: from.toISOString(),
            to: to.toISOString(),
            group_by: groupBy,
            timezone: tz,
            currency: currency ?? book.default_currency,
            currencies,
            by_period: seedPeriods(from, to, groupBy, tz).map((key) => {
              const row = byPeriodRaw.find((r: any) => r._id === key);
              const expense = roundMoney(row?.expense || 0);
              const income = roundMoney(row?.income || 0);
              return { key, expense, income, net: roundMoney(income - expense), count: row?.count || 0 };
            }),
            by_category: byCategory.map((r: any) => ({ category: r._id, total: roundMoney(r.total), count: r.count })),
            by_person: byPersonRaw.map((r: any) => ({
              user_id: r._id,
              username: userMap.get(r._id)?.username || "Unknown",
              avatar: userMap.get(r._id)?.avatar || null,
              total: roundMoney(r.total),
              count: r.count,
            })),
            uncategorised: { total: roundMoney(uncategorisedRow?.total || 0), count: uncategorisedRow?.count || 0 },
            totals: {
              expense: roundMoney(totalsRow?.expense || 0),
              income: roundMoney(totalsRow?.income || 0),
              net: roundMoney((totalsRow?.income || 0) - (totalsRow?.expense || 0)),
              count: totalsRow?.count || 0,
            },
          },
        });
      } catch (error) {
        console.error("Error building summary:", error);
        res.status(500).json({ status: false, message: "Failed to build summary" });
      }
    });

  // --- Items ---------------------------------------------------------------

  // GET /api/xenbudget/books/:bookId/items
  //   ?from&to&categories=a,b&tags=a,b&people=id,id&type&uncategorised&excluded&q&limit&cursor
  app.get("/api/xenbudget/books/:bookId/items", validateParams(xenBudgetBookIdParamSchema), async (req: Request, res: Response) => {
    try {
      const book = await loadBookForMember(req, res);
      if (!book) return;

      const q = req.query as Record<string, string>;
      const filter = baseItemMatch(book._id, q);

      if (q.q) filter.description = { $regex: escapeRegex(q.q), $options: "i" };

      // Keyset pagination on the (date, _id) sort, so a page boundary can't drop or
      // repeat an item the way a skip/limit offset does when rows are inserted.
      if (q.cursor) {
        const [cursorDate, cursorId] = q.cursor.split("_");
        if (cursorDate && cursorId && mongoose.Types.ObjectId.isValid(cursorId)) {
          filter.$or = [
            { date: { $lt: new Date(cursorDate) } },
            { date: new Date(cursorDate), _id: { $lt: new mongoose.Types.ObjectId(cursorId) } },
          ];
        }
      }

      const limit = Math.min(parseInt(q.limit || "100", 10) || 100, MAX_ITEMS_PAGE);
      const items = await XenBudgetItem.find(filter).sort({ date: -1, _id: -1 }).limit(limit + 1).lean();

      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, limit) : items;
      const last = page[page.length - 1];
      const nextCursor = hasMore && last ? `${new Date(last.date).toISOString()}_${last._id}` : null;

      res.json({
        status: true,
        message: "Items retrieved",
        data: { items: serializeItems(page), next_cursor: nextCursor, has_more: hasMore },
      });
    } catch (error) {
      console.error("Error fetching items:", error);
      res.status(500).json({ status: false, message: "Failed to fetch items" });
    }
  });

  // POST /api/xenbudget/books/:bookId/items
  app.post("/api/xenbudget/books/:bookId/items",
    validateParams(xenBudgetBookIdParamSchema), validate(createXenBudgetItemSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const userId = callerId(req);
        const body = req.body;

        // Rules run on hand-entered items too, not just imports — otherwise the same
        // transaction would be tagged one way through a CSV and another way by hand.
        const { item: ruled, skipped, skippedByRuleName } = applyRules(
          draftFromRow({ ...body, source: "manual" }, book),
          plainRules(book),
        );
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
        const manualCategories = ruled.rule_categories.length > 0
          ? evenCategoryWeights(ruled.categories, ruled.amount)
          : resolveCategories(body.category_split_type || "equal", ruled.amount, body.categories || []);

        let shares;
        try {
          // A rule's set_people overrides what the form asked for.
          shares = ruled.people && ruled.people.length > 0
            ? buildShares({ amount: ruled.amount, share_type: "equal", shares: ruled.people.map((u) => ({ user_id: u })) }, book)
            : buildShares(body, book);
        } catch (e: any) {
          return res.status(400).json({ status: false, message: e.message });
        }

        const amount = ruled.amount;
        const date = ruled.date;
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
          category_split_type: body.category_split_type || "equal",
          rule_categories: ruled.rule_categories,
          tags: ruled.tags,
          rule_tags: ruled.rule_tags,
          applied_rule_ids: ruled.applied_rule_ids,
          excluded: ruled.excluded,
          excluded_reason: ruled.excluded_reason,
          share_type: shares.share_type,
          shares: shares.shares,
          source: "manual",
          import_hash: computeImportHash(date, amount, ruled.description),
          created_by: userId,
        });
        await item.save();
        broadcastBook(book);
        res.json({ status: true, message: "Item added", data: serializeItem(item) });
      } catch (error) {
        console.error("Error creating item:", error);
        res.status(500).json({ status: false, message: "Failed to create item" });
      }
    });

  // PUT /api/xenbudget/books/:bookId/items/:itemId
  app.put("/api/xenbudget/books/:bookId/items/:itemId",
    validateParams(xenBudgetItemParamSchema), validate(updateXenBudgetItemSchema),
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
        if (body.date !== undefined) item.date = new Date(body.date);
        if (body.description !== undefined) item.description = body.description;
        if (body.notes !== undefined) item.notes = body.notes;
        if (body.tags !== undefined) item.tags = body.tags;
        if (body.categories !== undefined || body.category_split_type !== undefined
          || body.amount !== undefined) {
          // Weights have to be recomputed whenever the amount or the split changes, or
          // the per-category rollup stops summing to the item.
          const requested = body.categories !== undefined
            ? body.categories
            : item.categories.map((c: any) => ({ name: c.name, amount: c.amount, percentage: c.percentage }));
          item.category_split_type = body.category_split_type || item.category_split_type || "equal";
          item.categories = resolveCategories(item.category_split_type, item.amount, requested);
          // A hand-categorised item is no longer the importer's "nothing matched" case.
          if (item.categories.length > 0) {
            item.tags = (item.tags || []).filter((t: string) => t !== TAG_UNCATEGORISED);
          }
        }
        if (body.excluded !== undefined) {
          item.excluded = body.excluded;
          // Un-excluding by hand clears the rule's note; leaving it would keep blaming a
          // rule for a state the user has since overridden.
          if (!body.excluded) item.excluded_reason = undefined;
        }

        // Shares have to be recomputed whenever the amount or the split changes, or the
        // per-person totals stop reconciling with the item.
        if (body.shares !== undefined || body.share_type !== undefined || body.amount !== undefined) {
          try {
            const resolved = buildShares({
              amount: item.amount,
              share_type: body.share_type || item.share_type,
              shares: body.shares !== undefined
                ? body.shares
                : item.shares.map((s: any) => ({ user_id: s.user_id, amount: s.amount, percentage: s.percentage })),
            }, book);
            item.share_type = resolved.share_type;
            item.shares = resolved.shares;
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
    });

  // DELETE /api/xenbudget/books/:bookId/items/:itemId
  app.delete("/api/xenbudget/books/:bookId/items/:itemId",
    validateParams(xenBudgetItemParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const result = await XenBudgetItem.deleteOne({ _id: req.params.itemId, book_id: book._id });
        if (result.deletedCount === 0) {
          return res.status(404).json({ status: false, message: "Item not found" });
        }
        broadcastBook(book);
        res.json({ status: true, message: "Item deleted" });
      } catch (error) {
        console.error("Error deleting item:", error);
        res.status(500).json({ status: false, message: "Failed to delete item" });
      }
    });
};

// Search text goes into a $regex, so metacharacters in it must be literal - otherwise a
// stray "(" is a 500 and ".*" is a full scan.
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

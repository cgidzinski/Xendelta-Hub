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
  createXenBudgetPiggyBankSchema,
  updateXenBudgetPiggyBankSchema,
  createXenBudgetContributionSchema,
  updateXenBudgetContributionSchema,
  xenBudgetPiggyBankParamSchema,
  xenBudgetContributionParamSchema,
  xenBudgetBookIdParamSchema,
  xenBudgetItemParamSchema,
  xenBudgetItemImageParamSchema,
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
  previousPeriodRanges,
} from "../utils/xenBudgetUtils";
import {
  SYSTEM_FLAGS, STARTER_CATEGORIES, FLAG_UNCATEGORISED, FLAG_POSSIBLE_DUPLICATE,
  FLAG_NEEDS_REVIEW, FLAG_IGNORED, FLAG_OFF_BUDGET, MAX_XENBUDGET_IMAGES_PER_ITEM,
} from "../constants";
import { uploadXenBudgetImages } from "../config/multer";
import { uploadToGCS, deleteFromGCS, generateSignedUrl } from "../utils/gcsUtils";
import { generateUniqueFilename } from "../utils/mediaUtils";
import {
  applyRules, ruleMatches, stripRuleEffects, type DraftItem, type Rule,
} from "../utils/xenBudgetRules";
import {
  detectRecurring, monthlyCommitted, normalizeMerchant, merchantMatchPattern,
} from "../utils/xenBudgetRecurring";
import { coverageByMerchant } from "../utils/xenBudgetCoverage";
import { serializeBookFor, serializeBooksFor, serializeItem, serializeItems } from "../utils/xenBudgetSerializer";
import { summarizePiggyBank } from "../utils/xenBudgetPiggyBanks";
import { notify } from "../utils/notificationUtils";
import { csvLine } from "../utils/csvWriter";
const mongoose = require("mongoose");

const MAX_ITEMS_PAGE = 200;
// One import request's worth of rows. Bank exports are far smaller than this; the cap
// exists so a malformed or hostile request can't ask the server to build an unbounded
// number of documents in memory.
const MAX_BULK_ROWS = 2000;

// How far back recurring detection and the merchant rollup look when the caller doesn't
// say. Long enough to see a yearly renewal repeat, short enough that a decade-old book
// doesn't scan its whole history to answer "what do I pay every month".
const DEFAULT_RECURRING_LOOKBACK_MONTHS = 18;
const MAX_RECURRING_LOOKBACK_MONTHS = 60;
// A ceiling on the rows either analysis will pull into memory. Both read a lean
// projection (five small fields), so this is a few MB at worst.
const MAX_ANALYSIS_ITEMS = 20000;
// Past this many merchants a list stops being something anyone reads.
const DEFAULT_MERCHANT_LIMIT = 25;
const MAX_MERCHANT_LIMIT = 200;

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
 * through here, so "an off-budget item never reaches a total" is stated once rather than
 * repeated in each pipeline — get that wrong in a single place and the per-flag,
 * per-person and top-line numbers silently stop reconciling.
 *
 * `excluded` (the "Off budget" flag) is tri-state: hidden (default), "true" for
 * only-off-budget, "all" for both.
 */
function baseItemMatch(bookId: any, q: Record<string, string>): Record<string, any> {
  const filter: Record<string, any> = { book_id: bookId };

  if (q.from || q.to) {
    filter.date = {};
    if (q.from) filter.date.$gte = new Date(q.from);
    if (q.to) filter.date.$lte = new Date(q.to);
  }
  if (q.categories) filter["categories.name"] = { $in: q.categories.split(",").filter(Boolean) };
  // "has no category at all" - the worklist an import leaves behind.
  if (q.uncategorised === "true") filter.categories = { $size: 0 };
  if (q.people) filter["shares.user_id"] = { $in: q.people.split(",").filter(Boolean) };
  if (q.type === "expense" || q.type === "income") filter.type = q.type;
  if (q.source === "manual" || q.source === "csv") filter.source = q.source;
  if (q.currency) filter.currency = q.currency;

  // Mongo can't express two independent conditions on the same array field as separate
  // keys, so every flags filter merges into one compound operator.
  const flagsFilter: Record<string, any> = {};
  if (q.flags) flagsFilter.$in = q.flags.split(",").filter(Boolean);
  // Review mode's queue: uncategorised only. Items flagged "Needs review" are surfaced
  // separately as a quick filter rather than pulled into the queue, and something
  // deliberately set aside doesn't belong back in the queue just because it's also
  // uncategorised.
  if (q.review === "true") {
    filter.categories = { $size: 0 };
    flagsFilter.$nin = [FLAG_IGNORED, FLAG_NEEDS_REVIEW];
  }
  if (q.excluded === "true") {
    flagsFilter.$in = [...(flagsFilter.$in || []), FLAG_OFF_BUDGET];
  } else if (q.excluded !== "all") {
    flagsFilter.$nin = [...(flagsFilter.$nin || []), FLAG_OFF_BUDGET];
  }
  if (Object.keys(flagsFilter).length > 0) filter.flags = flagsFilter;

  return filter;
}

const BUDGET_MEASURES = ["expense", "income", "saving"];

/** Anything unrecognised - including a doc still carrying the old `kind` - is an expense. */
function normalizeMeasures(value: any): string {
  return BUDGET_MEASURES.includes(value) ? value : "expense";
}

/**
 * Which item type a budget counts.
 *
 * "saving" counts the same EXPENSE items a cap would - money moved into a savings category
 * has left the account it was sitting in - and differs only in reading as a floor. That
 * split is the whole point of the third value: direction and item type stop being the same
 * question.
 */
function itemTypeFor(measures: any): string {
  return normalizeMeasures(measures) === "income" ? "income" : "expense";
}

// A budget's target has to exist in this book, or it would silently never match: a
// person who isn't a member has no shares here, and a misspelled category is on no item.
function validateBudgetTarget(body: any, book: any): string | null {
  for (const sub of body.sub_budgets || []) {
    if (!isMember(book, sub.person_id)) {
      return "That person is not a member of this book";
    }
  }
  return null;
}

function toBudgetFields(body: any): Record<string, any> {
  return {
    categories: Array.isArray(body.categories) ? body.categories : [],
    measures: normalizeMeasures(body.measures),
    period: body.period,
    // Left undefined rather than 0 when unset: a budget with only per-person limits has
    // no overall cap, which is a different thing from a cap of nothing.
    amount: body.amount == null ? undefined : roundMoney(body.amount),
    sub_budgets: (body.sub_budgets || []).map((sub: any) => ({
      person_id: sub.person_id,
      amount: roundMoney(sub.amount),
    })),
    // Recurring periods snap to the calendar (see budgetPeriodRange) and no longer carry
    // an anchor, so a start/end date only means anything for a custom one-off range.
    start_date: body.period === "custom" && body.start_date ? new Date(body.start_date) : undefined,
    end_date: body.period === "custom" && body.end_date ? new Date(body.end_date) : undefined,
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

// Categories and flags are name-keyed, so a config restore ADDS the labels a backup has
// that this book doesn't, rather than replacing the book's own — whose colour and
// need_want tweaks would otherwise be clobbered by an older export.
function mergeLabelsByName(existing: any[], incoming: any[] | undefined): any[] {
  const names = new Set((existing || []).map((l: any) => l?.name).filter(Boolean));
  const merged = [...(existing || [])];
  for (const label of stripIds(incoming)) {
    if (label?.name && !names.has(label.name)) {
      merged.push(label);
      names.add(label.name);
    }
  }
  return merged;
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

// Only account ids need remapping: categories and flags travel by name, which is stable
// across deployments in a way an account id is not. The per-person limits nested in a
// budget carry ids too, so they're walked as well - missing that would restore a budget
// whose sub-limits point at accounts from the source deployment.
function remapBudgets(budgets: any[], idMap: Map<string, string>): any[] {
  return budgets.map((b: any) => ({
    ...b,
    sub_budgets: (b.sub_budgets || []).map((sub: any) => {
      // Same reason stripIds drops the budget's own _id: a subdocument id minted in
      // another deployment has no business being reused here.
      const { _id, ...rest } = sub || {};
      return { ...rest, person_id: remapUser(sub.person_id, idMap) };
    }),
  }));
}

// A piggy bank's ledger records WHO moved each amount, so those ids are walked too. The link to
// the book item is dropped rather than remapped: restored items are inserted fresh, so an
// id carried over from the source deployment would point at nothing here - or, worse, at
// something else entirely, which a later delete would take with it.
function remapPiggyBanks(banks: any[], idMap: Map<string, string>): any[] {
  return banks.map((g: any) => ({
    ...g,
    contributions: (g.contributions || []).map((c: any) => {
      const { _id, item_id, ...rest } = c || {};
      return { ...rest, user_id: remapUser(c.user_id, idMap) };
    }),
  }));
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

// Applies the backup's book-level settings into an existing book. Budgets, rules and
// import presets replace what's already there; categories and flags merge by name so the
// user's own label colours/need_want survive. Built-in flags are re-added afterwards.
async function applyConfig(book: any, payload: any, idMap: Map<string, string>): Promise<void> {
  book.categories = mergeLabelsByName(book.categories, payload.book.categories);
  book.flags = mergeLabelsByName(book.flags, payload.book.flags);
  ensureSystemLabels(book);
  book.budgets = remapBudgets(stripIds(payload.book.budgets), idMap);
  book.piggy_banks = remapPiggyBanks(stripIds(payload.book.piggy_banks), idMap);
  book.rules = remapRules(stripIds(payload.book.rules), idMap);
  book.import_presets = stripIds(payload.book.import_presets);
  await book.save();
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
      flags: Array.isArray(raw.flags) ? raw.flags : [],
      rule_flags: Array.isArray(raw.rule_flags) ? raw.rule_flags : [],
      share_type: raw.share_type || "equal",
      // Share user ids are remapped where a person resolved to a different account, so
      // per-person totals still attribute to the right people after a restore.
      shares: (raw.shares || []).map((s: any) => ({
        user_id: remapUser(s.user_id, idMap),
        amount: s.amount,
        percentage: s.percentage,
      })),
      manually_edited: !!raw.manually_edited,
      // Restored items keep their original source (manual/csv) so provenance and any
      // "source is csv/manual" rules still apply after a restore. Legacy or unknown
      // values coalesce to "csv" — bulk restores are overwhelmingly imports.
      source: raw.source === "manual" ? "manual" : "csv",
      import_hash: hash,
      created_by: raw.created_by || userId,
      created_at: raw.created_at ? new Date(raw.created_at) : new Date(),
    });
  }

  if (docs.length > 0) await XenBudgetItem.insertMany(docs);
  return docs.length;
}

/**
 * Guarantees every book has the built-in flags.
 *
 * The importer and the rules engine reference these by name, so a book without them would
 * silently fail to flag anything. Runs on create, on restore and on the book-fetch path,
 * which makes it self-healing: adding a fifth built-in later needs no migration. It only
 * ever ADDS - a colour the user has changed is never rewritten.
 *
 * Returns true when it changed something, so the caller knows whether to save.
 */
function ensureSystemLabels(book: any): boolean {
  let changed = false;
  for (const seed of SYSTEM_FLAGS) {
    const existing = (book.flags || []).find(
      (t: any) => t.name.toLowerCase() === seed.name.toLowerCase(),
    );
    if (existing) {
      // Keep an existing flag's colour; only mark it as built-in if it wasn't.
      if (!existing.system) { existing.system = true; changed = true; }
      continue;
    }
    book.flags.push({ name: seed.name, color: seed.color, system: true });
    changed = true;
  }
  return changed;
}

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
    const existing = (book.categories || []).find(
      (c: any) => c.name.toLowerCase() === seed.name.toLowerCase(),
    );
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
    const lists: string[][] = kind === "categories"
      ? [actions.set_categories || [], (actions.set_category_weights || []).map((w: any) => w.name)]
      : [actions.add_flags || [], actions.remove_flags || []];
    const referencedInActions = lists.some((list) =>
      list.some((n) => (n || "").toLowerCase() === lower));

    const conditionField = kind === "categories" ? "category" : "flags";
    const referencedInConditions = ((rule.match && rule.match.conditions) || [])
      .some((c: any) => c.field === conditionField && (c.value || "").toLowerCase() === lower);

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
  const renameOnItems = (bookId: any, from: string, to: string) => (kind === "categories"
    ? XenBudgetItem.updateMany(
      { book_id: bookId, "categories.name": from },
      { $set: { "categories.$[el].name": to } },
      { arrayFilters: [{ "el.name": from }] },
    )
    : XenBudgetItem.updateMany(
      { book_id: bookId, flags: from },
      { $set: { "flags.$[el]": to } },
      { arrayFilters: [{ el: from }] },
    ));

  const removeFromItems = (bookId: any, name: string) => (kind === "categories"
    // Dropping the entry leaves the item partially uncategorised rather than silently
    // re-weighting money across the categories that remain - which the user never asked
    // for and would quietly change what their reports say.
    ? XenBudgetItem.updateMany({ book_id: bookId, "categories.name": name }, { $pull: { categories: { name } } })
    : XenBudgetItem.updateMany({ book_id: bookId, flags: name }, { $pull: { flags: name } }));

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
        book[kind].push({
          name,
          color: req.body.color,
          ...(kind === "categories" ? { need_want: req.body.need_want ?? "none" } : {}),
        });
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
          // A built-in flag's name is referenced by rules and by the importer, so renaming
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
          const budget = book.budgets.find((b: any) => (b.categories || []).includes(label.name));
          if (budget) {
            return res.status(400).json({
              status: false,
              message: `"${label.name}" still has a budget on it. Delete that budget first.`,
            });
          }
        }

        // A rule or import preset that still points at this name would be left dangling,
        // so this is refused rather than silently changing what it does.
        const blockers = findLabelReferences(book, kind, label.name);
        if (blockers.length > 0) {
          return res.status(400).json({
            status: false,
            message: `"${label.name}" is still used by ${blockers.join(" and ")}. Update or delete ${blockers.length === 1 ? "it" : "them"} first.`,
          });
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

/** Resolves a rule's categories into stored weights, honouring a percentage split. */
function draftCategoryWeights(draft: DraftItem, amount: number) {
  const splitType = draft.category_split_type ?? "equal";
  const parts = draft.category_weights && draft.category_weights.length > 0
    ? draft.category_weights
    : (draft.categories || []).map((name) => ({ name }));
  return resolveCategories(splitType, amount, parts);
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

// Turns a rule's set_people action into stored shares, honouring a percentage split when
// the rule asked for one (people_split_type "percent" + set_people_weights).
function buildRuleShares(after: any, book: any): { share_type: string; shares: any[] } {
  const people: string[] = after.people || [];
  const splitType = after.people_split_type === "percent" ? "percent" : "equal";
  const weights = after.people_weights || [];
  return buildShares(
    {
      amount: after.amount,
      share_type: splitType,
      shares: people.map((p: string) => ({
        user_id: p,
        ...(splitType === "percent"
          ? { percentage: weights.find((w: any) => w.user_id === p)?.percentage ?? 0 }
          : {}),
      })),
    },
    book,
  );
}

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
      set_category_weights: r.actions?.set_category_weights || [],
      category_split_type: r.actions?.category_split_type,
      add_flags: r.actions?.add_flags || [],
      remove_flags: r.actions?.remove_flags || [],
      set_type: r.actions?.set_type ?? null,
      set_people: r.actions?.set_people || [],
      people_split_type: r.actions?.people_split_type,
      set_people_weights: r.actions?.set_people_weights || [],
      set_description: r.actions?.set_description,
      skip: r.actions?.skip === true,
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
    category_weights: (item.categories || []).map((c: any) => ({
      name: c.name, amount: c.amount, percentage: c.percentage,
    })),
    category_split_type: item.category_split_type,
    flags: [...(item.flags || [])],
    applied_rule_ids: (item.applied_rule_ids || []).map((id: any) => id.toString()),
    rule_categories: [...(item.rule_categories || [])],
    rule_flags: [...(item.rule_flags || [])],
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
    notes: String(row.notes || "").slice(0, 1000) || undefined,
    categories: Array.isArray(row.categories) ? [...row.categories] : [],
    flags: Array.isArray(row.flags) ? [...row.flags] : [],
    applied_rule_ids: [],
    rule_categories: [],
    rule_flags: [],
    source: row.source || "csv",
  };
}

/**
 * The incoming item date is a date-only value ("2026-08-15"). It is stored as that
 * calendar day anchored at UTC midnight — a transaction's date has no timezone, so it
 * must never be shifted by the viewer's or the book's zone.
 */
function bookDateToUtc(date: Date | string): Date {
  const day = new Date(date).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
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
    || !sameNames(before.flags, after.flags)
    || before.description !== after.description
    || before.type !== after.type;
  if (!changed) return null;
  return {
    _id: item._id.toString(),
    description: after.description,
    before: {
      categories: before.categories, flags: before.flags,
      description: before.description, type: before.type,
    },
    after: {
      categories: after.categories, flags: after.flags,
      description: after.description, type: after.type,
    },
  };
}

/**
 * The human-readable label for one import batch. The preset is the source of truth:
 * batches store only its id, so renaming a preset renames its historical imports. A
 * batch with no preset (legacy rows) keeps its stored label; a deleted preset yields
 * undefined, which callers render as a generic "Import".
 */
function resolveBatchLabel(batch: any, book: any): string | undefined {
  if (batch.preset_id) {
    const preset = book.import_presets.id(batch.preset_id);
    if (preset?.name) return preset.name;
    return undefined;
  }
  return batch.source_label || undefined;
}

// --- Piggy banks ------------------------------------------------------------

// A piggy bank's category has to exist in this book, for the same reason a budget's target
// does: a name nothing else uses would tag every mirrored transaction into a category
// that appears in no report and no budget.
function validatePiggyBankCategory(body: any, book: any): string | null {
  if (!body.category) return null;
  const known = (book.categories || []).some((c: any) => c.name === body.category);
  return known ? null : "That category is not in this book";
}

// Only the fields the request actually carried, so the card's small edits (Mark complete,
// Archive) can PUT a status on its own without resending a bank they never loaded whole.
function toPiggyBankFields(body: any, book: any, existing?: any): Record<string, any> {
  const fields: Record<string, any> = {};
  if (body.name !== undefined) fields.name = body.name;
  if (body.description !== undefined) fields.description = body.description;
  if (body.target_amount !== undefined) fields.target_amount = roundMoney(body.target_amount);
  if (body.currency !== undefined) fields.currency = body.currency;
  if (body.category !== undefined) fields.category = body.category;
  if (body.status !== undefined) {
    fields.status = body.status;
    // Stamped when the bank is marked done and cleared when it is reopened, so a card can
    // say WHEN it landed rather than only that it did.
    if (body.status === "completed") {
      fields.completed_at = existing?.completed_at || new Date();
    } else {
      fields.completed_at = undefined;
    }
  }
  if (!existing) {
    fields.currency = fields.currency || book.default_currency;
    fields.status = fields.status || "active";
  }
  return fields;
}

/**
 * The book item a contribution books. Always created - contributing IS booking an expense.
 *
 * Money into a piggy bank is surplus being consumed from the budget line it came from, so
 * it books as an expense under the bank's category; a withdrawal releases it and books as
 * income there. Auto-tagging rules are deliberately not run over it - the bank already
 * decides what this money is, and a rule re-tagging it would file the telescope fund under
 * groceries.
 */
/** What a contribution's item is called when the note doesn't name it. */
function contributionDescription(bank: any, out: boolean, note?: string): string {
  return note || `${out ? "From piggy bank" : "Piggy bank"}: ${bank.name}`;
}

async function createContributionItem(
  book: any, bank: any, userId: string, magnitude: number, out: boolean, date: Date, note?: string,
): Promise<any> {
  const description = contributionDescription(bank, out, note);
  const item = new XenBudgetItem({
    book_id: book._id,
    type: out ? "income" : "expense",
    amount: magnitude,
    currency: bank.currency || book.default_currency,
    date,
    description,
    categories: bank.category ? evenCategoryWeights([bank.category], magnitude) : [],
    category_split_type: "equal",
    // Attributed to whoever moved the money, the same way the bank's own per-person
    // breakdown is.
    ...buildShares(
      { amount: magnitude, share_type: "exact", shares: [{ user_id: userId, amount: magnitude }] },
      book,
    ),
    source: "manual",
    // A re-apply sweep skips hand-edited items, which is exactly what this is: the bank
    // decided its category, and a later sweep must not move it somewhere else.
    manually_edited: true,
    import_hash: computeImportHash(date, magnitude, description),
    created_by: userId,
  });
  await item.save();
  return item;
}

/** The item a contribution created, if it still exists. */
async function linkedItem(book: any, contribution: any): Promise<any | null> {
  if (!contribution.item_id) return null;
  return XenBudgetItem.findOne({ _id: contribution.item_id, book_id: book._id });
}

async function saveAndRespond(req: Request, res: Response, book: any, message: string) {
  await book.save();
  await book.populate("members", "username avatar");
  broadcastBook(book);
  res.json({ status: true, message, data: serializeBookFor(book, callerId(req)) });
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

      // One grouped count (and last activity date) for the whole list rather than a
      // query per book.
      const counts = new Map<string, number>();
      const lastItemAt = new Map<string, Date>();
      if (books.length > 0) {
        const rows = await XenBudgetItem.aggregate([
          { $match: { book_id: { $in: books.map((b: any) => b._id) }, flags: { $nin: [FLAG_OFF_BUDGET] } } },
          { $group: { _id: "$book_id", count: { $sum: 1 }, lastItemAt: { $max: "$date" } } },
        ]);
        rows.forEach((r: any) => {
          counts.set(r._id.toString(), r.count);
          lastItemAt.set(r._id.toString(), r.lastItemAt);
        });
      }

      res.json({
        status: true,
        message: "Books retrieved",
        data: serializeBooksFor(books, userId, counts, lastItemAt),
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
        notify(uid, {
          title: "Added to a budget book",
          message: `You were added to "${book.name}"`,
          link: `/internal/xenbudget/books/${book._id}/overview`,
          icon: "account_balance_wallet",
        });
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
      const count = await XenBudgetItem.countDocuments({ book_id: book._id, flags: { $nin: [FLAG_OFF_BUDGET] } });
      // Reuses the review-queue filter so the count always matches what the modal shows.
      const reviewCount = await XenBudgetItem.countDocuments(baseItemMatch(book._id, { review: "true" }));
      const needsReviewCount = await XenBudgetItem.countDocuments({
        book_id: book._id,
        flags: { $nin: [FLAG_OFF_BUDGET], $in: [FLAG_NEEDS_REVIEW] },
      });
      res.json({ status: true, message: "Book retrieved", data: serializeBookFor(book, callerId(req), count, reviewCount, needsReviewCount) });
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
          notify(uid, {
            title: "Added to a budget book",
            message: `You were added to "${book.name}"`,
            link: `/internal/xenbudget/books/${book._id}/overview`,
            icon: "account_balance_wallet",
          });
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
        notify(target, {
          title: "You now own a budget book",
          message: `You were made the owner of "${book.name}"`,
          link: `/internal/xenbudget/books/${book._id}/overview`,
          icon: "account_balance_wallet",
        });
        res.json({ status: true, message: "Book transferred", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error transferring book:", error);
        res.status(500).json({ status: false, message: "Failed to transfer book" });
      }
    });

  // --- Labels: categories and flags -----------------------------------------
  //
  // Two parallel registries of the same shape. Items reference labels by NAME, so a
  // rename has to carry across every item that used the old one - otherwise those items
  // silently fall out of that label's filters, budgets and reports.

  registerLabelRoutes(app, "categories");
  registerLabelRoutes(app, "flags");

  // POST /api/xenbudget/books/:bookId/reseed-labels
  // Re-adds any starter categories and built-in flags the book is missing - e.g. a book
  // created before a later release added more. Additive only: existing names and colours
  // are left untouched, and a category or flag the user deliberately deleted comes back.
  app.post("/api/xenbudget/books/:bookId/reseed-labels",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const categoriesChanged = ensureStarterCategories(book);
        const flagsChanged = ensureSystemLabels(book);
        if (!categoriesChanged && !flagsChanged) {
          await book.populate("members", "username avatar");
          return res.json({
            status: true,
            message: "Nothing to re-seed — the starter categories and flags are already all there",
            data: serializeBookFor(book, callerId(req)),
          });
        }
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Categories and flags re-seeded", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error reseeding labels:", error);
        res.status(500).json({ status: false, message: "Failed to re-seed labels" });
      }
    });


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

  // POST /api/xenbudget/books/:bookId/rules/preview
  //
  // Shows which existing items a not-yet-saved rule would match, so an edit can be checked
  // against real transactions before committing. Writes nothing.
  app.post("/api/xenbudget/books/:bookId/rules/preview",
    validateParams(xenBudgetBookIdParamSchema), validate(createXenBudgetRuleSchema),
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
          const diff = describeChange(item, before, after);
          if (!diff) continue;
          changes.push(diff);
          if (!dryRun) {
            // Rules name categories; the weights (even or percentage) are derived here.
            item.categories = draftCategoryWeights(after, item.amount);
            item.category_split_type = after.category_split_type ?? "equal";
            item.rule_categories = after.rule_categories;
            item.flags = after.flags;
            item.rule_flags = after.rule_flags;
            item.applied_rule_ids = after.applied_rule_ids;
            item.description = after.description;
            item.original_description = after.original_description;
            item.type = after.type;
            if (after.people && after.people.length > 0) {
              try {
                const resolved = buildRuleShares(after, book);
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
          const result = req.body.skip_rules
            ? { item: draft, skipped: false, skippedByRuleName: undefined }
            : applyRules(draft, rules);
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
              notes: result.item.notes,
              categories: result.item.categories,
              flags: result.item.flags,
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
          flags: book.flags,
          budgets: book.budgets,
          piggy_banks: book.piggy_banks,
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
          flags: stripIds(payload.book.flags),
          budgets: remapBudgets(stripIds(payload.book.budgets), idMap),
          piggy_banks: remapPiggyBanks(stripIds(payload.book.piggy_banks), idMap),
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
        // scope wins over the legacy mode field; a request with neither is an items-only
        // merge, which is what a bare restore has always done.
        const scope = (req.body.scope as "items" | "config" | "everything" | undefined)
          || (req.body.mode === "replace" ? "everything" : "items");
        // Config and everything overwrite book-level settings (and everything also wipes
        // items), so they are the owner's call; a plain items merge is member-safe.
        const book = scope === "items"
          ? await loadBookForMember(req, res)
          : await loadBookForCreator(req, res);
        if (!book) return;

        const userId = callerId(req);
        const { idMap, unmatched } = await resolveRestoreMembers(req.body.book.members || [], userId);

        let removed = 0;
        let inserted = 0;
        if (scope === "config" || scope === "everything") {
          await applyConfig(book, req.body, idMap);
        }
        if (scope === "everything") {
          const result = await XenBudgetItem.deleteMany({ book_id: book._id });
          removed = result.deletedCount || 0;
          inserted = await insertRestoredItems(book, req.body.items, idMap, userId, "replace");
        } else if (scope === "items") {
          inserted = await insertRestoredItems(book, req.body.items, idMap, userId, "merge");
        }

        await book.populate("members", "username avatar");
        broadcastBook(book);

        const message = scope === "config"
          ? "Imported settings"
          : scope === "everything"
            ? `Replaced ${removed} item${removed === 1 ? "" : "s"} with ${inserted}`
            : `Added ${inserted} item${inserted === 1 ? "" : "s"}`;

        res.json({
          status: true,
          message,
          data: {
            scope, restored: inserted, removed,
            skipped_duplicates: scope === "items" ? req.body.items.length - inserted : 0,
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
        const incomingHashes = req.body.items.map((row: any) => computeImportHash(
          row.date || new Date(), roundMoney(Number(row.amount) || 0), row.description || "",
        ));
        const seenBefore = new Set<string>(
          (await XenBudgetItem.find({ book_id: book._id, import_hash: { $in: incomingHashes } })
            .select("import_hash").lean()).map((r: any) => r.import_hash),
        );

        req.body.items.forEach((row: any, index: number) => {
          const draft = draftFromRow({ ...row, source: "csv" }, book);
          const { item: ruled, skipped: wasSkipped, skippedByRuleName } = req.body.skip_rules
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
          // import time.
          const importFlags = [...ruled.flags];
          if (ruled.categories.length === 0 && !importFlags.includes(FLAG_UNCATEGORISED)) {
            importFlags.push(FLAG_UNCATEGORISED);
          }
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
        const preset = book.import_presets.create(req.body);
        book.import_presets.push(preset);
        await book.save();
        await book.populate("members", "username avatar");
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

  // --- Piggy banks ---------------------------------------------------------
  //
  // Surplus budget set aside toward a future purchase, with its own ledger: unlike a
  // budget, which is measured fresh over each period, its balance accumulates, so "how
  // close am I to the telescope?" has an answer. Every route here answers with the whole
  // book, the way the budget routes do, so one response refreshes the client and one
  // socket broadcast reaches everyone else in the book.

  app.post("/api/xenbudget/books/:bookId/piggy-banks",
    validateParams(xenBudgetBookIdParamSchema), validate(createXenBudgetPiggyBankSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const error = validatePiggyBankCategory(req.body, book);
        if (error) return res.status(400).json({ status: false, message: error });

        book.piggy_banks.push({
          ...toPiggyBankFields(req.body, book),
          created_by: callerId(req),
        });
        await saveAndRespond(req, res, book, "Piggy bank created");
      } catch (error) {
        console.error("Error creating piggy bank:", error);
        res.status(500).json({ status: false, message: "Failed to create piggy bank" });
      }
    });

  app.put("/api/xenbudget/books/:bookId/piggy-banks/:bankId",
    validateParams(xenBudgetPiggyBankParamSchema), validate(updateXenBudgetPiggyBankSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const bank = book.piggy_banks.id(req.params.bankId);
        if (!bank) return res.status(404).json({ status: false, message: "Piggy bank not found" });
        const error = validatePiggyBankCategory(req.body, book);
        if (error) return res.status(400).json({ status: false, message: error });

        Object.assign(bank, toPiggyBankFields(req.body, book, bank));
        await saveAndRespond(req, res, book, "Piggy bank updated");
      } catch (error) {
        console.error("Error updating piggy bank:", error);
        res.status(500).json({ status: false, message: "Failed to update piggy bank" });
      }
    });

  // Deleting a piggy bank takes its ledger but LEAVES the transactions it created: those are
  // real money movements that already happened, and silently removing a year of them
  // because a target was abandoned would rewrite the book's history.
  app.delete("/api/xenbudget/books/:bookId/piggy-banks/:bankId",
    validateParams(xenBudgetPiggyBankParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const bank = book.piggy_banks.id(req.params.bankId);
        if (!bank) return res.status(404).json({ status: false, message: "Piggy bank not found" });

        // Counted rather than inferred from the ledger: an item may have been deleted
        // from the Items tab since, and promising to leave one behind that isn't there
        // any more would be a lie in the only message the user gets about it.
        const linkedIds = (bank.contributions || []).map((c: any) => c.item_id).filter(Boolean);
        const kept = linkedIds.length === 0 ? 0 : await XenBudgetItem.countDocuments({
          _id: { $in: linkedIds }, book_id: book._id,
        });
        book.piggy_banks.pull({ _id: bank._id });
        await saveAndRespond(req, res, book, kept > 0
          ? `Piggy bank deleted — ${kept} transaction${kept === 1 ? "" : "s"} left in the book`
          : "Piggy bank deleted");
      } catch (error) {
        console.error("Error deleting piggy bank:", error);
        res.status(500).json({ status: false, message: "Failed to delete piggy bank" });
      }
    });

  // POST .../piggyBank/:bankId/contributions - put money in, or take it back out
  //
  // `amount` is always positive and `direction` carries the sign, so a "contribute"
  // button can't subtract by sending a minus. The matching book item is always written -
  // see createContributionItem for why it books the way round it does.
  app.post("/api/xenbudget/books/:bookId/piggy-banks/:bankId/contributions",
    validateParams(xenBudgetPiggyBankParamSchema), validate(createXenBudgetContributionSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const bank = book.piggy_banks.id(req.params.bankId);
        if (!bank) return res.status(404).json({ status: false, message: "Piggy bank not found" });

        const userId = callerId(req);
        const magnitude = roundMoney(req.body.amount);
        const out = req.body.direction === "out";
        // A bank that owes money is a balance nobody can act on, so a withdrawal is capped
        // at what is actually in there rather than allowed to go negative.
        if (out && magnitude > summarizePiggyBank(bank).saved) {
          return res.status(400).json({ status: false, message: "That's more than this piggy bank holds" });
        }
        const date = bookDateToUtc(req.body.date || new Date());

        let item;
        try {
          item = await createContributionItem(book, bank, userId, magnitude, out, date, req.body.note);
        } catch (e: any) {
          return res.status(400).json({ status: false, message: e.message });
        }

        bank.contributions.push({
          amount: out ? -magnitude : magnitude,
          date,
          note: req.body.note,
          user_id: userId,
          item_id: item._id,
        });
        await saveAndRespond(req, res, book, out ? "Withdrawn" : "Contribution added");
      } catch (error) {
        console.error("Error adding contribution:", error);
        res.status(500).json({ status: false, message: "Failed to add contribution" });
      }
    });

  // Editing a contribution keeps its linked transaction in step, so the two can never
  // disagree about what moved. Its DIRECTION is fixed: a deposit that becomes a withdrawal
  // is a different movement, and turning one into the other in place would leave the
  // linked item booked the wrong way round.
  app.put("/api/xenbudget/books/:bookId/piggy-banks/:bankId/contributions/:contributionId",
    validateParams(xenBudgetContributionParamSchema), validate(updateXenBudgetContributionSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const bank = book.piggy_banks.id(req.params.bankId);
        if (!bank) return res.status(404).json({ status: false, message: "Piggy bank not found" });
        const contribution = bank.contributions.id(req.params.contributionId);
        if (!contribution) {
          return res.status(404).json({ status: false, message: "Contribution not found" });
        }

        const out = contribution.amount < 0;
        const magnitude = req.body.amount === undefined
          ? Math.abs(contribution.amount)
          : roundMoney(req.body.amount);
        if (out) {
          const otherSaved = summarizePiggyBank(bank).saved + Math.abs(contribution.amount);
          if (magnitude > otherSaved) {
            return res.status(400).json({ status: false, message: "That's more than this piggy bank holds" });
          }
        }

        contribution.amount = out ? -magnitude : magnitude;
        if (req.body.date !== undefined) contribution.date = bookDateToUtc(req.body.date);
        if (req.body.note !== undefined) contribution.note = req.body.note;

        const item = await linkedItem(book, contribution);
        if (item) {
          item.amount = magnitude;
          item.date = contribution.date;
          item.description = contributionDescription(bank, out, contribution.note);
          item.categories = bank.category ? evenCategoryWeights([bank.category], magnitude) : [];
          item.shares = resolveShares("exact", magnitude,
            [{ user_id: contribution.user_id, amount: magnitude }], memberIds(book));
          item.manually_edited = true;
          await item.save();
        }

        await saveAndRespond(req, res, book, "Contribution updated");
      } catch (error) {
        console.error("Error updating contribution:", error);
        res.status(500).json({ status: false, message: "Failed to update contribution" });
      }
    });

  // The linked transaction goes with it: it only existed to mirror this contribution, and
  // leaving it behind would double-count the money against the book's spending.
  app.delete("/api/xenbudget/books/:bookId/piggy-banks/:bankId/contributions/:contributionId",
    validateParams(xenBudgetContributionParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const bank = book.piggy_banks.id(req.params.bankId);
        if (!bank) return res.status(404).json({ status: false, message: "Piggy bank not found" });
        const contribution = bank.contributions.id(req.params.contributionId);
        if (!contribution) {
          return res.status(404).json({ status: false, message: "Contribution not found" });
        }

        const item = await linkedItem(book, contribution);
        if (item) await XenBudgetItem.deleteOne({ _id: item._id });
        bank.contributions.pull({ _id: contribution._id });
        await saveAndRespond(req, res, book,
          item ? "Contribution and its transaction removed" : "Contribution removed");
      } catch (error) {
        console.error("Error deleting contribution:", error);
        res.status(500).json({ status: false, message: "Failed to delete contribution" });
      }
    });

  // GET /api/xenbudget/books/:bookId/budget-status?as_of&currency&from&to
  //
  // What each active budget has spent in the period it is *currently* in. Every budget
  // carries its own anchor and period length, so their windows differ; they're all
  // resolved up front and then measured in one $facet pass over the union range rather
  // than one query per budget.
  //
  // `from`/`to` override that: every budget is measured over the one window instead, which
  // is what a report covering an arbitrary range needs. Only the SPEND changes - `amount`
  // stays each budget's own per-period figure, and scaling it to the range is the client's
  // job (see scaleBudgetToRange), so that date maths lives in exactly one place.
  app.get("/api/xenbudget/books/:bookId/budget-status",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        // memberById below needs real User docs, not raw ObjectIds.
        await book.populate("members", "username avatar");
        const q = req.query as Record<string, string>;
        const asOf = q.as_of ? new Date(q.as_of) : new Date();
        const currency = q.currency || book.default_currency;

        const budgets = book.budgets.filter((b: any) => b.active !== false);
        if (budgets.length === 0) {
          return res.json({
            status: true,
            message: "No budgets",
            data: { as_of: asOf.toISOString(), currency, budgets: [] },
          });
        }

        const rangeFrom = q.from ? new Date(q.from) : null;
        const rangeTo = q.to ? new Date(q.to) : null;
        const useRange = !!rangeFrom && !!rangeTo
          && !isNaN(rangeFrom.getTime()) && !isNaN(rangeTo.getTime())
          && rangeTo.getTime() > rangeFrom.getTime();

        // How many of each budget's own past periods to measure, for the history strip.
        // Opt-in and clamped: it widens the scan from one period to `history` of them, and
        // the Overview polls this endpoint often enough that every caller should not pay
        // for a year of history it isn't drawing.
        const history = Math.min(24, Math.max(0, parseInt(q.history, 10) || 0));

        // Each budget's own current-period window, always computed so the response can
        // carry "whole period" figures alongside whatever range the caller asked for.
        const ownRanges = budgets.map((b: any) => budgetPeriodRange(b, asOf));
        // Oldest first, ending with the window `asOf` is in. Empty when history wasn't
        // asked for, or for a one-off budget, which has no repeating window to look back
        // over.
        const historyRanges = budgets.map((b: any) => previousPeriodRanges(b, asOf, history));
        const ranges = budgets.map((b: any, i: number) => (useRange
          ? { from: rangeFrom as Date, to: rangeTo as Date }
          : ownRanges[i]));
        // The base match has to cover both the requested window and each budget's own
        // period, or a whole-period bar would be clipped to the requested range.
        // History windows go into the union too, or the base $match below clips them and
        // every bucket comes back empty.
        const union = [
          ...(useRange ? [...ranges, ...ownRanges] : ranges),
          ...historyRanges.flat(),
        ];
        const unionFrom = new Date(Math.min(...union.map((r: any) => r.from.getTime())));
        const unionTo = new Date(Math.max(...union.map((r: any) => r.to.getTime())));

        // Both types are in scope here because different budgets in one book measure
        // different things; each branch below narrows to its own. Widening the shared match
        // is what lets an expense cap and an income target sit on the same category without
        // either counting the other's items.
        const base = {
          book_id: book._id,
          currency,
          flags: { $nin: [FLAG_OFF_BUDGET] },
          date: { $gte: unionFrom, $lt: unionTo },
        };

        const facet: Record<string, any[]> = {};
        budgets.forEach((b: any, i: number) => {
          const r = ranges[i];
          // `to` is exclusive: the instant a period ends is the instant the next begins,
          // so $lt (not $lte) keeps a boundary item from being counted twice.
          const inPeriod = { date: { $gte: r.from, $lt: r.to } };
          const cats = b.categories && b.categories.length > 0 ? b.categories : null;

          // What this budget's SCOPE counts of each item: the whole thing when it names no
          // categories, otherwise only the weights of the ones it does name. The type
          // narrowing goes FIRST, ahead of the unwind, so an income budget never fans out
          // the expense rows it is about to discard.
          const measuresType = { $match: { type: itemTypeFor(b.measures) } };
          const scopeStages: any[] = cats
            ? [measuresType, { $unwind: "$categories" }, { $match: { "categories.name": { $in: cats } } }]
            : [measuresType];
          const scopeAmount: any = cats ? "$categories.amount" : "$amount";
          // One person's slice of that scope: their share of the item, prorated by the
          // category weight. A $100 item split 70/30 by category and 50/50 by person owes
          // a Groceries budget $35 - 50% of the $70 weight, not $70 and not $100.
          const personAmount: any = cats
            ? {
              $cond: [
                { $eq: ["$amount", 0] },
                0,
                { $divide: [{ $multiply: ["$categories.amount", "$shares.amount"] }, "$amount"] },
              ],
            }
            : "$shares.amount";

          // The scope's own spend, computed whether or not there is an overall limit to
          // measure it against: a budget that only caps named people still has a total,
          // and the detail panel shows it. Grouping by item _id first keeps item_count
          // from inflating when one item carries two of the selected categories.
          facet[`b${i}`] = [
            { $match: inPeriod },
            ...scopeStages,
            ...(cats ? [{ $group: { _id: "$_id", total: { $sum: scopeAmount } } }] : []),
            { $group: { _id: null, total: { $sum: cats ? "$total" : scopeAmount }, count: { $sum: 1 } } },
          ];

          // The same scope over the budget's OWN current period, not the requested range
          // - the "whole period" bar. When no range is requested the two coincide.
          facet[`b${i}full`] = [
            { $match: { date: { $gte: ownRanges[i].from, $lt: ownRanges[i].to } } },
            ...scopeStages,
            ...(cats ? [{ $group: { _id: "$_id", total: { $sum: scopeAmount } } }] : []),
            { $group: { _id: null, total: { $sum: cats ? "$total" : scopeAmount }, count: { $sum: 1 } } },
          ];

          // Who spent it. Every member's shares add up to the item amount, so these rows
          // sum back to the scope total above rather than telling a different story.
          facet[`b${i}p`] = [
            { $match: inPeriod },
            ...scopeStages,
            { $unwind: "$shares" },
            { $group: { _id: "$shares.user_id", total: { $sum: personAmount } } },
            { $sort: { total: -1 } },
          ];

          // The same breakdown over the budget's OWN current period, for the whole-period
          // section's "who spent it".
          facet[`b${i}fullp`] = [
            { $match: { date: { $gte: ownRanges[i].from, $lt: ownRanges[i].to } } },
            ...scopeStages,
            { $unwind: "$shares" },
            { $group: { _id: "$shares.user_id", total: { $sum: personAmount } } },
            { $sort: { total: -1 } },
          ];

          // The same scope over each of the budget's own past periods, in one pass.
          // $bucket on the window boundaries rather than a $dateToString key: "%Y-%m" has
          // no quarterly form, and folding months into quarters in JS afterwards is
          // exactly where this would drift out of step with the figures above it.
          const hist = historyRanges[i];
          if (hist.length > 0) {
            facet[`b${i}h`] = [
              { $match: { date: { $gte: hist[0].from, $lt: hist[hist.length - 1].to } } },
              ...scopeStages,
              ...(cats
                ? [{ $group: { _id: "$_id", date: { $first: "$date" }, total: { $sum: scopeAmount } } }]
                : []),
              {
                $bucket: {
                  groupBy: "$date",
                  boundaries: [...hist.map((r: any) => r.from), hist[hist.length - 1].to],
                  default: "other",
                  output: { total: { $sum: cats ? "$total" : scopeAmount }, count: { $sum: 1 } },
                },
              },
            ];
          }

          // One pipeline per per-person limit. Same scope, same window - the nesting is
          // what guarantees a sub-limit is measured over exactly the parent's items.
          (b.sub_budgets || []).forEach((sub: any, j: number) => {
            facet[`b${i}s${j}`] = [
              { $match: inPeriod },
              ...scopeStages,
              { $unwind: "$shares" },
              { $match: { "shares.user_id": sub.person_id } },
              { $group: { _id: "$_id", total: { $sum: personAmount } } },
              { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
            ];
          });
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
            budgets: budgets.map((b: any, i: number) => {
              const row = results?.[`b${i}`]?.[0];
              const spent = roundMoney(row?.total || 0);
              const periodRow = results?.[`b${i}full`]?.[0];
              const periodSpent = roundMoney(periodRow?.total || 0);
              // Absent when the budget caps only named people. The client keys every
              // "is there an overall bar to draw" decision off this being undefined,
              // which is why it isn't flattened to 0.
              const amount = b.amount == null ? undefined : roundMoney(b.amount);
              return {
                _id: b._id.toString(),
                categories: b.categories || [],
                // The numbers below are the same either way - `over` means literally
                // "past the amount". Whether that is a failure or the point of the
                // budget is the client's call, and this is what it decides on.
                measures: normalizeMeasures(b.measures),
                period: b.period,
                spent,
                item_count: row?.count || 0,
                period_spent: periodSpent,
                period_item_count: periodRow?.count || 0,
                ...(amount === undefined ? {} : {
                  amount,
                  remaining: roundMoney(amount - spent),
                  // Uncapped rather than clamped, so the bar can show how far over it went.
                  percent: amount > 0 ? Math.round((spent / amount) * 100) : 0,
                  over: spent > amount,
                }),
                by_person: (results?.[`b${i}p`] || [])
                  .filter((p: any) => p._id)
                  .map((p: any) => ({
                    user_id: p._id,
                    username: memberById.get(p._id)?.username || "Unknown",
                    amount: roundMoney(p.total || 0),
                  })),
                period_by_person: (results?.[`b${i}fullp`] || [])
                  .filter((p: any) => p._id)
                  .map((p: any) => ({
                    user_id: p._id,
                    username: memberById.get(p._id)?.username || "Unknown",
                    amount: roundMoney(p.total || 0),
                  })),
                sub_budgets: (b.sub_budgets || []).map((sub: any, j: number) => {
                  const subRow = results?.[`b${i}s${j}`]?.[0];
                  const subSpent = roundMoney(subRow?.total || 0);
                  const subAmount = roundMoney(sub.amount);
                  return {
                    _id: sub._id.toString(),
                    person_id: sub.person_id,
                    person_name: memberById.get(sub.person_id)?.username || "Unknown",
                    amount: subAmount,
                    spent: subSpent,
                    remaining: roundMoney(subAmount - subSpent),
                    percent: subAmount > 0 ? Math.round((subSpent / subAmount) * 100) : 0,
                    over: subSpent > subAmount,
                    item_count: subRow?.count || 0,
                  };
                }),
                period_from: ranges[i].from.toISOString(),
                period_to: ranges[i].to.toISOString(),
                own_period_from: ownRanges[i].from.toISOString(),
                own_period_to: ownRanges[i].to.toISOString(),
                // One entry per own-period, oldest first. Absent entirely unless history
                // was asked for, so the default response is byte-identical to before.
                // These figures are per whole period and are never scaled to a requested
                // range - a column means "that month", whatever window is on screen.
                ...(historyRanges[i].length === 0 ? {} : {
                  periods: historyRanges[i].map((r: any, k: number) => {
                    // $bucket keys each bucket by its lower boundary and omits empty ones
                    // entirely, so a month with no items has to be filled back in as a
                    // zero rather than shifting every later column left.
                    const bucket = (results?.[`b${i}h`] || [])
                      .find((row: any) => row._id instanceof Date
                        && row._id.getTime() === r.from.getTime());
                    const periodSpentHere = roundMoney(bucket?.total || 0);
                    return {
                      from: r.from.toISOString(),
                      to: r.to.toISOString(),
                      spent: periodSpentHere,
                      item_count: bucket?.count || 0,
                      ...(amount === undefined ? {} : {
                        amount,
                        percent: amount > 0 ? Math.round((periodSpentHere / amount) * 100) : 0,
                        over: periodSpentHere > amount,
                      }),
                    };
                  }),
                }),
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
  // per-period, per-category, per-person and top-line numbers are computed over exactly the
  // same set of items and always reconcile with each other.
  app.get("/api/xenbudget/books/:bookId/summary",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const q = req.query as Record<string, string>;
        const people = q.people ? q.people.split(",").filter(Boolean) : null;

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

        // Default window: the current UTC month.
        const now = new Date();
        const from = q.from ? new Date(q.from) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const to = q.to ? new Date(q.to) : now;

        const matchQuery: Record<string, string> = { ...q, currency, from: from.toISOString(), to: to.toISOString() };
        // Handled explicitly below: when narrowing to people, the rollups sum each selected
        // person's share rather than the item's full amount.
        delete matchQuery.people;
        const match = baseItemMatch(book._id, matchQuery);

        const expenseOnly = { $match: { type: "expense" } };

        // Narrowing to specific people changes what each document contributes: instead of
        // the item's full amount, the rollups sum each selected person's actual share.
        const shareStages: any[] = people
          ? [
            { $unwind: "$shares" },
            { $match: { "shares.user_id": { $in: people } } },
          ]
          : [];
        const amountField: any = people ? "$shares.amount" : "$amount";
        // A person's share of one category weight: share × (category weight ÷ item amount).
        const categoryTotalExpr: any = people
          ? {
            $cond: [
              { $eq: ["$amount", 0] },
              0,
              { $divide: [{ $multiply: ["$shares.amount", "$categories.amount"] }, "$amount"] },
            ],
          }
          : "$categories.amount";

        const [facets] = currency ? await XenBudgetItem.aggregate([
          { $match: match },
          ...shareStages,
          {
            $facet: {
              byPeriod: [
                {
                  $group: {
                    _id: { $dateToString: { format, date: "$date" } },
                    expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, amountField, 0] } },
                    income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, amountField, 0] } },
                    count: { $sum: 1 },
                  },
                },
                { $sort: { _id: 1 } },
              ],
              // Sums the category's WEIGHT (or the selected person's share of it), not the
              // item's full amount. Unwinding and summing $amount - which is what the old
              // tags array did - counts an item once per label, so anything carrying two of
              // them inflated the totals.
              byCategory: [
                expenseOnly,
                { $unwind: "$categories" },
                { $group: { _id: "$categories.name", total: { $sum: categoryTotalExpr }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
              ],
              byPerson: [
                { $unwind: "$shares" },
                {
                  $group: {
                    _id: "$shares.user_id",
                    total: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$shares.amount", 0] } },
                    income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$shares.amount", 0] } },
                    count: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, 1, 0] } },
                  },
                },
                { $sort: { total: -1 } },
              ],
              // The same two rollups again, but cut by period as well as category - what
              // the report's month-by-month grid is built from. Kept as their own facets
              // rather than derived on the client, because only the server can weight a
              // split purchase correctly, and re-deriving it from the flat by_category
              // rows is impossible: those have already been summed across time.
              byCategoryPeriod: [
                expenseOnly,
                { $unwind: "$categories" },
                {
                  $group: {
                    _id: {
                      category: "$categories.name",
                      period: { $dateToString: { format, date: "$date" } },
                    },
                    total: { $sum: categoryTotalExpr },
                  },
                },
              ],
              uncategorised: [
                expenseOnly,
                { $match: { $or: [{ categories: { $size: 0 } }, { categories: { $exists: false } }] } },
                { $group: { _id: null, total: { $sum: amountField }, count: { $sum: 1 } } },
              ],
              uncategorisedByPeriod: [
                expenseOnly,
                { $match: { $or: [{ categories: { $size: 0 } }, { categories: { $exists: false } }] } },
                {
                  $group: {
                    _id: { $dateToString: { format, date: "$date" } },
                    total: { $sum: amountField },
                  },
                },
              ],
              totals: [
                {
                  $group: {
                    _id: null,
                    expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, amountField, 0] } },
                    income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, amountField, 0] } },
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
            currency: currency ?? book.default_currency,
            currencies,
            by_period: seedPeriods(from, to, groupBy).map((key) => {
              const row = byPeriodRaw.find((r: any) => r._id === key);
              const expense = roundMoney(row?.expense || 0);
              const income = roundMoney(row?.income || 0);
              return { key, expense, income, net: roundMoney(income - expense), count: row?.count || 0 };
            }),
            by_category: byCategory.map((r: any) => ({ category: r._id, total: roundMoney(r.total), count: r.count })),
            by_category_period: (facets?.byCategoryPeriod ?? []).map((r: any) => ({
              category: r._id.category,
              key: r._id.period,
              total: roundMoney(r.total),
            })),
            uncategorised_by_period: (facets?.uncategorisedByPeriod ?? []).map((r: any) => ({
              key: r._id,
              total: roundMoney(r.total),
            })),
            by_person: byPersonRaw.map((r: any) => ({
              user_id: r._id,
              username: userMap.get(r._id)?.username || "Unknown",
              avatar: userMap.get(r._id)?.avatar || null,
              total: roundMoney(r.total),
              income: roundMoney(r.income),
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

  // --- Derived from history -------------------------------------------------

  /**
   * The window and currency both analyses below share.
   *
   * Currency is resolved exactly the way /summary resolves it: amounts in different
   * currencies can't be clustered or added, so each analysis is scoped to one. Returns
   * null when the book holds nothing at all, which both callers answer as an empty result
   * rather than an error.
   */
  async function analysisScope(book: any, q: Record<string, string>, defaultMonths: number) {
    const currencies: string[] = await XenBudgetItem.distinct("currency", { book_id: book._id });
    if (currencies.length === 0) return null;
    const currency = q.currency && currencies.includes(q.currency)
      ? q.currency
      : (currencies.includes(book.default_currency) ? book.default_currency : currencies[0]);

    const to = q.to ? new Date(q.to) : new Date();
    let from: Date;
    if (q.from) {
      from = new Date(q.from);
    } else {
      const months = Math.min(
        MAX_RECURRING_LOOKBACK_MONTHS,
        Math.max(1, Number(q.lookback_months) || defaultMonths),
      );
      from = new Date(to);
      from.setUTCMonth(from.getUTCMonth() - months);
    }
    return { currency, currencies, from, to };
  }

  /**
   * The rows both analyses read, each paired with the merchant it belongs to.
   *
   * Goes through baseItemMatch so "Off budget" stays excluded here exactly as it is
   * everywhere else — a row deliberately set aside must not come back as a subscription.
   * The { book_id, date } index covers this.
   *
   * The merchant is resolved ONCE, here, from the PRE-RULE text. Both matter:
   *   - once, because normalizeMerchant is real string work and both analyses plus the
   *     rule-coverage pass would otherwise each redo it over every row;
   *   - pre-rule, because a rule's set_description rewrite is a tidy-up for humans, and
   *     grouping on it would hide who was actually paid. It is also the text the rules
   *     engine itself sees on a fresh import (stripRuleEffects restores it), so a merchant
   *     name means the same thing to the recurring card, the merchant list, the items
   *     filter and the coverage check.
   */
  async function analysisRows(
    book: any, scope: { currency: string; from: Date; to: Date },
  ): Promise<{ item: any; merchant: string }[]> {
    const match = baseItemMatch(book._id, {
      currency: scope.currency,
      from: scope.from.toISOString(),
      to: scope.to.toISOString(),
      type: "expense",
    });
    // Wider than the two rollups strictly need: the coverage pass runs the real rules
    // engine, and a condition can test type, flags, category, source or date. A projection
    // that omitted them would silently evaluate rules against half an item.
    const items = await XenBudgetItem.find(match)
      .select("date amount type description original_description categories flags "
        + "category_split_type rule_categories rule_flags applied_rule_ids source")
      .sort({ date: -1 })
      .limit(MAX_ANALYSIS_ITEMS)
      .lean();

    return (items as any[]).map((item) => ({
      item,
      merchant: normalizeMerchant(item.original_description || item.description || ""),
    }));
  }

  // GET /api/xenbudget/books/:bookId/recurring?currency&lookback_months&from&to
  //
  // Subscriptions and bills, derived from what has already been imported. Read-only: the
  // real transactions keep arriving by CSV, so generating occurrences of our own would
  // only double-count them.
  app.get("/api/xenbudget/books/:bookId/recurring",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const q = req.query as Record<string, string>;

        const scope = await analysisScope(book, q, DEFAULT_RECURRING_LOOKBACK_MONTHS);
        if (!scope) {
          return res.json({
            status: true,
            message: "Recurring charges retrieved",
            data: {
              currency: book.default_currency, currencies: [],
              from: null, to: null, series: [], monthly_committed: 0,
            },
          });
        }

        const rows = await analysisRows(book, scope);
        // `now` is passed in rather than read inside the detector, so every status in one
        // response is measured against the same instant.
        //
        // The detector normalises the description itself; handing it the same PRE-RULE text
        // analysisRows keyed on is what makes a series' merchant name identical to the one
        // on the merchant list and in the items filter.
        const series = detectRecurring(
          rows.map(({ item }) => ({
            date: item.date,
            amount: item.amount,
            description: item.original_description || item.description || "",
            categories: item.categories || [],
          })),
          new Date(),
        );

        // Composed here rather than inside detectRecurring: that module is pure and knows
        // nothing about rules, and it should stay that way.
        const seriesMerchants = new Set(series.map((s) => s.merchant));
        const coverage = coverageByMerchant(
          rows.filter((r) => seriesMerchants.has(r.merchant))
            .map(({ merchant, item }) => ({ merchant, draft: toDraft(item) })),
          plainRules(book),
        );

        res.json({
          status: true,
          message: "Recurring charges retrieved",
          data: {
            currency: scope.currency,
            currencies: scope.currencies,
            from: scope.from.toISOString(),
            to: scope.to.toISOString(),
            series: series.map((s) => ({ ...s, rule_coverage: coverage.get(s.merchant) })),
            monthly_committed: monthlyCommitted(series),
          },
        });
      } catch (error) {
        console.error("Error detecting recurring charges:", error);
        res.status(500).json({ status: false, message: "Failed to detect recurring charges" });
      }
    });

  // GET /api/xenbudget/books/:bookId/merchants?currency&from&to&limit
  //
  // Where the money actually went. Category answers "what kind of spending"; this answers
  // "who was paid", which is the question a rule gets written from.
  app.get("/api/xenbudget/books/:bookId/merchants",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const q = req.query as Record<string, string>;

        const limit = Math.min(
          MAX_MERCHANT_LIMIT,
          Math.max(1, Number(q.limit) || DEFAULT_MERCHANT_LIMIT),
        );
        const scope = await analysisScope(book, q, DEFAULT_RECURRING_LOOKBACK_MONTHS);
        if (!scope) {
          return res.json({
            status: true,
            message: "Merchants retrieved",
            data: {
              currency: book.default_currency, currencies: [],
              from: null, to: null, merchants: [], total: 0, merchant_count: 0,
            },
          });
        }

        const rows = await analysisRows(book, scope);

        // Grouped in JS rather than in an aggregation pipeline: normalizeMerchant is real
        // string logic (stacked processor prefixes, reference numbers), not something
        // $regexReplace should be asked to reproduce — and keeping ONE implementation is
        // what lets a merchant row and a recurring series agree on what a merchant is.
        interface MerchantGroup {
          merchant: string; total: number; count: number;
          last_date: Date; sample_description: string; categories: string[];
        }
        const groups = new Map<string, MerchantGroup>();
        let total = 0;

        for (const { item, merchant } of rows) {
          if (!merchant) continue;
          total += item.amount || 0;

          const existing = groups.get(merchant);
          const group: MerchantGroup = existing ?? {
            merchant,
            total: 0,
            count: 0,
            // Items arrive newest first, so the first one seen is the most recent.
            last_date: item.date,
            // The pre-rule text, so the row can show what this looks like on a statement.
            sample_description: item.original_description || item.description || "",
            categories: [],
          };
          group.total += item.amount || 0;
          group.count += 1;
          for (const category of item.categories || []) {
            if (category?.name && !group.categories.includes(category.name)) {
              group.categories.push(category.name);
            }
          }
          if (!existing) groups.set(merchant, group);
        }

        const ranked = [...groups.values()].sort((a, b) => b.total - a.total);
        const page = ranked.slice(0, limit);

        // Only the merchants actually being returned: running the rules engine over every
        // row of a long book to answer a question about 25 rows would be waste. Ranking has
        // to finish first, so this can't fold into the grouping pass above.
        const shown = new Set(page.map((g) => g.merchant));
        const coverage = coverageByMerchant(
          rows.filter((r) => shown.has(r.merchant))
            .map(({ merchant, item }) => ({ merchant, draft: toDraft(item) })),
          plainRules(book),
        );

        res.json({
          status: true,
          message: "Merchants retrieved",
          data: {
            currency: scope.currency,
            currencies: scope.currencies,
            from: scope.from.toISOString(),
            to: scope.to.toISOString(),
            // The full count, so the UI can say what the tail it isn't showing amounts to.
            merchant_count: ranked.length,
            total: roundMoney(total),
            merchants: page.map((g) => ({
              merchant: g.merchant,
              sample_description: g.sample_description,
              total: roundMoney(g.total),
              count: g.count,
              average: roundMoney(g.total / g.count),
              last_date: new Date(g.last_date).toISOString(),
              categories: g.categories,
              rule_coverage: coverage.get(g.merchant),
            })),
          },
        });
      } catch (error) {
        console.error("Error building merchant rollup:", error);
        res.status(500).json({ status: false, message: "Failed to build merchant rollup" });
      }
    });

  // --- Items ---------------------------------------------------------------

  // GET /api/xenbudget/books/:bookId/items
  //   ?from&to&categories=a,b&flags=a,b&people=id,id&type&uncategorised&excluded&q&limit&cursor
  app.get("/api/xenbudget/books/:bookId/items", validateParams(xenBudgetBookIdParamSchema), async (req: Request, res: Response) => {
    try {
      const book = await loadBookForMember(req, res);
      if (!book) return;

      const q = req.query as Record<string, string>;
      const filter = baseItemMatch(book._id, q);

      // Need/Want is a classification on the category registry, not on the item, so it
      // must be resolved to names first. An item matches when ANY of its categories
      // carries the requested classification.
      if (q.need_want === "need" || q.need_want === "want") {
        const names = (book.categories || [])
          .filter((c: any) => c.need_want === q.need_want)
          .map((c: any) => c.name);
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
          filter.$and = [...(filter.$and || []), {
            $or: [{ description: rx }, { original_description: rx }],
          }];
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
        await book.populate("members", "username avatar");
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
        res.setHeader("Content-Disposition",
          `attachment; filename="xenbudget-${safeName}-items-${new Date().toISOString().slice(0, 10)}.csv"`);

        res.write(csvLine([
          "Date", "Description", "Amount", "Type", "Currency",
          "Categories", "Flags", "People", "Notes", "Source", "Card",
        ]));

        // Streamed from a cursor rather than loaded whole, the same way the book export
        // does it: a filtered view can still be tens of thousands of rows, and buffering
        // them all would spike memory per request.
        const cursor = XenBudgetItem.find(filter).sort({ date: -1, _id: -1 }).lean().cursor();
        for await (const item of cursor as any) {
          res.write(csvLine([
            new Date(item.date).toISOString().slice(0, 10),
            item.description || "",
            // Always positive on the row, with `type` carrying the sign — the same
            // convention the schema stores, so a re-import reads back what it wrote.
            item.amount,
            item.type || "expense",
            item.currency || book.default_currency,
            // A weighted category keeps its share, otherwise the row would claim the
            // whole amount landed in each of them.
            (item.categories || []).map((c: any) => (
              c.percentage != null && c.percentage < 100 ? `${c.name} (${c.percentage}%)` : c.name
            )).join("; "),
            (item.flags || []).join("; "),
            (item.shares || []).map((s: any) => usernameById.get(s.user_id) || s.user_id).join("; "),
            item.notes || "",
            item.source || "manual",
            (item.import_batch_id && batchLabels.get(item.import_batch_id.toString())) || "",
          ]));
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
      const [items, totalsRows] = await Promise.all([
        XenBudgetItem.find(filter).sort({ date: -1, _id: -1 }).limit(limit + 1).lean(),
        // Amounts in different currencies can't be added together (the same rule the
        // summary route follows), so the total is per currency and the client shows one
        // line each - which for almost every book is exactly one line.
        wantsTotals ? XenBudgetItem.aggregate([
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
        ]) : [],
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
      const nextCursor = hasMore && last ? `${new Date(last.date).toISOString()}_${last._id}` : null;

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
        // "Skip auto-tagging" leaves the item exactly as it was entered.
        const draft = draftFromRow({ ...body, source: "manual" }, book);
        const { item: ruled, skipped, skippedByRuleName } = body.skip_rules
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
        const manualCategories = ruled.rule_categories.length > 0
          ? draftCategoryWeights(ruled, ruled.amount)
          : resolveCategories(body.category_split_type || "equal", ruled.amount, body.categories || []);

        let shares;
        try {
          // A rule's set_people overrides what the form asked for.
          shares = ruled.people && ruled.people.length > 0
            ? buildRuleShares(ruled, book)
            : buildShares(body, book);
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
          category_split_type: ruled.rule_categories.length > 0
            ? (ruled.category_split_type ?? "equal")
            : (body.category_split_type || "equal"),
          rule_categories: ruled.rule_categories,
          flags: ruled.flags,
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
        if (body.date !== undefined) item.date = bookDateToUtc(new Date(body.date));
        if (body.description !== undefined) item.description = body.description;
        if (body.notes !== undefined) item.notes = body.notes;
        if (body.flags !== undefined) item.flags = body.flags;
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
            item.flags = (item.flags || []).filter((t: string) => t !== FLAG_UNCATEGORISED);
          }
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

  // POST /api/xenbudget/books/:bookId/items/:itemId/images - Upload item images
  app.post("/api/xenbudget/books/:bookId/items/:itemId/images",
    validateParams(xenBudgetItemParamSchema), uploadXenBudgetImages.array("images", MAX_XENBUDGET_IMAGES_PER_ITEM),
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

        if (!item.images) item.images = [];
        if (item.images.length + files.length > MAX_XENBUDGET_IMAGES_PER_ITEM) {
          return res.status(400).json({ status: false, message: `Cannot exceed ${MAX_XENBUDGET_IMAGES_PER_ITEM} images per item` });
        }

        for (const file of files) {
          const filename = generateUniqueFilename(file.originalname);
          const gcsPath = `xenbudget-images/${req.params.bookId}/${req.params.itemId}/${filename}`;
          await uploadToGCS(file.buffer, gcsPath, file.mimetype, true);
          item.images.push({ gcs_path: gcsPath });
        }

        await item.save();
        broadcastBook(book);
        res.json({ status: true, message: "Images uploaded", data: serializeItem(item) });
      } catch (error) {
        console.error("Error uploading item images:", error);
        res.status(500).json({ status: false, message: "Failed to upload images" });
      }
    });

  // DELETE /api/xenbudget/books/:bookId/items/:itemId/images/:imageId - Delete an item image
  app.delete("/api/xenbudget/books/:bookId/items/:itemId/images/:imageId",
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

        await deleteFromGCS(item.images[imageIndex].gcs_path, true).catch(() => { });
        item.images.splice(imageIndex, 1);
        await item.save();
        broadcastBook(book);
        res.json({ status: true, message: "Image deleted", data: serializeItem(item) });
      } catch (error) {
        console.error("Error deleting item image:", error);
        res.status(500).json({ status: false, message: "Failed to delete image" });
      }
    });

  // GET /api/xenbudget/books/:bookId/items/:itemId/image-urls - Signed URLs for item images
  app.get("/api/xenbudget/books/:bookId/items/:itemId/image-urls",
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

        const signedUrls = await Promise.all(
          item.images.map(async (img: any) => ({
            _id: img._id.toString(),
            signedUrl: await generateSignedUrl(img.gcs_path, 15),
          }))
        );

        res.json({ status: true, data: signedUrls });
      } catch (error) {
        console.error("Error generating signed URLs:", error);
        res.status(500).json({ status: false, message: "Failed to generate image URLs" });
      }
    });
};

// Search text goes into a $regex, so metacharacters in it must be literal - otherwise a
// stray "(" is a 500 and ".*" is a full scan.
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

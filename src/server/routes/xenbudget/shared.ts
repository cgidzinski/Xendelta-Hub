import { Request, Response } from "express";
import { XenBudgetBook } from "../../models/xenBudget";
import { SocketManager } from "../../infrastructure/SocketManager";

import { resolveShares, resolveCategories, roundMoney } from "../../utils/xenBudgetUtils";
import { SYSTEM_FLAGS, FLAG_NEEDS_REVIEW, FLAG_IGNORED, FLAG_OFF_BUDGET } from "../../constants";
import { normalizeFlagNames, type DraftItem, type Rule } from "../../utils/xenBudgetRules";

export const mongoose = require("mongoose");

export function callerId(req: Request): string {
  return (req.user as any)._id.toString();
}

export function memberIds(book: any): string[] {
  return (book.members as any[]).map((m: any) => (m._id ? m._id.toString() : m.toString()));
}

export function isMember(book: any, userId: string): boolean {
  return memberIds(book).includes(userId);
}

// XenSplit repeats its 404/403 block in every handler; XenBudget keeps it here so the
// membership rule is stated once. Returns null having ALREADY sent the response.
export async function loadBookForMember(req: Request, res: Response): Promise<any | null> {
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
export async function loadBookForCreator(req: Request, res: Response): Promise<any | null> {
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
export function baseItemMatch(bookId: any, q: Record<string, string>): Record<string, any> {
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

export const BUDGET_MEASURES = ["expense", "income", "saving"];

/** Anything unrecognised - including a doc still carrying the old `kind` - is an expense. */
export function normalizeMeasures(value: any): string {
  return BUDGET_MEASURES.includes(value) ? value : "expense";
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
export function ensureSystemLabels(book: any): boolean {
  let changed = false;
  for (const seed of SYSTEM_FLAGS) {
    const existing = (book.flags || []).find((t: any) => t.name.toLowerCase() === seed.name.toLowerCase());
    if (existing) {
      // Keep an existing flag's colour; only mark it as built-in if it wasn't.
      if (!existing.system) {
        existing.system = true;
        changed = true;
      }
      continue;
    }
    book.flags.push({ name: seed.name, color: seed.color, system: true });
    changed = true;
  }
  return changed;
}

/** Resolves a rule's categories into stored weights, honouring a percentage split. */
export function draftCategoryWeights(draft: DraftItem, amount: number) {
  const splitType = draft.category_split_type ?? "equal";
  const parts =
    draft.category_weights && draft.category_weights.length > 0
      ? draft.category_weights
      : (draft.categories || []).map((name) => ({ name }));
  return resolveCategories(splitType, amount, parts);
}

export function broadcastBook(book: any) {
  SocketManager.getInstance().notifyXenBudgetBookUpdate(book._id.toString(), memberIds(book));
}

// Builds the stored shares for an item, defaulting to an even split across everyone in
// the book when the caller doesn't name anyone. Throws a plain Error for a bad request so
// callers can turn it into a 400.
export function buildShares(body: any, book: any): { share_type: string; shares: any[] } {
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
export function buildRuleShares(after: any, book: any): { share_type: string; shares: any[] } {
  const people: string[] = after.people || [];
  const splitType = after.people_split_type === "percent" ? "percent" : "equal";
  const weights = after.people_weights || [];
  return buildShares(
    {
      amount: after.amount,
      share_type: splitType,
      shares: people.map((p: string) => ({
        user_id: p,
        ...(splitType === "percent" ? { percentage: weights.find((w: any) => w.user_id === p)?.percentage ?? 0 } : {}),
      })),
    },
    book,
  );
}

/** The book's rules as plain objects the (pure) engine can work with. */
export function plainRules(book: any): Rule[] {
  return (book.rules || []).map((r: any) => ({
    _id: r._id.toString(),
    name: r.name,
    enabled: r.enabled,
    priority: r.priority,
    match: {
      mode: r.match?.mode,
      conditions: (r.match?.conditions || []).map((c: any) => ({
        field: c.field,
        op: c.op,
        value: c.value,
        value2: c.value2,
        case_sensitive: c.case_sensitive,
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
export function toDraft(item: any): DraftItem {
  return {
    type: item.type,
    amount: item.amount,
    date: item.date,
    description: item.description,
    original_description: item.original_description,
    categories: (item.categories || []).map((c: any) => c.name),
    category_weights: (item.categories || []).map((c: any) => ({
      name: c.name,
      amount: c.amount,
      percentage: c.percentage,
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
export function draftFromRow(row: any, _book: any): DraftItem {
  return {
    type: row.type === "income" ? "income" : "expense",
    amount: roundMoney(Number(row.amount) || 0),
    date: row.date ? new Date(row.date) : new Date(),
    description: String(row.description || "").slice(0, 500),
    notes: String(row.notes || "").slice(0, 1000) || undefined,
    categories: Array.isArray(row.categories) ? [...row.categories] : [],
    // Normalised here rather than trusted: a manual add carries whatever the free-solo
    // flag picker produced, which is raw typed text.
    flags: normalizeFlagNames(row.flags),
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
export function bookDateToUtc(date: Date | string): Date {
  const day = new Date(date).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * The human-readable label for one import batch. The preset is the source of truth:
 * batches store only its id, so renaming a preset renames its historical imports. A
 * batch with no preset (legacy rows) keeps its stored label; a deleted preset yields
 * undefined, which callers render as a generic "Import".
 */
export function resolveBatchLabel(batch: any, book: any): string | undefined {
  if (batch.preset_id) {
    const preset = book.import_presets.id(batch.preset_id);
    if (preset?.name) return preset.name;
    return undefined;
  }
  return batch.source_label || undefined;
}

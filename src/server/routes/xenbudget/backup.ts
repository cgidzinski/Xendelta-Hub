import { Request, Response } from "express";
import { XenBudgetBook, XenBudgetItem } from "../../models/xenBudget";
import { User } from "../../models/user";
import { SocketManager } from "../../infrastructure/SocketManager";
import { validate, validateParams, xenBudgetBookIdParamSchema, xenBudgetRestoreSchema } from "../../utils/validation";
import { resolveCategories, computeImportHash, roundMoney } from "../../utils/xenBudgetUtils";

import { withDerivedUncategorised } from "../../utils/xenBudgetRules";

import { serializeBookFor } from "../../utils/xenBudgetSerializer";
import { broadcastBook, callerId, ensureSystemLabels, loadBookForCreator, loadBookForMember, mongoose } from "./shared";
import { PUBLIC_USER_FIELDS } from "../../utils/publicUser";

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

  const ids = exported.map((m) => m.user_id).filter((id): id is string => !!id && mongoose.Types.ObjectId.isValid(id));
  const usernames = exported.map((m) => m.username).filter(Boolean) as string[];

  const found = await User.find({
    $or: [
      ...(ids.length ? [{ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }] : []),
      ...(usernames.length ? [{ username: { $in: usernames } }] : []),
    ],
  })
    .select("_id username")
    .lean();

  const byId = new Map<string, any>();
  const byUsername = new Map<string, any>();
  found.forEach((u: any) => {
    byId.set(u._id.toString(), u);
    if (u.username) byUsername.set(u.username, u);
  });

  for (const entry of exported) {
    const match = (entry.user_id && byId.get(entry.user_id)) || (entry.username && byUsername.get(entry.username));
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
      set_people: (r.actions?.set_people || []).map((id: string) => remapUser(id, idMap)),
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

    const categories = resolveCategories(
      raw.category_split_type || "equal",
      amount,
      (Array.isArray(raw.categories) ? raw.categories : [])
        .map((c: any) => (typeof c === "string" ? { name: c } : c))
        .filter((c: any) => c && c.name),
    );

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
      categories,
      category_split_type: raw.category_split_type || "equal",
      rule_categories: Array.isArray(raw.rule_categories) ? raw.rule_categories : [],
      // Derived, not restored: a backup taken while the two could disagree would otherwise
      // carry the contradiction back in.
      flags: withDerivedUncategorised(raw.flags, categories),
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
export function registerBackupRoutes(app: any) {
  // --- Backup: export and restore ------------------------------------------
  //
  // Per-book, user-facing backup. scripts/db-backup.ts already does whole-database
  // NDJSON.gz backup/restore, but that is an operator tool that wipes every collection.
  // This is deliberately a different format: plain, inspectable JSON, one book.

  // GET /api/xenbudget/books/:bookId/export
  app.get(
    "/api/xenbudget/books/:bookId/export",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        await book.populate("members", PUBLIC_USER_FIELDS);

        const safeName = book.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="xenbudget-${safeName}-${new Date().toISOString().slice(0, 10)}.json"`,
        );

        // format_version is carried from day one so a future schema change can migrate an
        // older file rather than reject it.
        res.write('{\n  "format_version": 1,\n');
        res.write(`  "exported_at": ${JSON.stringify(new Date().toISOString())},\n`);
        res.write(
          `  "book": ${JSON.stringify(
            {
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
            },
            null,
            2,
          )},\n`,
        );
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
    },
  );

  // POST /api/xenbudget/books/import - restore as a NEW book
  app.post("/api/xenbudget/books/import", validate(xenBudgetRestoreSchema), async (req: Request, res: Response) => {
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
      await book.populate("members", PUBLIC_USER_FIELDS);
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
  app.post(
    "/api/xenbudget/books/:bookId/import",
    validateParams(xenBudgetBookIdParamSchema),
    validate(xenBudgetRestoreSchema),
    async (req: Request, res: Response) => {
      try {
        // scope wins over the legacy mode field; a request with neither is an items-only
        // merge, which is what a bare restore has always done.
        const scope =
          (req.body.scope as "items" | "config" | "everything" | undefined) ||
          (req.body.mode === "replace" ? "everything" : "items");
        // Config and everything overwrite book-level settings (and everything also wipes
        // items), so they are the owner's call; a plain items merge is member-safe.
        const book = scope === "items" ? await loadBookForMember(req, res) : await loadBookForCreator(req, res);
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

        await book.populate("members", PUBLIC_USER_FIELDS);
        broadcastBook(book);

        const message =
          scope === "config"
            ? "Imported settings"
            : scope === "everything"
              ? `Replaced ${removed} item${removed === 1 ? "" : "s"} with ${inserted}`
              : `Added ${inserted} item${inserted === 1 ? "" : "s"}`;

        res.json({
          status: true,
          message,
          data: {
            scope,
            restored: inserted,
            removed,
            skipped_duplicates: scope === "items" ? req.body.items.length - inserted : 0,
            unmatched_people: unmatched,
          },
        });
      } catch (error) {
        console.error("Error restoring into book:", error);
        res.status(500).json({ status: false, message: "Failed to restore into book" });
      }
    },
  );
}

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
  createXenBudgetTagSchema,
  updateXenBudgetTagSchema,
  createXenBudgetBudgetSchema,
  updateXenBudgetBudgetSchema,
  xenBudgetBookIdParamSchema,
  xenBudgetItemParamSchema,
  xenBudgetMemberParamSchema,
  xenBudgetTagParamSchema,
  xenBudgetBudgetParamSchema,
} from "../utils/validation";
import {
  resolveShares, computeImportHash, roundMoney, seedPeriods, budgetPeriodRange,
} from "../utils/xenBudgetUtils";
import { tzMonthKey, zonedWallToUtc } from "../utils/statsRange";
import { serializeBookFor, serializeBooksFor, serializeItem, serializeItems } from "../utils/xenBudgetSerializer";
import { notify } from "../utils/notificationUtils";
const mongoose = require("mongoose");

const MAX_ITEMS_PAGE = 200;

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
  if (q.tags) filter.tags = { $in: q.tags.split(",").filter(Boolean) };
  if (q.people) filter["shares.user_id"] = { $in: q.people.split(",").filter(Boolean) };
  if (q.type === "expense" || q.type === "income") filter.type = q.type;
  if (q.currency) filter.currency = q.currency;
  if (q.flagged === "true") filter.flagged = true;

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
      const { name, memberIds: requestedMemberIds, default_currency, timezone } = req.body;

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
        timezone: timezone || "America/Toronto",
        created_by: userId,
        members,
      });
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
        const { name, default_currency, timezone, archived } = req.body;
        if (name !== undefined) book.name = name;
        if (default_currency !== undefined) book.default_currency = default_currency;
        if (timezone !== undefined) book.timezone = timezone;
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

  // --- Tags ----------------------------------------------------------------
  //
  // Items store tag NAMES rather than ids, so a CSV import can name a tag without a
  // lookup and an unregistered tag still renders. The registry exists to give tags a
  // stable colour and to make renaming possible.

  app.post("/api/xenbudget/books/:bookId/tags",
    validateParams(xenBudgetBookIdParamSchema), validate(createXenBudgetTagSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const name = req.body.name.trim();
        if (book.tags.some((t: any) => t.name.toLowerCase() === name.toLowerCase())) {
          return res.status(400).json({ status: false, message: "That tag already exists" });
        }
        book.tags.push({ name, color: req.body.color });
        await book.save();
        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Tag created", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error creating tag:", error);
        res.status(500).json({ status: false, message: "Failed to create tag" });
      }
    });

  app.put("/api/xenbudget/books/:bookId/tags/:tagId",
    validateParams(xenBudgetTagParamSchema), validate(updateXenBudgetTagSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const tag = book.tags.id(req.params.tagId);
        if (!tag) return res.status(404).json({ status: false, message: "Tag not found" });

        const oldName = tag.name;
        if (req.body.name !== undefined) {
          const name = req.body.name.trim();
          if (book.tags.some((t: any) => t._id.toString() !== tag._id.toString()
            && t.name.toLowerCase() === name.toLowerCase())) {
            return res.status(400).json({ status: false, message: "That tag already exists" });
          }
          tag.name = name;
        }
        if (req.body.color !== undefined) tag.color = req.body.color;
        await book.save();

        // Items reference tags by name, so a rename has to carry across every item that
        // used the old one or they'd silently fall out of the tag's budget and reports.
        if (tag.name !== oldName) {
          await XenBudgetItem.updateMany(
            { book_id: book._id, tags: oldName },
            { $set: { "tags.$[element]": tag.name } },
            { arrayFilters: [{ element: oldName }] },
          );
        }

        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Tag updated", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error updating tag:", error);
        res.status(500).json({ status: false, message: "Failed to update tag" });
      }
    });

  // Removing a tag from the registry also strips it from every item, so a deleted tag
  // can't linger as an uncoloured ghost on rows that still carry it.
  app.delete("/api/xenbudget/books/:bookId/tags/:tagId",
    validateParams(xenBudgetTagParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const tag = book.tags.id(req.params.tagId);
        if (!tag) return res.status(404).json({ status: false, message: "Tag not found" });

        const name = tag.name;
        book.tags.pull({ _id: tag._id });
        await book.save();
        await XenBudgetItem.updateMany({ book_id: book._id, tags: name }, { $pull: { tags: name } });

        await book.populate("members", "username avatar");
        broadcastBook(book);
        res.json({ status: true, message: "Tag deleted", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error deleting tag:", error);
        res.status(500).json({ status: false, message: "Failed to delete tag" });
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
        const tz = book.timezone || "UTC";
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
          } else if (b.scope === "tag") {
            facet[`b${i}`] = [
              { $match: { ...inPeriod, tags: b.tag } },
              { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
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
                tag: b.tag,
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
        const tz = book.timezone || "UTC";

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

        // Default window: the current month in the book's timezone.
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
              byTag: [
                expenseOnly,
                { $unwind: "$tags" },
                { $group: { _id: "$tags", total: { $sum: "$amount" }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
              ],
              byPerson: [
                expenseOnly,
                { $unwind: "$shares" },
                { $group: { _id: "$shares.user_id", total: { $sum: "$shares.amount" }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
              ],
              untagged: [
                expenseOnly,
                { $match: { $or: [{ tags: { $size: 0 } }, { tags: { $exists: false } }] } },
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
        const byTag: any[] = facets?.byTag ?? [];
        const byPersonRaw: any[] = facets?.byPerson ?? [];
        const totalsRow = facets?.totals?.[0];
        const untaggedRow = facets?.untagged?.[0];

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
            by_tag: byTag.map((r: any) => ({ tag: r._id, total: roundMoney(r.total), count: r.count })),
            by_person: byPersonRaw.map((r: any) => ({
              user_id: r._id,
              username: userMap.get(r._id)?.username || "Unknown",
              avatar: userMap.get(r._id)?.avatar || null,
              total: roundMoney(r.total),
              count: r.count,
            })),
            untagged: { total: roundMoney(untaggedRow?.total || 0), count: untaggedRow?.count || 0 },
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
  //   ?from&to&tags=a,b&people=id,id&type&flagged&excluded&q&limit&cursor
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

        let shares;
        try {
          shares = buildShares(body, book);
        } catch (e: any) {
          return res.status(400).json({ status: false, message: e.message });
        }

        const amount = roundMoney(body.amount);
        const date = body.date ? new Date(body.date) : new Date();
        const item = new XenBudgetItem({
          book_id: book._id,
          type: body.type || "expense",
          amount,
          currency: body.currency || book.default_currency,
          date,
          description: body.description,
          original_description: body.description,
          notes: body.notes,
          tags: body.tags || [],
          share_type: shares.share_type,
          shares: shares.shares,
          source: "manual",
          import_hash: computeImportHash(date, amount, body.description),
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
        if (body.excluded !== undefined) {
          item.excluded = body.excluded;
          // Un-excluding by hand clears the rule's note; leaving it would keep blaming a
          // rule for a state the user has since overridden.
          if (!body.excluded) item.excluded_reason = undefined;
        }
        if (body.flagged !== undefined) {
          item.flagged = body.flagged;
          if (!body.flagged) item.flag_reason = undefined;
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

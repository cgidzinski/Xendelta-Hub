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
  xenBudgetBookIdParamSchema,
  xenBudgetItemParamSchema,
  xenBudgetMemberParamSchema,
} from "../utils/validation";
import { resolveShares, computeImportHash, roundMoney } from "../utils/xenBudgetUtils";
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

  // --- Items ---------------------------------------------------------------

  // GET /api/xenbudget/books/:bookId/items
  //   ?from&to&tags=a,b&people=id,id&type&flagged&excluded&q&limit&cursor
  app.get("/api/xenbudget/books/:bookId/items", validateParams(xenBudgetBookIdParamSchema), async (req: Request, res: Response) => {
    try {
      const book = await loadBookForMember(req, res);
      if (!book) return;

      const q = req.query as Record<string, string>;
      const filter: Record<string, any> = { book_id: book._id };

      if (q.from || q.to) {
        filter.date = {};
        if (q.from) filter.date.$gte = new Date(q.from);
        if (q.to) filter.date.$lte = new Date(q.to);
      }
      if (q.tags) filter.tags = { $in: q.tags.split(",").filter(Boolean) };
      if (q.people) filter["shares.user_id"] = { $in: q.people.split(",").filter(Boolean) };
      if (q.type === "expense" || q.type === "income") filter.type = q.type;
      if (q.flagged === "true") filter.flagged = true;
      // Excluded items are hidden by default so the list matches the totals; the items
      // tab opts in explicitly to show what the rules caught.
      if (q.excluded === "true") filter.excluded = true;
      else if (q.excluded !== "all") filter.excluded = { $ne: true };
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

import { Request, Response } from "express";
import { XenBudgetBook, XenBudgetItem } from "../../models/xenBudget";
import { User } from "../../models/user";
import { SocketManager } from "../../infrastructure/SocketManager";
import {
  validate,
  validateParams,
  createXenBudgetBookSchema,
  updateXenBudgetBookSchema,
  addXenBudgetMembersSchema,
  transferXenBudgetBookSchema,
  xenBudgetBookIdParamSchema,
  xenBudgetMemberParamSchema,
} from "../../utils/validation";

import { STARTER_CATEGORIES, FLAG_NEEDS_REVIEW, FLAG_OFF_BUDGET } from "../../constants";

import { serializeBookFor, serializeBooksFor } from "../../utils/xenBudgetSerializer";
import { notify } from "../../utils/notificationUtils";
import {
  baseItemMatch,
  broadcastBook,
  callerId,
  ensureSystemLabels,
  isMember,
  loadBookForCreator,
  loadBookForMember,
  memberIds,
  mongoose,
} from "./shared";

export function registerBookRoutes(app: any) {
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
        const users = await User.find({ _id: { $in: objectIds } })
          .select("_id")
          .lean();
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
  app.get(
    "/api/xenbudget/books/:bookId",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
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
        res.json({
          status: true,
          message: "Book retrieved",
          data: serializeBookFor(book, callerId(req), count, reviewCount, needsReviewCount),
        });
      } catch (error) {
        console.error("Error fetching book:", error);
        res.status(500).json({ status: false, message: "Failed to fetch book" });
      }
    },
  );

  // PUT /api/xenbudget/books/:bookId - any member may rename/retime the book
  app.put(
    "/api/xenbudget/books/:bookId",
    validateParams(xenBudgetBookIdParamSchema),
    validate(updateXenBudgetBookSchema),
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
    },
  );

  // DELETE /api/xenbudget/books/:bookId - owner only; takes the items with it
  app.delete(
    "/api/xenbudget/books/:bookId",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
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
    },
  );

  // --- Members -------------------------------------------------------------

  // POST /api/xenbudget/books/:bookId/members - owner only
  app.post(
    "/api/xenbudget/books/:bookId/members",
    validateParams(xenBudgetBookIdParamSchema),
    validate(addXenBudgetMembersSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForCreator(req, res);
        if (!book) return;
        const existing = memberIds(book);
        const objectIds = req.body.memberIds.map((id: string) => new mongoose.Types.ObjectId(id));
        const users = await User.find({ _id: { $in: objectIds } })
          .select("_id")
          .lean();

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
    },
  );

  // DELETE /api/xenbudget/books/:bookId/members/:userId - owner removing anyone, or a
  // member leaving. The owner can't leave their own book; they transfer or delete it.
  app.delete(
    "/api/xenbudget/books/:bookId/members/:userId",
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
          return res
            .status(400)
            .json({ status: false, message: "Transfer or delete the book instead of removing its owner" });
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
    },
  );

  // POST /api/xenbudget/books/:bookId/transfer - hand the book to another member
  app.post(
    "/api/xenbudget/books/:bookId/transfer",
    validateParams(xenBudgetBookIdParamSchema),
    validate(transferXenBudgetBookSchema),
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
    },
  );
}

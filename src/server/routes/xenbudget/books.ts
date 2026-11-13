import { Request, Response } from "express";
import { AppError } from "../../utils/http";
import { accessOf, canManage } from "../../utils/membership";
import { XenBudgetBook, XenBudgetItem } from "../../models/xenBudget";
import { removeItemPhotos } from "../../utils/xenBudgetFiles";
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
import { PUBLIC_USER_FIELDS } from "../../utils/publicUser";
import { addRefused } from "../../social/policy";
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
    const userId = callerId(req);
    const books = await XenBudgetBook.find({ members: userId })
      .populate("members", PUBLIC_USER_FIELDS)
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
  });

  // POST /api/xenbudget/books
  app.post("/api/xenbudget/books", validate(createXenBudgetBookSchema), async (req: Request, res: Response) => {
    const userId = callerId(req);
    const { name, memberIds: requestedMemberIds, default_currency } = req.body;
    if (addRefused(res, userId, requestedMemberIds ?? [])) return;

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
    await book.populate("members", PUBLIC_USER_FIELDS);

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
  });

  // GET /api/xenbudget/books/:bookId
  app.get(
    "/api/xenbudget/books/:bookId",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      // Self-healing: a book that predates a newly added built-in gets it here rather
      // than needing a migration.
      if (ensureSystemLabels(book)) await book.save();
      await book.populate("members", PUBLIC_USER_FIELDS);
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
    },
  );

  // PUT /api/xenbudget/books/:bookId - any member may rename/retime the book
  app.put(
    "/api/xenbudget/books/:bookId",
    validateParams(xenBudgetBookIdParamSchema),
    validate(updateXenBudgetBookSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const { name, default_currency, archived } = req.body;
      if (name !== undefined) book.name = name;
      if (default_currency !== undefined) book.default_currency = default_currency;
      if (archived !== undefined) book.archived = archived;
      await book.save();
      await book.populate("members", PUBLIC_USER_FIELDS);
      broadcastBook(book);
      SocketManager.getInstance().notifyXenBudgetBooksUpdated(memberIds(book));
      res.json({ status: true, message: "Book updated", data: serializeBookFor(book, callerId(req)) });
    },
  );

  // DELETE /api/xenbudget/books/:bookId - owner only; takes the items with it
  app.delete(
    "/api/xenbudget/books/:bookId",
    validateParams(xenBudgetBookIdParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForCreator(req);
      const notifyIds = memberIds(book);
      const withPhotos = await XenBudgetItem.find(
        { book_id: book._id, "images.0": { $exists: true } },
        "images",
      ).lean();
      await XenBudgetItem.deleteMany({ book_id: book._id });
      await XenBudgetBook.deleteOne({ _id: book._id });
      await removeItemPhotos(withPhotos.flatMap((i) => i.images ?? []));
      SocketManager.getInstance().notifyXenBudgetBooksUpdated(notifyIds);
      res.json({ status: true, message: "Book deleted" });
    },
  );

  // --- Members -------------------------------------------------------------

  // POST /api/xenbudget/books/:bookId/members - owner only
  app.post(
    "/api/xenbudget/books/:bookId/members",
    validateParams(xenBudgetBookIdParamSchema),
    validate(addXenBudgetMembersSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForCreator(req);
      if (addRefused(res, callerId(req), req.body.memberIds)) return;
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
        throw new AppError(400, "Those users are already members");
      }
      await book.save();
      await book.populate("members", PUBLIC_USER_FIELDS);

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
    },
  );

  // DELETE /api/xenbudget/books/:bookId/members/:userId - owner removing anyone, or a
  // member leaving. The owner can't leave their own book; they transfer or delete it.
  app.delete(
    "/api/xenbudget/books/:bookId/members/:userId",
    validateParams(xenBudgetMemberParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForMember(req);
      const userId = callerId(req);
      const target = req.params.userId;

      if (target !== userId && !canManage(accessOf(book), userId)) {
        throw new AppError(403, "Only the book owner can remove other members");
      }
      if (canManage(accessOf(book), target)) {
        throw new AppError(400, "Transfer or delete the book instead of removing its owner");
      }
      if (!isMember(book, target)) {
        throw new AppError(404, "That user is not a member");
      }

      const notifyIds = memberIds(book);
      book.members = book.members.filter((m: any) => m.toString() !== target);
      await book.save();
      await book.populate("members", PUBLIC_USER_FIELDS);
      SocketManager.getInstance().notifyXenBudgetBooksUpdated(notifyIds);
      broadcastBook(book);
      res.json({ status: true, message: "Member removed", data: serializeBookFor(book, userId) });
    },
  );

  // POST /api/xenbudget/books/:bookId/transfer - hand the book to another member
  app.post(
    "/api/xenbudget/books/:bookId/transfer",
    validateParams(xenBudgetBookIdParamSchema),
    validate(transferXenBudgetBookSchema),
    async (req: Request, res: Response) => {
      const book = await loadBookForCreator(req);
      const target = req.body.userId;
      if (!isMember(book, target)) {
        throw new AppError(400, "The new owner must already be a member");
      }
      book.created_by = target;
      await book.save();
      await book.populate("members", PUBLIC_USER_FIELDS);
      broadcastBook(book);
      SocketManager.getInstance().notifyXenBudgetBooksUpdated(memberIds(book));
      notify(target, {
        title: "You now own a budget book",
        message: `You were made the owner of "${book.name}"`,
        link: `/internal/xenbudget/books/${book._id}/overview`,
        icon: "account_balance_wallet",
      });
      res.json({ status: true, message: "Book transferred", data: serializeBookFor(book, callerId(req)) });
    },
  );
}

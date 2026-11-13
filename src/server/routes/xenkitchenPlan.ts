import express = require("express");
import { XenKitchenBook, XenKitchenItem, XenKitchenPlan } from "../models/xenKitchen";
import { authenticateToken } from "../middleware/auth";
import {
  validate,
  validateParams,
  validateQuery,
  xenKitchenPlanBookParamSchema,
  xenKitchenPlanCreateSchema,
  xenKitchenPlanEntryParamSchema,
  xenKitchenPlanRangeQuerySchema,
  xenKitchenPlanShoppingSchema,
  xenKitchenPlanUpdateSchema,
} from "../utils/validation";
import { AppError, callerId } from "../utils/http";
import { canEdit, canView } from "../utils/xenKitchen";
import { buildShoppingList } from "../../shared/xenkitchen/shopping";

// The meal plan (utils/validation/xenkitchenPlan.ts): recipes planned for days, per book. Everyone in the book sees it;
// editors change it; viewers can read it and make a shopping list. A non-member gets a 404, so ids can't be probed.

const MAX_PER_DAY = 12;
const MAX_PER_BOOK = 2000;

async function loadBook(uid: string, id: string, need: "view" | "edit") {
  const book = await XenKitchenBook.findById(id).lean();
  if (!book || !canView(book, uid)) throw new AppError(404, "Book not found");
  if (need === "edit" && !canEdit(book, uid)) throw new AppError(403, "You can view this book but not change it");
  return book;
}

/** Entries in a range, each with its recipe. An entry whose recipe is gone or has left the book is dropped and removed. */
async function planFor(bookId: string, from: string, to: string) {
  const entries = await XenKitchenPlan.find({ book_id: bookId, date: { $gte: from, $lte: to } })
    .sort({ date: 1, created_at: 1 })
    .lean();
  const items = await XenKitchenItem.find(
    { _id: { $in: entries.map((e) => e.item_id) }, book_id: bookId },
    "title servings ingredients",
  ).lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));
  const dangling = entries.filter((e) => !byId.has(String(e.item_id)));
  if (dangling.length > 0) await XenKitchenPlan.deleteMany({ _id: { $in: dangling.map((e) => e._id) } });
  return entries.flatMap((e) => {
    const item = byId.get(String(e.item_id));
    return item ? [{ entry: e, item }] : [];
  });
}

const serialize = ({ entry, item }: Awaited<ReturnType<typeof planFor>>[number]) => ({
  _id: String(entry._id),
  date: entry.date,
  item_id: String(item._id),
  title: item.title || "Untitled",
  servings: entry.servings ?? null,
  recipe_servings: item.servings ?? null,
});

module.exports = function (app: express.Application) {
  app.get(
    "/api/xenkitchen/books/:bookId/plan",
    authenticateToken,
    validateParams(xenKitchenPlanBookParamSchema),
    validateQuery(xenKitchenPlanRangeQuerySchema),
    async (req, res) => {
      const { from, to } = xenKitchenPlanRangeQuerySchema.parse(req.query);
      await loadBook(callerId(req), req.params.bookId as string, "view");
      const plan = await planFor(req.params.bookId as string, from, to);
      res.json({ status: true, data: { entries: plan.map(serialize) } });
    },
  );

  app.post(
    "/api/xenkitchen/books/:bookId/plan",
    authenticateToken,
    validateParams(xenKitchenPlanBookParamSchema),
    validate(xenKitchenPlanCreateSchema),
    async (req, res) => {
      const bookId = req.params.bookId as string;
      const body = xenKitchenPlanCreateSchema.parse(req.body);
      await loadBook(callerId(req), bookId, "edit");
      const item = await XenKitchenItem.findOne({ _id: body.item_id, book_id: bookId }, "title servings").lean();
      if (!item) throw new AppError(404, "That recipe isn't in this book");
      if ((await XenKitchenPlan.countDocuments({ book_id: bookId, date: body.date })) >= MAX_PER_DAY) {
        throw new AppError(400, `A day can have up to ${MAX_PER_DAY} meals`);
      }
      if ((await XenKitchenPlan.countDocuments({ book_id: bookId })) >= MAX_PER_BOOK) {
        throw new AppError(400, "This plan is full. Remove some old meals first.");
      }
      const entry = await XenKitchenPlan.create({
        book_id: bookId,
        date: body.date,
        item_id: body.item_id,
        servings: body.servings ?? null,
        created_by: callerId(req),
      });
      res.status(201).json({ status: true, data: { entry: serialize({ entry: entry.toObject(), item }) } });
    },
  );

  async function loadEntry(req: express.Request, need: "view" | "edit") {
    const entry = await XenKitchenPlan.findById(req.params.entryId);
    if (!entry) throw new AppError(404, "Not found");
    await loadBook(callerId(req), String(entry.book_id), need);
    return entry;
  }

  app.put(
    "/api/xenkitchen/plan/:entryId",
    authenticateToken,
    validateParams(xenKitchenPlanEntryParamSchema),
    validate(xenKitchenPlanUpdateSchema),
    async (req, res) => {
      const body = xenKitchenPlanUpdateSchema.parse(req.body);
      const entry = await loadEntry(req, "edit");
      if (body.date !== undefined) entry.date = body.date;
      if (body.servings !== undefined) entry.servings = body.servings;
      await entry.save();
      const item = await XenKitchenItem.findOne(
        { _id: entry.item_id, book_id: entry.book_id },
        "title servings",
      ).lean();
      if (!item) throw new AppError(404, "That recipe is gone");
      res.json({ status: true, data: { entry: serialize({ entry: entry.toObject(), item }) } });
    },
  );

  app.delete(
    "/api/xenkitchen/plan/:entryId",
    authenticateToken,
    validateParams(xenKitchenPlanEntryParamSchema),
    async (req, res) => {
      const entry = await loadEntry(req, "edit");
      await entry.deleteOne();
      res.json({ status: true, message: "Removed" });
    },
  );

  // A shopping list for the meals planned in a range: nothing is stored, the list is made when asked for.
  app.post(
    "/api/xenkitchen/books/:bookId/plan/shopping-list",
    authenticateToken,
    validateParams(xenKitchenPlanBookParamSchema),
    validate(xenKitchenPlanShoppingSchema),
    async (req, res) => {
      const { from, to } = xenKitchenPlanShoppingSchema.parse(req.body);
      await loadBook(callerId(req), req.params.bookId as string, "view");
      const plan = await planFor(req.params.bookId as string, from, to);
      const lines = buildShoppingList(
        plan.map(({ entry, item }) => ({
          title: item.title || "Untitled",
          servings: entry.servings ?? null,
          recipeServings: item.servings ?? null,
          ingredients: item.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
        })),
      );
      res.json({ status: true, data: { from, to, meals: plan.length, lines } });
    },
  );
};

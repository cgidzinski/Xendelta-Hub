import { Request, Response } from "express";
import {
  validate,
  validateParams,
  createXenBudgetBudgetSchema,
  updateXenBudgetBudgetSchema,
  xenBudgetBookIdParamSchema,
  xenBudgetBudgetParamSchema,
} from "../../utils/validation";
import { roundMoney } from "../../utils/xenBudgetUtils";

import { serializeBookFor } from "../../utils/xenBudgetSerializer";
import { broadcastBook, callerId, isMember, loadBookForMember, normalizeMeasures } from "./shared";
import { PUBLIC_USER_FIELDS } from "../../utils/publicUser";

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
export function registerBudgetRoutes(app: any) {
  // --- Budgets -------------------------------------------------------------

  app.post(
    "/api/xenbudget/books/:bookId/budgets",
    validateParams(xenBudgetBookIdParamSchema),
    validate(createXenBudgetBudgetSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const error = validateBudgetTarget(req.body, book);
        if (error) return res.status(400).json({ status: false, message: error });

        book.budgets.push(toBudgetFields(req.body));
        await book.save();
        await book.populate("members", PUBLIC_USER_FIELDS);
        broadcastBook(book);
        res.json({ status: true, message: "Budget created", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error creating budget:", error);
        res.status(500).json({ status: false, message: "Failed to create budget" });
      }
    },
  );

  app.put(
    "/api/xenbudget/books/:bookId/budgets/:budgetId",
    validateParams(xenBudgetBudgetParamSchema),
    validate(updateXenBudgetBudgetSchema),
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
        await book.populate("members", PUBLIC_USER_FIELDS);
        broadcastBook(book);
        res.json({ status: true, message: "Budget updated", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error updating budget:", error);
        res.status(500).json({ status: false, message: "Failed to update budget" });
      }
    },
  );

  app.delete(
    "/api/xenbudget/books/:bookId/budgets/:budgetId",
    validateParams(xenBudgetBudgetParamSchema),
    async (req: Request, res: Response) => {
      try {
        const book = await loadBookForMember(req, res);
        if (!book) return;
        const budget = book.budgets.id(req.params.budgetId);
        if (!budget) return res.status(404).json({ status: false, message: "Budget not found" });
        book.budgets.pull({ _id: budget._id });
        await book.save();
        await book.populate("members", PUBLIC_USER_FIELDS);
        broadcastBook(book);
        res.json({ status: true, message: "Budget deleted", data: serializeBookFor(book, callerId(req)) });
      } catch (error) {
        console.error("Error deleting budget:", error);
        res.status(500).json({ status: false, message: "Failed to delete budget" });
      }
    },
  );
}

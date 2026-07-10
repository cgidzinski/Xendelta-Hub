import { Request, Response } from "express";
const XenSplit = require("../models/xenSplit");
const { User } = require("../models/user");
const Notification = require("../models/notification");
import { authenticateToken } from "../middleware/auth";
import { SocketManager } from "../infrastructure/SocketManager";
import { uploadXenSplitImages } from "../config/multer";
import { uploadToGCS, deleteFromGCS, generateSignedUrl } from "../utils/gcsUtils";
import { generateUniqueFilename, uploadXenSplitGroupImageFile } from "../utils/mediaUtils";
import { MAX_XENSPLIT_IMAGES_PER_EXPENSE } from "../constants";
import {
  validate,
  validateParams,
  createXenSplitSchema,
  updateXenSplitSchema,
  addXenSplitMembersSchema,
  createExpenseSchema,
  updateExpenseSchema,
  settleDebtSchema,
  xenSplitIdParamSchema,
  xenSplitMemberParamSchema,
  xenSplitExpenseParamSchema,
  xenSplitExpenseImageParamSchema,
  xenSplitSettlementParamSchema,
  createExchangeSchema,
  xenSplitExchangeParamSchema,
} from "../utils/validation";
import { calculateBalances, calculateSimplifiedTransfers } from "../utils/xenSplitUtils";

async function notify(userId: string, title: string, message: string, link?: string, icon = "announcement") {
  try {
    const n = new Notification({ userId, title, message, time: new Date().toISOString(), icon, unread: true, link });
    await n.save();
    SocketManager.getInstance().sendNotification(userId, n);
  } catch (e) { console.error("Notification failed:", e); }
}

function sanitizeSecondaryCurrencies(primary: string, secondaries: string[]): string[] {
  return Array.from(new Set(secondaries.filter((c: string) => c !== primary)));
}

function transformMembers(obj: any): any {
  return {
    ...obj,
    members: Array.isArray(obj.members)
      ? obj.members.map((m: any) =>
        m._id
          ? { user_id: m._id.toString(), username: m.username || "Unknown", avatar: m.avatar || null }
          : { user_id: m.toString(), username: "Unknown", avatar: null }
      )
      : obj.members,
  };
}

const RATE_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const rateCache = new Map<string, { rate: number; fetchedAt: number }>();

module.exports = function (app: any) {
  // Apply auth middleware to all xensplit routes
  app.use("/api/xensplit", authenticateToken);

  // GET /api/xensplit/groups - List all groups for current user
  app.get("/api/xensplit/groups", async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const groups = await XenSplit.find({ members: userId })
        .populate("members", "username avatar")
        .sort({ created_at: -1 });

      const data = groups.map((g: any) => transformMembers(g.toObject()));
      res.json({ status: true, message: "Groups retrieved", data });
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ status: false, message: "Failed to fetch groups" });
    }
  });

  // POST /api/xensplit/groups - Create new group
  app.post("/api/xensplit/groups", validate(createXenSplitSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { name, memberIds, default_currency, secondary_currencies } = req.body;

      const members: string[] = [userId];
      if (memberIds && memberIds.length > 0) {
        const mongoose = require("mongoose");
        const objectIds = memberIds.map((id: string) => new mongoose.Types.ObjectId(id));
        const users = await User.find({ _id: { $in: objectIds } }).select("_id").lean();
        for (const u of users) {
          const uid = (u._id as any).toString();
          if (uid !== userId && !members.includes(uid)) {
            members.push(uid);
          }
        }
      }

      const primaryCurrency = default_currency || "CAD";
      const group = new XenSplit({
        name,
        default_currency: primaryCurrency,
        secondary_currencies: sanitizeSecondaryCurrencies(primaryCurrency, secondary_currencies || []),
        created_by: userId,
        members,
        expenses: [],
        settlements: [],
      });

      await group.save();
      await group.populate("members", "username avatar");
      const allMemberIds = (group.members as any[]).map((m: any) => m._id.toString());
      SocketManager.getInstance().notifyXenSplitGroupsUpdated(allMemberIds);
      res.json({ status: true, message: "Group created", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).json({ status: false, message: "Failed to create group" });
    }
  });

  // GET /api/xensplit/groups/:groupId - Get group details
  app.get("/api/xensplit/groups/:groupId", validateParams(xenSplitIdParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      // Check if user is a member
      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      await group.populate("members", "username avatar");
      const groupObj = group.toObject();
      const memberMap: any = {};
      groupObj.members = groupObj.members.map((m: any) => {
        const transformed = { user_id: m._id.toString(), username: m.username || "Unknown", avatar: m.avatar || null };
        memberMap[transformed.user_id] = transformed;
        return transformed;
      });
      // Enrich expenses with payer info from members
      groupObj.expenses = groupObj.expenses.map((expense: any) => ({
        ...expense,
        payer: memberMap[expense.paid_by] || null,
      }));

      res.json({ status: true, message: "Group retrieved", data: groupObj });
    } catch (error) {
      console.error("Error fetching group:", error);
      res.status(500).json({ status: false, message: "Failed to fetch group" });
    }
  });

  // PUT /api/xensplit/groups/:groupId - Update group
  app.put("/api/xensplit/groups/:groupId", validateParams(xenSplitIdParamSchema), validate(updateXenSplitSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;
      const { name, default_currency, secondary_currencies } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Only the creator can update the group" });
      }

      if (name) group.name = name;
      if (default_currency) group.default_currency = default_currency;
      if (secondary_currencies !== undefined || default_currency) {
        group.secondary_currencies = sanitizeSecondaryCurrencies(group.default_currency, secondary_currencies ?? group.secondary_currencies);
      }
      await group.save();
      await group.populate("members", "username avatar");
      res.json({ status: true, message: "Group updated", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error updating group:", error);
      res.status(500).json({ status: false, message: "Failed to update group" });
    }
  });

  // POST /api/xensplit/groups/:groupId/image - Upload/replace the group image (creator only)
  app.post("/api/xensplit/groups/:groupId/image", validateParams(xenSplitIdParamSchema), uploadXenSplitImages.single("image"), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Only the creator can update the group image" });
      }

      if (!req.file) {
        return res.status(400).json({ status: false, message: "No image provided" });
      }

      const { url } = await uploadXenSplitGroupImageFile(req.file, groupId);
      group.image_url = url;
      await group.save();
      await group.populate("members", "username avatar");
      res.json({ status: true, message: "Group image updated", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error uploading group image:", error);
      res.status(500).json({ status: false, message: "Failed to upload group image" });
    }
  });

  // DELETE /api/xensplit/groups/:groupId - Delete group
  app.delete("/api/xensplit/groups/:groupId", validateParams(xenSplitIdParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Only the creator can delete the group" });
      }

      await XenSplit.findByIdAndDelete(groupId);
      res.json({ status: true, message: "Group deleted" });
    } catch (error) {
      console.error("Error deleting group:", error);
      res.status(500).json({ status: false, message: "Failed to delete group" });
    }
  });

  // POST /api/xensplit/groups/:groupId/transfer - Transfer ownership
  app.post("/api/xensplit/groups/:groupId/transfer", validateParams(xenSplitIdParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;
      const { newOwnerId } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      // Only creator can transfer
      if (group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Only the creator can transfer ownership" });
      }

      // Verify new owner is a member
      if (!group.members.some((m: any) => m.toString() === newOwnerId)) {
        return res.status(400).json({ status: false, message: "New owner must be a member" });
      }

      group.created_by = newOwnerId;
      await group.save();
      await group.populate("members", "username avatar");

      await notify(newOwnerId, "Group Ownership", `You are now the owner of ${group.name}`, `/internal/xensplit/groups/${groupId}/overview`, "person");

      res.json({ status: true, message: "Ownership transferred", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error transferring ownership:", error);
      res.status(500).json({ status: false, message: "Failed to transfer ownership" });
    }
  });

  // POST /api/xensplit/groups/:groupId/members - Add members
  app.post("/api/xensplit/groups/:groupId/members", validateParams(xenSplitIdParamSchema), validate(addXenSplitMembersSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;
      const { memberIds } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      const mongoose = require("mongoose");
      const objectIds = memberIds.map((id: string) => new mongoose.Types.ObjectId(id));
      const users = await User.find({ _id: { $in: objectIds } }).select("_id").lean();
      const newMemberIds: string[] = [];
      for (const u of users) {
        const uid = (u._id as any).toString();
        if (!group.members.some((m: any) => m.toString() === uid)) {
          group.members.push(uid);
          newMemberIds.push(uid);
        }
      }

      await group.save();
      await group.populate("members", "username avatar");

      for (const memberId of newMemberIds) {
        await notify(memberId, "Added to Group", `You've been added to ${group.name}`, `/internal/xensplit/groups/${groupId}/overview`, "person");
      }

      res.json({ status: true, message: "Members added", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error adding members:", error);
      res.status(500).json({ status: false, message: "Failed to add members" });
    }
  });

  // DELETE /api/xensplit/groups/:groupId/members/:userId - Remove member (leave)
  app.delete("/api/xensplit/groups/:groupId/members/:userId", validateParams(xenSplitMemberParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId, userId: targetUserId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      // Can only remove self or if you're the creator
      if (targetUserId !== userId && group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Cannot remove this member" });
      }

      // Check for outstanding balances
      const groupForCalc = { ...group.toObject(), members: group.toObject().members.map((m: any) => m.toString()) };
      const balances = calculateBalances(groupForCalc);
      const userBalance = balances[targetUserId] || {};
      const hasOutstanding = Object.values(userBalance).some((b: number) => Math.abs(b) > 0.01);
      const isCreatorRemoving = group.created_by === userId && targetUserId !== userId;

      // Block if member has outstanding balance and is leaving voluntarily (not being removed by creator)
      if (hasOutstanding && targetUserId === userId && !isCreatorRemoving) {
        return res.status(400).json({
          status: false,
          message: "You have an outstanding balance. Please settle up before leaving."
        });
      }

      // If creator is leaving, transfer ownership to next member
      if (group.created_by === targetUserId) {
        const remainingMembers = group.members.filter((m: any) => m.toString() !== targetUserId);
        if (remainingMembers.length > 0) {
          group.created_by = remainingMembers[0].toString();
        }
      }

      group.members = group.members.filter((m: any) => m.toString() !== targetUserId);
      await group.save();
      await group.populate("members", "username avatar");

      // Notify removed user if they were removed by someone else (not a voluntary leave)
      if (targetUserId !== userId) {
        await notify(targetUserId, "Removed from Group", `You've been removed from ${group.name}`, undefined, "person");
      }

      // Delete group if no members left
      if (group.members.length === 0) {
        await XenSplit.findByIdAndDelete(groupId);
        return res.json({ status: true, message: "Member removed and group deleted" });
      }

      res.json({ status: true, message: "Member removed", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error removing member:", error);
      res.status(500).json({ status: false, message: "Failed to remove member" });
    }
  });

  // POST /api/xensplit/groups/:groupId/expenses - Add expense
  app.post("/api/xensplit/groups/:groupId/expenses", validateParams(xenSplitIdParamSchema), validate(createExpenseSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;
      const { paid_by, amount, currency, title, notes, category, date, split_type, splits, on_hold, do_not_simplify } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      // Validate payer is a member
      if (!group.members.some((m: any) => m.toString() === paid_by)) {
        return res.status(400).json({ status: false, message: "Payer must be a group member" });
      }

      // Resolve splits
      let resolvedSplits = splits || [];
      if (split_type === "equal") {
        // Use provided participant list if given, otherwise fall back to all members
        const participants = (splits && splits.length > 0)
          ? splits.map((s: any) => s.user_id)
          : group.members.map((m: any) => m.toString());
        const perPerson = amount / participants.length;
        resolvedSplits = participants.map((pid: string) => ({ user_id: pid, amount_owed: perPerson }));
      } else if (split_type === "percent") {
        resolvedSplits = splits.map((s: any) => ({
          user_id: s.user_id,
          amount_owed: (amount * s.percentage) / 100,
          percentage: s.percentage,
        }));
        // Auto-adjust: ensure percentages sum to 100
        const percentSum = resolvedSplits.reduce((acc: number, s: any) => acc + (s.percentage || 0), 0);
        const percentDiff = 100 - percentSum;
        if (Math.abs(percentDiff) > 0.001 && resolvedSplits.length > 0) {
          resolvedSplits[resolvedSplits.length - 1].percentage += percentDiff;
          resolvedSplits[resolvedSplits.length - 1].amount_owed = (amount * resolvedSplits[resolvedSplits.length - 1].percentage) / 100;
        }
      } else if (split_type === "exact") {
        // Auto-adjust: ensure exact amounts sum to total
        const exactSum = resolvedSplits.reduce((acc: number, s: any) => acc + (s.amount_owed || 0), 0);
        const exactDiff = amount - exactSum;
        if (Math.abs(exactDiff) > 0.001 && resolvedSplits.length > 0) {
          resolvedSplits[resolvedSplits.length - 1].amount_owed += exactDiff;
        }
      }

      const expenseCurrency = currency || group.default_currency || "CAD";
      const expense = {
        paid_by,
        created_by: userId,
        amount,
        currency: expenseCurrency,
        title,
        notes,
        category: category || undefined,
        date: date ? new Date(date) : new Date(),
        split_type,
        splits: resolvedSplits,
        on_hold: on_hold === true,
        do_not_simplify: do_not_simplify === true,
        created_at: new Date(),
      };

      group.expenses.push(expense as any);
      await group.save();
      await group.populate("members", "username avatar");

      const actor = (group.members as any[]).find((m: any) => m._id.toString() === userId);
      const actorName = actor?.username || "Someone";
      const involvedIds = new Set<string>([
        paid_by,
        ...resolvedSplits.map((s: any) => s.user_id.toString()),
      ]);
      for (const member of group.members as any[]) {
        const mid = member._id.toString();
        if (mid !== userId && involvedIds.has(mid)) {
          await notify(mid, "New Expense", `${actorName} added: ${title} (${amount} ${expenseCurrency})`, `/internal/xensplit/groups/${groupId}/expenses`);
        }
      }

      const memberIds = (group.members as any[]).map((m: any) => m._id.toString());
      SocketManager.getInstance().notifyXenSplitGroupUpdate(groupId, memberIds);

      const newExpense = group.expenses[group.expenses.length - 1];
      res.json({ status: true, message: "Expense added", data: { group: transformMembers(group.toObject()), newExpenseId: newExpense._id } });
    } catch (error) {
      console.error("Error adding expense:", error);
      res.status(500).json({ status: false, message: "Failed to add expense" });
    }
  });

  // PUT /api/xensplit/groups/:groupId/expenses/:expenseId - Update expense
  app.put("/api/xensplit/groups/:groupId/expenses/:expenseId", validateParams(xenSplitExpenseParamSchema), validate(updateExpenseSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId, expenseId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      const expenseIndex = group.expenses.findIndex((e: any) => e._id.toString() === expenseId);
      if (expenseIndex === -1) {
        return res.status(404).json({ status: false, message: "Expense not found" });
      }

      const expense = group.expenses[expenseIndex];

      // Only the expense creator or group owner may edit
      if (expense.created_by && expense.created_by !== userId && group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Not authorised to edit this expense" });
      }

      const updates = req.body;
      if (updates.paid_by !== undefined) expense.paid_by = updates.paid_by;
      if (updates.amount !== undefined) expense.amount = updates.amount;
      if (updates.currency !== undefined) expense.currency = updates.currency;
      if (updates.title !== undefined) expense.title = updates.title;
      if (updates.notes !== undefined) expense.notes = updates.notes;
      if (updates.category !== undefined) expense.category = updates.category || undefined;
      if (updates.date !== undefined) expense.date = new Date(updates.date);
      if (updates.split_type !== undefined) expense.split_type = updates.split_type;
      if (updates.splits !== undefined) expense.splits = updates.splits;
      if (updates.on_hold !== undefined) {
        const isGroupCreator = group.created_by === userId;
        if (!isGroupCreator && updates.on_hold === true && expense.on_hold !== true) {
          return res.status(400).json({ status: false, message: "Cannot re-hold an expense that has already been active" });
        }
        expense.on_hold = updates.on_hold;
      }
      if (updates.do_not_simplify !== undefined) expense.do_not_simplify = updates.do_not_simplify;

      // Recalculate splits if needed
      if (updates.split_type || updates.amount) {
        const amount = expense.amount;
        const split_type = expense.split_type;

        if (split_type === "equal") {
          // Use existing split participants if present, otherwise fall back to all members
          const participants = (expense.splits && expense.splits.length > 0)
            ? expense.splits.map((s: any) => s.user_id)
            : group.members.map((m: any) => m.toString());
          const perPerson = amount / participants.length;
          expense.splits = participants.map((pid: string) => ({ user_id: pid, amount_owed: perPerson }));
        } else if (split_type === "percent" && expense.splits) {
          expense.splits = expense.splits.map((s: any) => ({
            ...s,
            amount_owed: (amount * s.percentage) / 100,
          }));
          // Auto-adjust percentages to sum to 100
          const percentSum = expense.splits.reduce((acc: number, s: any) => acc + (s.percentage || 0), 0);
          const percentDiff = 100 - percentSum;
          if (Math.abs(percentDiff) > 0.001 && expense.splits.length > 0) {
            expense.splits[expense.splits.length - 1].percentage += percentDiff;
            expense.splits[expense.splits.length - 1].amount_owed = (amount * expense.splits[expense.splits.length - 1].percentage) / 100;
          }
        } else if (split_type === "exact" && expense.splits) {
          // Auto-adjust exact amounts to sum to total
          const exactSum = expense.splits.reduce((acc: number, s: any) => acc + (s.amount_owed || 0), 0);
          const exactDiff = amount - exactSum;
          if (Math.abs(exactDiff) > 0.001 && expense.splits.length > 0) {
            expense.splits[expense.splits.length - 1].amount_owed += exactDiff;
          }
        }
      }

      await group.save();
      await group.populate("members", "username avatar");

      const actor = (group.members as any[]).find((m: any) => m._id.toString() === userId);
      const actorName = actor?.username || "Someone";
      const involvedIds = new Set<string>([
        expense.paid_by?.toString(),
        ...(expense.splits || []).map((s: any) => s.user_id.toString()),
      ]);
      for (const member of group.members as any[]) {
        const mid = member._id.toString();
        if (mid !== userId && involvedIds.has(mid)) {
          await notify(mid, "Expense Updated", `${actorName} updated: ${expense.title}`, `/internal/xensplit/groups/${groupId}/expenses`);
        }
      }

      const updatedMemberIds = (group.members as any[]).map((m: any) => m._id.toString());
      SocketManager.getInstance().notifyXenSplitGroupUpdate(groupId, updatedMemberIds);

      res.json({ status: true, message: "Expense updated", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error updating expense:", error);
      res.status(500).json({ status: false, message: "Failed to update expense" });
    }
  });

  // DELETE /api/xensplit/groups/:groupId/expenses/:expenseId - Delete expense
  app.delete("/api/xensplit/groups/:groupId/expenses/:expenseId", validateParams(xenSplitExpenseParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId, expenseId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      const expenseIndex = group.expenses.findIndex((e: any) => e._id.toString() === expenseId);
      if (expenseIndex === -1) {
        return res.status(404).json({ status: false, message: "Expense not found" });
      }

      // Delete any GCS images associated with the expense
      const expense = group.expenses[expenseIndex];
      if (expense.images && expense.images.length > 0) {
        await Promise.all(
          expense.images.map((img: any) =>
            deleteFromGCS(img.gcs_path, true).catch(() => { })
          )
        );
      }

      // Only the expense creator or group owner may delete
      if (expense.created_by && expense.created_by !== userId && group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Not authorised to delete this expense" });
      }

      group.expenses.splice(expenseIndex, 1);
      await group.save();
      await group.populate("members", "username avatar");

      const deletedMemberIds = (group.members as any[]).map((m: any) => m._id.toString());
      SocketManager.getInstance().notifyXenSplitGroupUpdate(groupId, deletedMemberIds);

      res.json({ status: true, message: "Expense deleted", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ status: false, message: "Failed to delete expense" });
    }
  });

  // POST /api/xensplit/groups/:groupId/expenses/:expenseId/images - Upload expense images
  app.post("/api/xensplit/groups/:groupId/expenses/:expenseId/images", validateParams(xenSplitExpenseParamSchema), uploadXenSplitImages.array("images", MAX_XENSPLIT_IMAGES_PER_EXPENSE), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId, expenseId } = req.params;
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        return res.status(400).json({ status: false, message: "No images provided" });
      }

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      const expense = group.expenses.id(expenseId);
      if (!expense) {
        return res.status(404).json({ status: false, message: "Expense not found" });
      }

      if (!expense.images) {
        expense.images = [];
      }

      if (expense.images.length + files.length > MAX_XENSPLIT_IMAGES_PER_EXPENSE) {
        return res.status(400).json({ status: false, message: `Cannot exceed ${MAX_XENSPLIT_IMAGES_PER_EXPENSE} images per expense` });
      }

      for (const file of files) {
        const filename = generateUniqueFilename(file.originalname);
        const gcsPath = `xensplit-images/${groupId}/${expenseId}/${filename}`;
        await uploadToGCS(file.buffer, gcsPath, file.mimetype, true);
        expense.images.push({ gcs_path: gcsPath });
      }

      await group.save();
      await group.populate("members", "username avatar");
      res.json({ status: true, message: "Images uploaded", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error uploading expense images:", error);
      res.status(500).json({ status: false, message: "Failed to upload images" });
    }
  });

  // DELETE /api/xensplit/groups/:groupId/expenses/:expenseId/images/:imageId - Delete an expense image
  app.delete("/api/xensplit/groups/:groupId/expenses/:expenseId/images/:imageId", validateParams(xenSplitExpenseImageParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId, expenseId, imageId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      const expense = group.expenses.id(expenseId);
      if (!expense) {
        return res.status(404).json({ status: false, message: "Expense not found" });
      }

      const imageIndex = expense.images.findIndex((img: any) => img._id.toString() === imageId);
      if (imageIndex === -1) {
        return res.status(404).json({ status: false, message: "Image not found" });
      }

      const image = expense.images[imageIndex];
      await deleteFromGCS(image.gcs_path, true).catch(() => { });
      expense.images.splice(imageIndex, 1);
      await group.save();
      await group.populate("members", "username avatar");

      res.json({ status: true, message: "Image deleted", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error deleting expense image:", error);
      res.status(500).json({ status: false, message: "Failed to delete image" });
    }
  });

  // GET /api/xensplit/groups/:groupId/expenses/:expenseId/image-urls - Get signed URLs for expense images
  app.get("/api/xensplit/groups/:groupId/expenses/:expenseId/image-urls", validateParams(xenSplitExpenseParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId, expenseId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      const expense = group.expenses.id(expenseId);
      if (!expense) {
        return res.status(404).json({ status: false, message: "Expense not found" });
      }

      if (!expense.images || expense.images.length === 0) {
        return res.json({ status: true, data: [] });
      }

      const signedUrls = await Promise.all(
        expense.images.map(async (img: any) => ({
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

  // GET /api/xensplit/exchange-rate - Live exchange rate proxy (exchangerate-api.com), cached for a
  // few hours since rates barely move within a day and the upstream API has usage limits.
  app.get("/api/xensplit/exchange-rate", async (req: Request, res: Response) => {
    try {
      const from = ((req.query.from as string) || "").toUpperCase();
      const to = ((req.query.to as string) || "").toUpperCase();
      if (!from || !to) return res.status(400).json({ status: false, message: "from and to are required" });

      const key = `${from}_${to}`;
      const cached = rateCache.get(key);
      const now = Date.now();
      if (cached && now - cached.fetchedAt < RATE_CACHE_TTL_MS) {
        return res.json({ status: true, data: { rate: cached.rate, fetchedAt: cached.fetchedAt } });
      }

      const apiKey = process.env.EXCHANGERATE_API_KEY;
      if (!apiKey) return res.status(500).json({ status: false, message: "Exchange rate service not configured" });

      const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`);
      const data: any = await response.json();
      if (data.result !== "success") {
        return res.status(502).json({ status: false, message: data["error-type"] || "Failed to fetch exchange rate" });
      }
      const fetchedAt = now;
      rateCache.set(key, { rate: data.conversion_rate, fetchedAt });
      res.json({ status: true, data: { rate: data.conversion_rate, fetchedAt } });
    } catch (e) {
      res.status(500).json({ status: false, message: "Failed to fetch exchange rate" });
    }
  });

  // GET /api/xensplit/groups/:groupId/balances - Get balances
  app.get("/api/xensplit/groups/:groupId/balances", validateParams(xenSplitIdParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      await group.populate("members", "username avatar");
      const populatedMembers: any[] = group.members;
      const userMap: any = {};
      populatedMembers.forEach((m: any) => { userMap[m._id.toString()] = m; });

      const groupObj = group.toObject();
      const groupForCalc = { ...groupObj, members: populatedMembers.map((m: any) => m._id.toString()) };
      const balances = calculateBalances(groupForCalc);
      const settlements = calculateSimplifiedTransfers(groupForCalc);

      // Enrich with user details
      const enrichedBalances: any = {};
      for (const [uid, currencyBalances] of Object.entries(balances)) {
        enrichedBalances[uid] = {
          user: userMap[uid] || { _id: uid, username: "Unknown", avatar: null },
          balances: currencyBalances,
        };
      }

      const enrichedSettlements = settlements.map((s: any) => ({
        ...s,
        fromUser: userMap[s.from] || { _id: s.from, username: "Unknown", avatar: null },
        toUser: userMap[s.to] || { _id: s.to, username: "Unknown", avatar: null },
      }));

      res.json({
        status: true,
        message: "Balances retrieved",
        data: {
          group: { _id: group._id, name: group.name },
          balances: enrichedBalances,
          settlements: enrichedSettlements,
        },
      });
    } catch (error) {
      console.error("Error fetching balances:", error);
      res.status(500).json({ status: false, message: "Failed to fetch balances" });
    }
  });

  // POST /api/xensplit/groups/:groupId/settle - Mark debt as settled
  app.post("/api/xensplit/groups/:groupId/settle", validateParams(xenSplitIdParamSchema), validate(settleDebtSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;
      const { from, to, amount, currency, note } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      // Only the debtor or creditor can settle
      if (from !== userId && to !== userId) {
        return res.status(403).json({ status: false, message: "Can only settle your own debts" });
      }

      group.settlements.push({
        from,
        to,
        amount,
        currency,
        settled_at: new Date(),
        ...(note ? { note } : {}),
      });

      await group.save();
      await group.populate("members", "username avatar");

      const fromMember = (group.members as any[]).find((m: any) => m._id.toString() === from);
      const fromName = fromMember?.username || "Someone";
      await notify(to, "Settlement Received", `${fromName} paid you ${amount} ${currency} in ${group.name}`, `/internal/xensplit/groups/${groupId}/overview`);

      res.json({ status: true, message: "Debt settled", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error settling debt:", error);
      res.status(500).json({ status: false, message: "Failed to settle debt" });
    }
  });

  // DELETE /api/xensplit/groups/:groupId/settlements/:settlementId - Undo a settlement
  app.delete("/api/xensplit/groups/:groupId/settlements/:settlementId", validateParams(xenSplitSettlementParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId, settlementId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      const settlementIndex = group.settlements.findIndex((s: any) => s._id.toString() === settlementId);
      if (settlementIndex === -1) {
        return res.status(404).json({ status: false, message: "Settlement not found" });
      }

      const settlement = group.settlements[settlementIndex];
      // Only the debtor, creditor, or group owner may undo a settlement
      if (settlement.from !== userId && settlement.to !== userId && group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Not authorised to undo this settlement" });
      }

      group.settlements.splice(settlementIndex, 1);
      await group.save();
      await group.populate("members", "username avatar");

      res.json({ status: true, message: "Settlement undone", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error undoing settlement:", error);
      res.status(500).json({ status: false, message: "Failed to undo settlement" });
    }
  });

  // POST /api/xensplit/groups/:groupId/exchanges - Record a currency exchange
  app.post("/api/xensplit/groups/:groupId/exchanges", validateParams(xenSplitIdParamSchema), validate(createExchangeSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId } = req.params;
      const { party_a, currency_a, amount_a, party_b, currency_b, rate, rate_from_currency, note, date } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      if (!group.members.some((m: any) => m.toString() === party_a)) {
        return res.status(400).json({ status: false, message: "Party A must be a group member" });
      }

      if (!group.members.some((m: any) => m.toString() === party_b)) {
        return res.status(400).json({ status: false, message: "Party B must be a group member" });
      }

      const amount_b = Number((amount_a * rate).toFixed(2));

      group.exchanges = group.exchanges || [];
      group.exchanges.push({
        party_a,
        currency_a,
        amount_a,
        party_b,
        currency_b,
        amount_b,
        rate,
        rate_from_currency: rate_from_currency ?? currency_a,
        created_by: userId,
        date: date ? new Date(date) : new Date(),
        created_at: new Date(),
        ...(note ? { note } : {}),
      } as any);

      await group.save();
      await group.populate("members", "username avatar");

      const actor = (group.members as any[]).find((m: any) => m._id.toString() === userId);
      const actorName = actor?.username || "Someone";
      const notifyIds = new Set([party_a, party_b].filter((id) => id !== userId));
      for (const mid of notifyIds) {
        await notify(mid, "New Exchange", `${actorName} recorded a currency exchange in ${group.name}`, `/internal/xensplit/groups/${groupId}/expenses`, "swap_horiz");
      }

      const memberIds = (group.members as any[]).map((m: any) => m._id.toString());
      SocketManager.getInstance().notifyXenSplitGroupUpdate(groupId, memberIds);

      res.json({ status: true, message: "Exchange recorded", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error recording exchange:", error);
      res.status(500).json({ status: false, message: "Failed to record exchange" });
    }
  });

  // DELETE /api/xensplit/groups/:groupId/exchanges/:exchangeId - Delete an exchange
  app.delete("/api/xensplit/groups/:groupId/exchanges/:exchangeId", validateParams(xenSplitExchangeParamSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { groupId, exchangeId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.some((m: any) => m.toString() === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      const exchangeIndex = (group.exchanges || []).findIndex((ex: any) => ex._id.toString() === exchangeId);
      if (exchangeIndex === -1) {
        return res.status(404).json({ status: false, message: "Exchange not found" });
      }

      const exchange = group.exchanges[exchangeIndex];
      // Only the creator, either party, or group owner may delete
      if (exchange.created_by !== userId && exchange.party_a !== userId && exchange.party_b !== userId && group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Not authorised to delete this exchange" });
      }

      group.exchanges.splice(exchangeIndex, 1);
      await group.save();
      await group.populate("members", "username avatar");

      const memberIds = (group.members as any[]).map((m: any) => m._id.toString());
      SocketManager.getInstance().notifyXenSplitGroupUpdate(groupId, memberIds);

      res.json({ status: true, message: "Exchange deleted", data: transformMembers(group.toObject()) });
    } catch (error) {
      console.error("Error deleting exchange:", error);
      res.status(500).json({ status: false, message: "Failed to delete exchange" });
    }
  });
};
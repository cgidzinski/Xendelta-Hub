import { Request, Response } from "express";
const XenSplit = require("../models/xenSplit");
const { User } = require("../models/user");
import { authenticateToken } from "../middleware/auth";
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
} from "../utils/validation";
import { calculateBalances, calculateMinimumTransfers } from "../utils/xenSplitUtils";

module.exports = function (app: any) {
  // Apply auth middleware to all xensplit routes
  app.use("/api/xensplit", authenticateToken);

  // GET /api/xensplit/groups - List all groups for current user
  app.get("/api/xensplit/groups", async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const groups = await XenSplit.find({
        "members.user_id": userId,
      }).sort({ created_at: -1 });

      res.json({ status: true, message: "Groups retrieved", data: groups });
    } catch (error) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ status: false, message: "Failed to fetch groups" });
    }
  });

  // POST /api/xensplit/groups - Create new group
  app.post("/api/xensplit/groups", validate(createXenSplitSchema), async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)._id.toString();
      const { name, memberIds, currencies } = req.body;

      // Get creator's user data
      const creator = await User.findById(userId).select("username avatar").lean();
      const members = [{
        user_id: userId,
        username: creator?.username || "Unknown",
        avatar: creator?.avatar || null,
        joined_at: new Date(),
      }];

      if (memberIds && memberIds.length > 0) {
        const mongoose = require("mongoose");
        const objectIds = memberIds.map((id: string) => new mongoose.Types.ObjectId(id));
        const users = await User.find({ _id: { $in: objectIds } }).select("username avatar").lean();
        for (const u of users) {
          if (u._id.toString() !== userId && !members.find((m: any) => m.user_id === u._id.toString())) {
            members.push({
              user_id: u._id.toString(),
              username: u.username || "Unknown",
              avatar: u.avatar || null,
              joined_at: new Date(),
            });
          }
        }
      }

      const group = new XenSplit({
        name,
        created_by: userId,
        currencies: currencies || ["USD"],
        members,
        expenses: [],
        settlements: [],
      });

      await group.save();
      res.json({ status: true, message: "Group created", data: group });
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
      if (!group.members.find((m: any) => m.user_id === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      // Enrich expenses with payer info from members
      const groupObj = group.toObject();
      groupObj.expenses = groupObj.expenses.map((expense: any) => {
        const payer = group.members.find((m: any) => m.user_id === expense.paid_by);
        return {
          ...expense,
          payer: payer ? { user_id: payer.user_id, username: payer.username, avatar: payer.avatar } : null,
        };
      });

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
      const { name } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (group.created_by !== userId) {
        return res.status(403).json({ status: false, message: "Only the creator can update the group" });
      }

      if (name) group.name = name;
      await group.save();

      res.json({ status: true, message: "Group updated", data: group });
    } catch (error) {
      console.error("Error updating group:", error);
      res.status(500).json({ status: false, message: "Failed to update group" });
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
      const newOwner = group.members.find((m: any) => m.user_id === newOwnerId);
      if (!newOwner) {
        return res.status(400).json({ status: false, message: "New owner must be a member" });
      }

      group.created_by = newOwnerId;
      await group.save();

      res.json({ status: true, message: "Ownership transferred", data: group });
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

      if (!group.members.find((m: any) => m.user_id === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      const mongoose = require("mongoose");
      const objectIds = memberIds.map((id: string) => new mongoose.Types.ObjectId(id));
      const users = await User.find({ _id: { $in: objectIds } }).select("username avatar").lean();
      for (const u of users) {
        if (!group.members.find((m: any) => m.user_id === u._id.toString())) {
          group.members.push({
            user_id: u._id.toString(),
            username: u.username || "Unknown",
            avatar: u.avatar || null,
            joined_at: new Date(),
          });
        }
      }

      await group.save();
      res.json({ status: true, message: "Members added", data: group });
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
      const balances = calculateBalances(group.toObject());
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
        const remainingMembers = group.members.filter((m: any) => m.user_id !== targetUserId);
        if (remainingMembers.length > 0) {
          group.created_by = remainingMembers[0].user_id;
        }
      }

      group.members = group.members.filter((m: any) => m.user_id !== targetUserId);
      await group.save();

      // Delete group if no members left
      if (group.members.length === 0) {
        await XenSplit.findByIdAndDelete(groupId);
        return res.json({ status: true, message: "Member removed and group deleted" });
      }

      res.json({ status: true, message: "Member removed", data: group });
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
      const { paid_by, amount, currency, description, notes, date, split_type, splits } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.find((m: any) => m.user_id === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      // Validate payer is a member
      if (!group.members.find((m: any) => m.user_id === paid_by)) {
        return res.status(400).json({ status: false, message: "Payer must be a group member" });
      }

      // Resolve splits
      let resolvedSplits = splits || [];
      if (split_type === "equal") {
        const participants = group.members.map((m: any) => m.user_id);
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

      const expense = {
        paid_by,
        amount,
        currency: currency || "USD",
        description,
        notes,
        date: date ? new Date(date) : new Date(),
        split_type,
        splits: resolvedSplits,
        created_at: new Date(),
      };

      group.expenses.push(expense as any);
      await group.save();

      res.json({ status: true, message: "Expense added", data: group });
    } catch (error) {
      console.error("Error adding expense:", error);
      res.status(500).json({ status: false, message: "Failed to add expense" });
    }
  });

  // PUT /api/xensplit/groups/:groupId/expenses/:expenseId - Update expense
  app.put("/api/xensplit/groups/:groupId/expenses/:expenseId", validateParams(xenSplitExpenseParamSchema), validate(updateExpenseSchema), async (req: Request, res: Response) => {
    try {
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
      // Allow any group member to edit expense

      const updates = req.body;
      Object.assign(expense, updates);

      // Recalculate splits if needed
      if (updates.split_type || updates.amount) {
        const amount = expense.amount;
        const split_type = expense.split_type;

        if (split_type === "equal") {
          const participants = group.members.map((m: any) => m.user_id);
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
      res.json({ status: true, message: "Expense updated", data: group });
    } catch (error) {
      console.error("Error updating expense:", error);
      res.status(500).json({ status: false, message: "Failed to update expense" });
    }
  });

  // DELETE /api/xensplit/groups/:groupId/expenses/:expenseId - Delete expense
  app.delete("/api/xensplit/groups/:groupId/expenses/:expenseId", validateParams(xenSplitExpenseParamSchema), async (req: Request, res: Response) => {
    try {
      const { groupId, expenseId } = req.params;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      const expenseIndex = group.expenses.findIndex((e: any) => e._id.toString() === expenseId);
      if (expenseIndex === -1) {
        return res.status(404).json({ status: false, message: "Expense not found" });
      }

      // Allow any group member to delete expense
      group.expenses.splice(expenseIndex, 1);
      await group.save();

      res.json({ status: true, message: "Expense deleted", data: group });
    } catch (error) {
      console.error("Error deleting expense:", error);
      res.status(500).json({ status: false, message: "Failed to delete expense" });
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

      if (!group.members.find((m: any) => m.user_id === userId)) {
        return res.status(403).json({ status: false, message: "Not a member of this group" });
      }

      // Get user details for members
      const userIds = group.members.map((m: any) => m.user_id);
      const mongoose = require("mongoose");
      const objectIds = userIds.map((id: string) => new mongoose.Types.ObjectId(id));
      const users = await User.find({ _id: { $in: objectIds } }).select("_id username avatar").lean();
      const userMap: any = {};
      users.forEach((u: any) => { userMap[u._id.toString()] = u; });

      const groupObj = group.toObject();
      const balances = calculateBalances(groupObj);
      const settlements = calculateMinimumTransfers(balances);

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
      const { from, to, amount, currency } = req.body;

      const group = await XenSplit.findById(groupId);
      if (!group) {
        return res.status(404).json({ status: false, message: "Group not found" });
      }

      if (!group.members.find((m: any) => m.user_id === userId)) {
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
      });

      await group.save();
      res.json({ status: true, message: "Debt settled", data: group });
    } catch (error) {
      console.error("Error settling debt:", error);
      res.status(500).json({ status: false, message: "Failed to settle debt" });
    }
  });
};
import { Request, Response } from "express";
import { XenRoutine } from "../models/xenRoutine";
import { XenRoutineSettings } from "../models/xenRoutineSettings";
import { User } from "../models/user";
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
import { AppError, callerId } from "../utils/http";
import {
  validate,
  validateParams,
  createXenRoutineSchema,
  updateXenRoutineSchema,
  completeXenRoutineSchema,
  postponeXenRoutineSchema,
  xenRoutineNotificationsSchema,
  xenRoutineSettingsSchema,
  shareXenRoutineSchema,
  xenRoutineIdParamSchema,
  xenRoutineMemberParamSchema,
} from "../utils/validation";
import {
  addInterval,
  applyComplete,
  applyPostpone,
  canAct,
  canEdit,
  computeDueStatus,
  doneAheadIndices,
  DEFAULT_REMIND_HOUR,
  effectiveTimezone,
  type RoutineLike,
} from "../utils/xenRoutine";
import { sendActivityNotices } from "../utils/xenRoutineReminders";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../utils/publicUser";
import { addRefused } from "../social/policy";

const actorName = (req: Request) => (req as AuthenticatedRequest).user!.username;

// Loads a routine and enforces the permission level in one place; throws the 404/403 otherwise.
async function loadRoutine(req: Request, need: "edit" | "act") {
  const routine = await XenRoutine.findById(req.params.id).exec();
  const uid = callerId(req);
  // 404 (not 403) for strangers so routine ids can't be probed.
  if (!routine || !canAct(routine, uid)) {
    throw new AppError(404, "Routine not found");
  }
  if (need === "edit" && !canEdit(routine, uid)) {
    throw new AppError(403, "Only the owner can do that");
  }
  return routine;
}

async function serialize(routines: any[], uid: string) {
  const ids = [...new Set(routines.flatMap((r) => r.members.map((m: any) => m.user_id)))];
  const users = await User.find({ _id: { $in: ids } }, PUBLIC_USER_FIELDS)
    .lean()
    .exec();
  const byId = new Map<string, any>(users.map((u: any) => [u._id.toString(), u]));
  const now = new Date();

  return routines.map((r) => {
    const obj = r.toObject ? r.toObject() : r;
    const mine = obj.members.find((m: any) => m.user_id === uid);
    return {
      _id: obj._id,
      name: obj.name,
      category: obj.category,
      notes: obj.notes,
      interval: obj.interval,
      last_done_at: obj.last_done_at,
      due_at: obj.due_at,
      enabled: obj.enabled,
      remind_again_days: obj.remind_again_days,
      status: computeDueStatus(obj, now),
      done_ahead_indices: doneAheadIndices(obj),
      is_owner: obj.owner_id === uid,
      my_notifications: mine
        ? { muted: mine.muted, lead_days: mine.lead_days ?? 1, activity: mine.activity !== false }
        : null,
      members: obj.members.map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        username: byId.get(m.user_id)?.username ?? "Unknown",
        avatar: byId.get(m.user_id)?.avatar ?? null,
        cosmetics: cosmeticsOf(byId.get(m.user_id)),
      })),
      history: [...obj.history].reverse().map((h: any) => ({
        ...h,
        by_username: byId.get(h.by_user)?.username ?? null,
      })),
    };
  });
}

module.exports = function (app: any) {
  app.use("/api/xenroutine", authenticateToken);

  // Per-user reminder timing. The timezone is the Profile setting; browser_timezone is only
  // the client-reported fallback for people who leave Profile on "follow my browser".
  async function settingsPayload(uid: string) {
    const [settings, user] = await Promise.all([
      XenRoutineSettings.findOne({ user_id: uid }).lean().exec(),
      User.findById(uid, "timezone").lean().exec(),
    ]);
    return {
      remind_hour: settings?.remind_hour ?? DEFAULT_REMIND_HOUR,
      channels: settings?.channels ?? { inapp: true, push: true, email: true },
      browser_timezone: settings?.browser_timezone ?? null,
      profile_timezone: user?.timezone || null,
      timezone: effectiveTimezone(user?.timezone, settings?.browser_timezone),
    };
  }

  app.get("/api/xenroutine/settings", async (req: Request, res: Response) => {
    return res.json({ status: true, message: "", data: { settings: await settingsPayload(callerId(req)) } });
  });

  app.put("/api/xenroutine/settings", validate(xenRoutineSettingsSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { remind_hour, channels, browser_timezone } = req.body;
    const set: Record<string, unknown> = {};
    if (remind_hour !== undefined) set.remind_hour = remind_hour;
    if (channels !== undefined) set.channels = channels;
    if (browser_timezone !== undefined) set.browser_timezone = browser_timezone;
    await XenRoutineSettings.updateOne(
      { user_id: uid },
      { $set: set, $setOnInsert: { user_id: uid } },
      { upsert: true },
    );
    return res.json({ status: true, message: "Settings saved", data: { settings: await settingsPayload(uid) } });
  });

  app.get("/api/xenroutine/routines", async (req: Request, res: Response) => {
    const uid = callerId(req);
    const routines = await XenRoutine.find({ "members.user_id": uid }).sort({ due_at: 1 }).exec();
    return res.json({ status: true, message: "", data: { routines: await serialize(routines, uid) } });
  });

  app.post("/api/xenroutine/routines", validate(createXenRoutineSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const b = req.body;
    const lastDone = b.last_done_at ? new Date(b.last_done_at) : null;
    const dueAt = b.due_at ? new Date(b.due_at) : addInterval(lastDone ?? new Date(), b.interval);
    const routine = await XenRoutine.create({
      owner_id: uid,
      name: b.name,
      category: b.category ?? "",
      notes: b.notes ?? "",
      interval: b.interval,
      last_done_at: lastDone,
      due_at: dueAt,
      remind_again_days: b.remind_again_days ?? 3,
      members: [{ user_id: uid, role: "owner" }],
    });
    const [out] = await serialize([routine], uid);
    return res.status(201).json({ status: true, message: "Routine created", data: { routine: out } });
  });

  app.put(
    "/api/xenroutine/routines/:id",
    validateParams(xenRoutineIdParamSchema),
    validate(updateXenRoutineSchema),
    async (req: Request, res: Response) => {
      const routine = await loadRoutine(req, "edit");
      const b = req.body;
      for (const k of ["name", "category", "notes", "interval", "enabled", "remind_again_days"]) {
        if (b[k] !== undefined) routine.set(k, b[k]);
      }
      if (b.due_at !== undefined) {
        routine.due_at = new Date(b.due_at);
        routine.last_notified_at = null;
      }
      await routine.save();
      const [out] = await serialize([routine], callerId(req));
      return res.json({ status: true, message: "Routine updated", data: { routine: out } });
    },
  );

  app.delete(
    "/api/xenroutine/routines/:id",
    validateParams(xenRoutineIdParamSchema),
    async (req: Request, res: Response) => {
      const routine = await loadRoutine(req, "edit");
      await routine.deleteOne();
      return res.json({ status: true, message: "Routine deleted" });
    },
  );

  app.post(
    "/api/xenroutine/routines/:id/complete",
    validateParams(xenRoutineIdParamSchema),
    validate(completeXenRoutineSchema),
    async (req: Request, res: Response) => {
      const routine = await loadRoutine(req, "act");
      // A view that was open while the schedule moved (another device, a sharer) could
      // otherwise complete a different occurrence than the one on screen.
      if (req.body.expected_due_at && new Date(req.body.expected_due_at).getTime() !== routine.due_at.getTime()) {
        throw new AppError(409, "This routine changed. Refresh and try again.");
      }
      const patch = applyComplete(routine.toObject() as unknown as RoutineLike, {
        by: callerId(req),
        now: new Date(),
        doneAt: req.body.done_at ? new Date(req.body.done_at) : undefined,
        note: req.body.note,
        occurrence: req.body.occurrence,
      });
      routine.set(patch);
      await routine.save();
      const [out] = await serialize([routine], callerId(req));
      void sendActivityNotices(routine, callerId(req), actorName(req), `marked "${routine.name}" as done`);
      return res.json({ status: true, message: "Marked as done", data: { routine: out } });
    },
  );

  app.post(
    "/api/xenroutine/routines/:id/postpone",
    validateParams(xenRoutineIdParamSchema),
    validate(postponeXenRoutineSchema),
    async (req: Request, res: Response) => {
      const routine = await loadRoutine(req, "act");
      const now = new Date();
      const until = req.body.until ? new Date(req.body.until) : undefined;
      if (until && until.getTime() <= now.getTime()) throw new AppError(400, "Pick a date in the future");
      const patch = applyPostpone(routine.toObject() as unknown as RoutineLike, {
        by: callerId(req),
        now,
        days: req.body.days,
        until,
        note: req.body.note,
      });
      routine.set(patch);
      await routine.save();
      const [out] = await serialize([routine], callerId(req));
      void sendActivityNotices(
        routine,
        callerId(req),
        actorName(req),
        `postponed "${routine.name}" to ${routine.due_at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
      );
      return res.json({ status: true, message: "Postponed", data: { routine: out } });
    },
  );

  // My own notification options for this routine (works for owner and sharers alike).
  app.put(
    "/api/xenroutine/routines/:id/notifications",
    validateParams(xenRoutineIdParamSchema),
    validate(xenRoutineNotificationsSchema),
    async (req: Request, res: Response) => {
      const routine = await loadRoutine(req, "act");
      const me = routine.members.find((m: any) => m.user_id === callerId(req));
      if (!me) throw new AppError(404, "Routine not found");
      if (req.body.muted !== undefined) me.muted = req.body.muted;
      if (req.body.lead_days !== undefined) me.lead_days = req.body.lead_days;
      if (req.body.activity !== undefined) me.activity = req.body.activity;
      // Routine-wide, not per member: one nag cadence for everyone on the routine.
      if (req.body.remind_again_days !== undefined) routine.remind_again_days = req.body.remind_again_days;
      await routine.save();
      const [out] = await serialize([routine], callerId(req));
      return res.json({ status: true, message: "Notification options saved", data: { routine: out } });
    },
  );

  app.post(
    "/api/xenroutine/routines/:id/share",
    validateParams(xenRoutineIdParamSchema),
    validate(shareXenRoutineSchema),
    async (req: Request, res: Response) => {
      const routine = await loadRoutine(req, "edit");
      if (addRefused(res, callerId(req), req.body.userIds)) return;
      const existing = new Set(routine.members.map((m: any) => m.user_id));
      const users = await User.find({ _id: { $in: req.body.userIds } }, "_id")
        .lean()
        .exec();
      for (const u of users) {
        const id = u._id.toString();
        if (!existing.has(id)) routine.members.push({ user_id: id, role: "editor" });
      }
      await routine.save();
      const [out] = await serialize([routine], callerId(req));
      return res.json({ status: true, message: "Shared", data: { routine: out } });
    },
  );

  // Owner removes anyone; a sharer may remove only themselves. The owner cannot be removed.
  app.delete(
    "/api/xenroutine/routines/:id/share/:userId",
    validateParams(xenRoutineMemberParamSchema),
    async (req: Request, res: Response) => {
      const routine = await loadRoutine(req, "act");
      const uid = callerId(req);
      const target = req.params.userId as string;
      if (target === routine.owner_id) throw new AppError(400, "The owner cannot be removed");
      if (!canEdit(routine, uid) && target !== uid) throw new AppError(403, "Only the owner can remove others");
      routine.set(
        "members",
        routine.members.filter((m: any) => m.user_id !== target),
      );
      await routine.save();
      const stillIn = routine.members.some((m: any) => m.user_id === uid);
      return res.json({
        status: true,
        message: "Removed",
        data: stillIn ? { routine: (await serialize([routine], uid))[0] } : {},
      });
    },
  );
};

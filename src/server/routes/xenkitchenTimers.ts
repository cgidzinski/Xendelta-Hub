import express = require("express");
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import {
  changeTimerClock,
  MAX_TIMER_SECONDS,
  startTimerClock,
  TIMER_RETENTION_MS,
  type KitchenTimer,
} from "@shared/xenkitchen/timers";
import { SocketManager } from "../infrastructure/SocketManager";
import { authenticateToken } from "../middleware/auth";
import { XenKitchenTimer, type KitchenTimerRecord } from "../models/xenKitchenTimer";
import { AppError, callerId } from "../utils/http";
import { validate, validateParams } from "../utils/validation";

const idSchema = z.uuid();
const paramsSchema = z.object({ id: idSchema });
const startSchema = z.object({
  id: idSchema,
  durationSeconds: z.number().int().min(1).max(MAX_TIMER_SECONDS),
  halfway: z.boolean(),
  source: z
    .object({
      key: z.string().regex(/^[\w:-]{1,120}$/),
      label: z.string().trim().min(1).max(200),
    })
    .optional(),
});
const actionSchema = z.object({
  action: z.enum(["pause", "resume", "dismiss"]),
  version: z.number().int().nonnegative(),
});

const wire = (timer: KitchenTimerRecord): KitchenTimer => ({
  id: timer.id,
  label: timer.label,
  sourceKey: timer.sourceKey ?? undefined,
  durationSeconds: timer.durationSeconds,
  endAt: timer.endAt ?? null,
  halfwayAt: timer.halfwayAt ?? null,
  halfwayRemainingMs: timer.halfwayRemainingMs ?? null,
  pausedMs: timer.pausedMs ?? null,
  version: timer.version,
});

const expiry = (endAt: number) => new Date(endAt + TIMER_RETENTION_MS);
const limitStarts = rateLimit({
  windowMs: 60_000,
  limit: 30,
  keyGenerator: callerId,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: false, message: "Too many timers started. Try again in a minute." },
});
const changed = (owner: string) => SocketManager.getInstance().emitToUsers([owner], "xenkitchen:timers_updated");

async function createTimer(owner: string, input: z.infer<typeof startSchema>, now: number) {
  await XenKitchenTimer.init();
  const _id = `${owner}:${input.id}`;
  const clock = startTimerClock(input.durationSeconds, input.halfway, now);
  // Expired records can outlive their TTL briefly. Release their unique slots before allocating.
  await XenKitchenTimer.deleteMany({ owner, expiresAt: { $lte: new Date(now) } });

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await XenKitchenTimer.findById(_id).lean();
    if (existing) {
      if (existing.dismissed) throw new AppError(409, "This timer was already dismissed");
      return existing;
    }
    if (input.source) {
      const sameSource = await XenKitchenTimer.findOne({ owner, sourceKey: input.source.key }).lean();
      if (sameSource) return sameSource;
    }
    let manualNumber: number | undefined;
    if (!input.source) {
      const numbered = await XenKitchenTimer.findOne({ owner, manualNumber: { $exists: true } })
        .sort({ manualNumber: -1 })
        .select("manualNumber")
        .lean();
      manualNumber = (numbered?.manualNumber ?? 0) + 1;
    }
    try {
      const timer = await XenKitchenTimer.create({
        _id,
        owner,
        id: input.id,
        label: input.source?.label ?? `Timer ${manualNumber}`,
        sourceKey: input.source?.key,
        manualNumber,
        durationSeconds: input.durationSeconds,
        ...clock,
        nextEventAt: clock.halfwayAt ?? clock.endAt,
        expiresAt: expiry(clock.endAt),
      });
      changed(owner);
      return timer;
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
    }
  }
  throw new AppError(409, "The timers changed. Try again.");
}

module.exports = function (app: express.Application) {
  app.get("/api/xenkitchen/timers", authenticateToken, async (req, res) => {
    const now = Date.now();
    const timers = await XenKitchenTimer.find({
      owner: callerId(req),
      dismissed: false,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date(now) } }],
    }).lean();
    res.json({ status: true, data: timers.map(wire) });
  });

  app.post("/api/xenkitchen/timers", authenticateToken, limitStarts, validate(startSchema), async (req, res) => {
    const timer = await createTimer(callerId(req), startSchema.parse(req.body), Date.now());
    res.json({ status: true, data: wire(timer) });
  });

  app.patch(
    "/api/xenkitchen/timers/:id",
    authenticateToken,
    validateParams(paramsSchema),
    validate(actionSchema),
    async (req, res) => {
      const owner = callerId(req);
      const { id } = paramsSchema.parse(req.params);
      const { action, version } = actionSchema.parse(req.body);
      const _id = `${owner}:${id}`;
      const timer = await XenKitchenTimer.findById(_id).lean();
      const now = Date.now();
      if (!timer || (timer.expiresAt && timer.expiresAt.getTime() <= now)) throw new AppError(404, "Timer not found");
      if (timer.dismissed && action === "dismiss") {
        res.json({ status: true, data: null });
        return;
      }
      // A response may have been lost after a successful write. Replaying that version returns its result.
      if (
        !timer.dismissed &&
        timer.version === version + 1 &&
        ((action === "pause" && timer.pausedMs != null) || (action === "resume" && timer.endAt != null))
      ) {
        res.json({ status: true, data: wire(timer) });
        return;
      }
      if (timer.dismissed || timer.version !== version) throw new AppError(409, "The timer changed. Try again.");
      const filter = { _id, version };
      if (action === "dismiss") {
        const result = await XenKitchenTimer.updateOne(filter, {
          $set: { dismissed: true, nextEventAt: null, expiresAt: expiry(now) },
          $inc: { version: 1 },
          $unset: { sourceKey: "", manualNumber: "" },
        });
        if (!result.modifiedCount) throw new AppError(409, "The timer changed. Try again.");
        changed(owner);
        res.json({ status: true, data: null });
        return;
      }

      const next = changeTimerClock(wire(timer), action, now);
      if (!next) throw new AppError(409, "This timer can no longer be changed that way");
      const updated = await XenKitchenTimer.findOneAndUpdate(
        filter,
        {
          $set: {
            endAt: next.endAt,
            halfwayAt: next.halfwayAt,
            halfwayRemainingMs: next.halfwayRemainingMs,
            pausedMs: next.pausedMs,
            nextEventAt: next.halfwayAt ?? next.endAt,
            expiresAt: next.endAt === null ? null : expiry(next.endAt),
            version: next.version,
          },
        },
        { new: true },
      ).lean();
      if (!updated) throw new AppError(409, "The timer changed. Try again.");
      changed(owner);
      res.json({ status: true, data: wire(updated) });
    },
  );
};

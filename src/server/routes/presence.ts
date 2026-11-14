import type { Application, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import { User } from "../models/user";
import { announcePresence, peopleSharingWith, presenceOf } from "../presence/tracker";
import { realtime } from "../realtime";
import { callerId } from "../utils/http";
import { validate, updatePresenceSchema } from "../utils/validation";
import { activeCustomStatus, type MyPresence, type PresenceChoice } from "@shared/presence";

// Presence (who is around, and a status line). You see only people you share a chat or community with, and a person who
// chose "invisible" reads as offline to them. API keys cannot reach /api/presence (shared/apiKeys.ts lists the apps they can).

const ok = (res: Response, data: unknown) => res.json({ status: true, message: "", data });

async function mine(userId: string): Promise<MyPresence> {
  const user = await User.findById(userId, "presence").lean().exec();
  const c = user?.presence?.customStatus;
  return {
    choice: (user?.presence?.choice ?? "online") as PresenceChoice,
    customStatus: c
      ? activeCustomStatus({ text: c.text ?? "", emoji: c.emoji ?? "", expiresAt: c.expiresAt?.toISOString() ?? null })
      : null,
  };
}

module.exports = function (app: Application) {
  // Your own settings, and how everyone you share a chat or community with looks right now (offline people are left out).
  app.get("/api/presence", authenticateToken, async (req: Request, res: Response) => {
    const me = callerId(req);
    const others = await peopleSharingWith(me);
    const entries = (await presenceOf(others)).filter((e) => e.status !== "offline");
    ok(res, { me: await mine(me), presence: entries });
  });

  app.put("/api/presence", authenticateToken, validate(updatePresenceSchema), async (req: Request, res: Response) => {
    const me = callerId(req);
    const { choice, customStatus } = updatePresenceSchema.parse(req.body);
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    if (choice !== undefined) set["presence.choice"] = choice;
    if (customStatus === null) unset["presence.customStatus"] = 1;
    else if (customStatus) {
      set["presence.customStatus"] = {
        text: customStatus.text,
        emoji: customStatus.emoji,
        ...(customStatus.expiresAt ? { expiresAt: new Date(customStatus.expiresAt) } : {}),
      };
    }
    await User.updateOne(
      { _id: me },
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    ).exec();
    // Others hear about it at once (and so do your other tabs).
    void announcePresence(me, (ids, event, payload) => realtime.toUsers(ids, event, payload)).catch(() => undefined);
    ok(res, { me: await mine(me) });
  });
};

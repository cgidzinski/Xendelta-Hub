import type { Request, Response } from "express";
import { Types } from "mongoose";
import { XenNotebook } from "../../models/xenNote";
import { User } from "../../models/user";
import { callerId } from "../../utils/http";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../../utils/publicUser";
import { validate, validateParams, xenNoteSeenSchema, xenNoteSharedItemParamSchema } from "../../utils/validation";

interface Share {
  role: "owner" | "editor" | "viewer";
  added_at?: Date | null;
  seen_at?: Date | null;
  added_by?: string | null;
}

function statusOf(share: Share, changedAt?: Date | null) {
  if (!share.seen_at || (share.added_at && share.added_at > share.seen_at)) return "new";
  return changedAt && changedAt > share.seen_at ? "changed" : null;
}

export function registerSharedItemsRoutes(app: any) {
  app.get("/api/xennote/shared-items", async (req: Request, res: Response) => {
    const uid = callerId(req);
    const books = await XenNotebook.find({ "members.user_id": uid }, "name members content_updated_at").lean();
    const entries = books.flatMap((b) => {
      const share = b.members.find((m) => m.user_id === uid && m.role !== "owner");
      if (!share) return [];
      return [
        {
          kind: "notebook" as const,
          id: String(b._id),
          title: b.name,
          role: share.role,
          status: statusOf(share, b.content_updated_at),
          sender: share.added_by ?? b.members.find((m) => m.role === "owner")?.user_id,
          addedAt: share.added_at,
        },
      ];
    });
    entries.sort((a, b) => (b.addedAt?.getTime() ?? 0) - (a.addedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
    const senders = [...new Set(entries.map((e) => e.sender).filter((id) => id && Types.ObjectId.isValid(id)))];
    const users = await User.find({ _id: { $in: senders } }, PUBLIC_USER_FIELDS).lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const groups = new Map<
      string,
      {
        sender: {
          user_id: string;
          username: string;
          avatar: string | null;
          cosmetics: ReturnType<typeof cosmeticsOf>;
        } | null;
        items: Array<Omit<(typeof entries)[number], "sender" | "addedAt">>;
      }
    >();
    for (const { sender, addedAt: _addedAt, ...item } of entries) {
      const user = sender ? byId.get(sender) : undefined;
      const key = sender ?? "";
      const group = groups.get(key) ?? {
        sender: user
          ? {
              user_id: String(user._id),
              username: user.username ?? "Unknown sender",
              avatar: user.avatar ?? null,
              cosmetics: cosmeticsOf(user),
            }
          : null,
        items: [],
      };
      group.items.push(item);
      groups.set(key, group);
    }
    res.json({ status: true, data: [...groups.values()] });
  });

  app.post(
    "/api/xennote/shared-items/:kind/:id/seen",
    validateParams(xenNoteSharedItemParamSchema),
    validate(xenNoteSeenSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { id } = xenNoteSharedItemParamSchema.parse(req.params);
      // Only update existing grants. A member removed while opening an item cannot recreate the grant.
      const filter = { _id: id, members: { $elemMatch: { user_id: uid, role: { $ne: "owner" } } } };
      const { through } = xenNoteSeenSchema.parse(req.body);
      const update = { $max: { "members.$.seen_at": new Date(Math.min(Date.parse(through), Date.now())) } };
      await XenNotebook.updateOne(filter, update);
      res.json({ status: true });
    },
  );
}

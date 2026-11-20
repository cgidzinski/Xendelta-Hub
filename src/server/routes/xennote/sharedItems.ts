import type { Request, Response } from "express";
import { Types } from "mongoose";
import { XenNotebook } from "../../models/xenNote";
import { XenNotePage } from "../../models/xenNotePage";
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
    const [books, pages] = await Promise.all([
      XenNotebook.find({ "members.user_id": uid }, "name members content_updated_at").lean(),
      XenNotePage.find({ "members.user_id": uid }, "title members notebook_id updated_at").lean(),
    ]);
    const memberBooks = new Set(books.map((b) => String(b._id)));
    const standalone = pages.filter((p) => !memberBooks.has(String(p.notebook_id)));
    const containingBooks = await XenNotebook.find(
      { _id: { $in: standalone.map((p) => p.notebook_id) } },
      "_id members",
    ).lean();
    const byBook = new Map(containingBooks.map((b) => [String(b._id), b]));
    const entries = [
      ...books.flatMap((b) => {
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
      }),
      ...standalone.flatMap((p) => {
        const book = byBook.get(String(p.notebook_id));
        const share = p.members.find((m) => m.user_id === uid);
        if (!book || !share) return [];
        return [
          {
            kind: "page" as const,
            id: String(p._id),
            title: p.title || "Untitled page",
            role: share.role,
            status: statusOf(share, p.updated_at),
            sender: share.added_by ?? book.members.find((m) => m.role === "owner")?.user_id,
            addedAt: share.added_at,
          },
        ];
      }),
    ];
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
      const { kind, id } = xenNoteSharedItemParamSchema.parse(req.params);
      // Only update existing grants. A member removed while opening an item cannot recreate the grant.
      const filter = { _id: id, members: { $elemMatch: { user_id: uid, role: { $ne: "owner" } } } };
      const { through } = xenNoteSeenSchema.parse(req.body);
      const update = { $max: { "members.$.seen_at": new Date(Math.min(Date.parse(through), Date.now())) } };
      if (kind === "notebook") await XenNotebook.updateOne(filter, update);
      else await XenNotePage.updateOne(filter, update);
      res.json({ status: true });
    },
  );
}

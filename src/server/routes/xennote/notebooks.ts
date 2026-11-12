import type { Request, Response } from "express";
import { recordActivity } from "../../activity";
import { Types } from "mongoose";
import {
  validate,
  validateParams,
  xenNoteAddMembersSchema,
  xenNoteIdParamSchema,
  xenNoteMemberParamSchema,
  xenNoteMemberRoleSchema,
  xenNotebookSchema,
  xenNotebookUpdateSchema,
} from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { XenNote, XenNotebook } from "../../models/xenNote";
import { User } from "../../models/user";
import { notify } from "../../utils/notificationUtils";
import { randomToken } from "../../utils/tokens";
import { deleteFromGCS } from "../../utils/gcsUtils";
import { SocketManager } from "../../infrastructure/SocketManager";
import { changeRole, removeMember } from "../../utils/membership";
import { MAX_NOTEBOOKS_OWNED, MAX_NOTEBOOK_PEOPLE } from "../../../shared/xennote/notes";
import { loadNotebook, myNotebooks, serializeNotebook } from "./shared";
import { addRefused } from "../../social/policy";

/** How many un-archived notes each notebook holds. */
async function noteCounts(ids: string[]): Promise<Map<string, number>> {
  const rows = await XenNote.aggregate<{ _id: unknown; n: number }>([
    { $match: { notebook_id: { $in: ids.map((id) => new Types.ObjectId(id)) }, archived: { $ne: true } } },
    { $group: { _id: "$notebook_id", n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

export function registerNotebookRoutes(app: any) {
  app.get("/api/xennote/notebooks", async (req: Request, res: Response) => {
    const uid = callerId(req);
    const books = await myNotebooks(uid);
    const counts = await noteCounts(books.map((b) => b.id));
    const data = await Promise.all(books.map((b) => serializeNotebook(b, uid, counts.get(b.id) ?? 0)));
    res.json({ status: true, message: "Notebooks retrieved", data: { notebooks: data } });
  });

  app.post("/api/xennote/notebooks", validate(xenNotebookSchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const owned = await XenNotebook.countDocuments({ members: { $elemMatch: { user_id: uid, role: "owner" } } });
    if (owned >= MAX_NOTEBOOKS_OWNED) throw new AppError(400, `You can own up to ${MAX_NOTEBOOKS_OWNED} notebooks`);
    const book = await XenNotebook.create({
      name: req.body.name,
      color: req.body.color ?? "default",
      members: [{ user_id: uid, role: "owner" }],
    });
    res.json({ status: true, message: "Notebook created", data: { notebook: await serializeNotebook(book, uid, 0) } });
  });

  app.put(
    "/api/xennote/notebooks/:id",
    validateParams(xenNoteIdParamSchema),
    validate(xenNotebookUpdateSchema),
    async (req: Request, res: Response) => {
      const book = await loadNotebook(req, req.params.id as string, "manage");
      if (req.body.name !== undefined) book.name = req.body.name;
      if (req.body.color !== undefined) book.color = req.body.color;
      await book.save();
      SocketManager.getInstance().notifyXenNoteUpdate(book.members.map((m) => m.user_id));
      const counts = await noteCounts([book.id]);
      res.json({
        status: true,
        message: "Saved",
        data: { notebook: await serializeNotebook(book, callerId(req), counts.get(book.id) ?? 0) },
      });
    },
  );

  // Deleting a notebook deletes every note in it, and their photos.
  app.delete(
    "/api/xennote/notebooks/:id",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadNotebook(req, req.params.id as string, "manage");
      const notes = await XenNote.find({ notebook_id: book._id }, "images").lean();
      await Promise.all(
        notes.flatMap((n) => n.images.map((img) => deleteFromGCS(img.gcs_path, true).catch(() => undefined))),
      );
      await XenNote.deleteMany({ notebook_id: book._id });
      const people = book.members.map((m) => m.user_id);
      await book.deleteOne();
      SocketManager.getInstance().notifyXenNoteUpdate(people);
      res.json({ status: true, message: "Notebook deleted" });
    },
  );

  // ---- people
  app.post(
    "/api/xennote/notebooks/:id/members",
    validateParams(xenNoteIdParamSchema),
    validate(xenNoteAddMembersSchema),
    async (req: Request, res: Response) => {
      const book = await loadNotebook(req, req.params.id as string, "manage");
      const { userIds, role } = req.body as { userIds: string[]; role: "editor" | "viewer" };
      if (addRefused(res, callerId(req), userIds)) return;
      const existing = new Set(book.members.map((m) => m.user_id));
      const users = await User.find({ _id: { $in: userIds } }, "_id").lean();
      const added = users.map((u) => String(u._id)).filter((id) => !existing.has(id));
      if (book.members.length + added.length > MAX_NOTEBOOK_PEOPLE) {
        throw new AppError(400, `${MAX_NOTEBOOK_PEOPLE} people per notebook is the limit`);
      }
      for (const id of added) book.members.push({ user_id: id, role, added_at: new Date() });
      await book.save();

      const me = (req.user as { username?: string }).username ?? "Someone";
      await Promise.all(
        added.map((id) =>
          notify(id, {
            title: "Added to a notebook",
            message: `${me} shared the notebook "${book.name}" with you as ${role === "viewer" ? "a viewer" : "an editor"}.`,
            link: "/internal/xennote",
            icon: "sticky_note_2",
          }),
        ),
      );
      SocketManager.getInstance().notifyXenNoteUpdate(book.members.map((m) => m.user_id));
      if (added.length) {
        await recordActivity({
          actor: callerId(req),
          verb: "xennote.notebook_shared",
          object: { type: "notebook", id: book.id, label: book.name },
          space: { app: "xennote", id: book.id, label: book.name },
          audience: { users: added },
        });
      }
      const counts = await noteCounts([book.id]);
      res.json({
        status: true,
        message: added.length ? `Added ${added.length}` : "Already members",
        data: { notebook: await serializeNotebook(book, callerId(req), counts.get(book.id) ?? 0) },
      });
    },
  );

  app.put(
    "/api/xennote/notebooks/:id/members/:userId",
    validateParams(xenNoteMemberParamSchema),
    validate(xenNoteMemberRoleSchema),
    async (req: Request, res: Response) => {
      const book = await loadNotebook(req, req.params.id as string, "view");
      const result = changeRole(book.toObject(), callerId(req), req.params.userId as string, req.body.role);
      if (!result.ok) throw new AppError(result.code, result.message);
      book.set("members", result.members);
      await book.save();
      SocketManager.getInstance().notifyXenNoteUpdate(book.members.map((m) => m.user_id));
      const counts = await noteCounts([book.id]);
      res.json({
        status: true,
        message: "Saved",
        data: { notebook: await serializeNotebook(book, callerId(req), counts.get(book.id) ?? 0) },
      });
    },
  );

  // The owner removes anyone; anyone else may remove only themselves (leave).
  app.delete(
    "/api/xennote/notebooks/:id/members/:userId",
    validateParams(xenNoteMemberParamSchema),
    async (req: Request, res: Response) => {
      const book = await loadNotebook(req, req.params.id as string, "view");
      const before = book.members.map((m) => m.user_id);
      const result = removeMember(book.toObject(), callerId(req), req.params.userId as string);
      if (!result.ok) throw new AppError(result.code, result.message);
      book.set("members", result.members);
      await book.save();
      SocketManager.getInstance().notifyXenNoteUpdate(before);
      const stillIn = book.members.some((m) => m.user_id === callerId(req));
      const counts = await noteCounts([book.id]);
      res.json({
        status: true,
        message: "Removed",
        data: stillIn ? { notebook: await serializeNotebook(book, callerId(req), counts.get(book.id) ?? 0) } : {},
      });
    },
  );

  // ---- public link (owner only): enable (keeps the current link), rotate, disable
  const share = (action: "enable" | "rotate" | "disable") => async (req: Request, res: Response) => {
    const book = await loadNotebook(req, req.params.id as string, "manage");
    if (action === "disable") book.share = { enabled: false, token: book.share?.token };
    else
      book.share = {
        enabled: true,
        token: action === "enable" && book.share?.token ? book.share.token : randomToken(16),
      };
    await book.save();
    const counts = await noteCounts([book.id]);
    res.json({
      status: true,
      data: { notebook: await serializeNotebook(book, callerId(req), counts.get(book.id) ?? 0) },
    });
  };
  app.post("/api/xennote/notebooks/:id/share", validateParams(xenNoteIdParamSchema), share("enable"));
  app.post("/api/xennote/notebooks/:id/share/rotate", validateParams(xenNoteIdParamSchema), share("rotate"));
  app.delete("/api/xennote/notebooks/:id/share", validateParams(xenNoteIdParamSchema), share("disable"));
}

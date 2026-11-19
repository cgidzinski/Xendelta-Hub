import type { Request, Response } from "express";
import { validateParams, xenNoteIdParamSchema, xenNoteVersionParamSchema } from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { XenNoteVersion } from "../../models/xenNote";
import { User } from "../../models/user";
import { contentOf, keepVersion } from "../../utils/xenNoteVersions";
import { loadNote, notifyChange } from "./shared";

// A note's earlier versions (utils/xenNoteVersions.ts): list them, read one, put one back. Anyone who can see the note
// can look; only someone who can edit it can restore.

const preview = (v: {
  type: string;
  body: string;
  checklist: Array<{ text?: string | null }>;
  link?: { url?: string | null } | null;
}) =>
  (v.type === "checklist"
    ? v.checklist.map((c) => c.text ?? "").join(", ")
    : v.type === "link"
      ? (v.link?.url ?? "")
      : v.body
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

async function namesOf(ids: Array<string | null | undefined>) {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  const users = wanted.length > 0 ? await User.find({ _id: { $in: wanted } }, "username").lean() : [];
  return new Map(users.map((u) => [String(u._id), u.username as string]));
}

export function registerNoteVersionRoutes(app: any) {
  app.get(
    "/api/xennote/notes/:id/versions",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { note } = await loadNote(req, req.params.id as string, "view");
      const versions = await XenNoteVersion.find({ note_id: note._id }).sort({ captured_at: -1 }).lean();
      const names = await namesOf(versions.map((v) => v.by));
      res.json({
        status: true,
        data: {
          versions: versions.map((v) => ({
            _id: String(v._id),
            at: v.at,
            by_name: v.by ? (names.get(v.by) ?? "Someone") : null,
            type: v.type,
            title: v.title,
            preview: preview(v),
          })),
        },
      });
    },
  );

  async function version(req: Request, need: "view" | "edit") {
    const { note, notebook } = await loadNote(req, req.params.id as string, need);
    const v = await XenNoteVersion.findOne({ _id: req.params.versionId, note_id: note._id });
    if (!v) throw new AppError(404, "Version not found");
    return { note, notebook, v };
  }

  app.get(
    "/api/xennote/notes/:id/versions/:versionId",
    validateParams(xenNoteVersionParamSchema),
    async (req: Request, res: Response) => {
      const { v } = await version(req, "view");
      const names = await namesOf([v.by]);
      res.json({
        status: true,
        data: {
          version: {
            _id: String(v._id),
            at: v.at,
            by_name: v.by ? (names.get(v.by) ?? "Someone") : null,
            type: v.type,
            title: v.title,
            body: v.body,
            checklist: v.checklist.map((c) => ({ text: c.text, done: !!c.done })),
            link: { url: v.link?.url ?? "", title: v.link?.title ?? "", description: v.link?.description ?? "" },
          },
        },
      });
    },
  );

  // Put a version back. What the note says now is kept as a version first, so a restore can itself be undone.
  app.post(
    "/api/xennote/notes/:id/versions/:versionId/restore",
    validateParams(xenNoteVersionParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, notebook, v } = await version(req, "edit");
      await keepVersion(note._id, contentOf(note), note.updated_at, note.updated_by ?? note.owner_id, true);
      note.type = v.type;
      note.title = v.title;
      note.body = v.body;
      note.set(
        "checklist",
        v.checklist.map((c) => ({ text: c.text, done: !!c.done })),
      );
      note.link = { url: v.link?.url ?? "", title: v.link?.title ?? "", description: v.link?.description ?? "" };
      note.updated_by = uid;
      await note.save();
      notifyChange(notebook, note.owner_id);
      res.json({ status: true, message: "Version restored" });
    },
  );
}

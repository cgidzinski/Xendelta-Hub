import type { Request, Response } from "express";
import { validateParams, xenNoteIdParamSchema } from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { XenNote } from "../../models/xenNote";
import { purgeDate } from "../../utils/softDelete";
import { deleteNotesForever } from "../../utils/xenNoteTrash";
import { notifyChange, type NoteDoc } from "./shared";

const trashed = (uid: string) =>
  XenNote.find({ deleted_by: uid, deleted_at: { $ne: null } }).setOptions({ includeDeleted: true });

/** A note the caller deleted and that is still in the Trash, or a 404. */
async function trashedNote(req: Request): Promise<NoteDoc> {
  const note = await XenNote.findOne({
    _id: req.params.id,
    deleted_by: callerId(req),
    deleted_at: { $ne: null },
  }).setOptions({ includeDeleted: true });
  if (!note) throw new AppError(404, "Note not found in the Trash");
  return note;
}

/** A line or two of what is in the note, so the Trash shows what each one is. */
function preview(n: NoteDoc): string {
  const text =
    n.type === "checklist"
      ? n.checklist.map((c) => c.text).join(", ")
      : n.type === "link"
        ? n.link?.url || ""
        : n.body || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

export function registerNoteTrashRoutes(app: any) {
  // The notes the caller deleted, newest first, with when each will be removed for good.
  app.get("/api/xennote/trash", async (req: Request, res: Response) => {
    const notes = await trashed(callerId(req)).sort({ deleted_at: -1 }).limit(500);
    res.json({
      status: true,
      data: {
        notes: notes.map((n) => ({
          _id: String(n._id),
          type: n.type,
          title: n.title,
          preview: preview(n),
          color: n.color,
          deleted_at: n.deleted_at,
          purge_at: purgeDate(n.deleted_at as Date),
        })),
      },
    });
  });

  app.post(
    "/api/xennote/trash/:id/restore",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const note = await trashedNote(req);
      note.deleted_at = null;
      note.deleted_by = null;
      await note.save();
      notifyChange(note);
      res.json({ status: true, message: "Note restored" });
    },
  );

  // Delete one note from the Trash for good.
  app.delete("/api/xennote/trash/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const note = await trashedNote(req);
    await deleteNotesForever([note]);
    res.json({ status: true, message: "Note deleted for good" });
  });

  // Empty the Trash.
  app.delete("/api/xennote/trash", async (req: Request, res: Response) => {
    const removed = await deleteNotesForever(await trashed(callerId(req)));
    res.json({ status: true, message: "Trash emptied", data: { removed } });
  });
}

import type { Request, Response } from "express";
import { validateParams, xenNoteTokenParamSchema } from "../../utils/validation";
import { AppError } from "../../utils/http";
import { XenNote, XenNotebook } from "../../models/xenNote";
import { serializePublicNote } from "./shared";

// Public links: read-only views for anyone holding the link. Registered before the auth middleware.
export function registerPublicNoteRoutes(app: any) {
  app.get(
    "/api/xennote/public/note/:token",
    validateParams(xenNoteTokenParamSchema),
    async (req: Request, res: Response) => {
      const note = await XenNote.findOne({ "share.token": req.params.token, "share.enabled": true });
      if (!note) throw new AppError(404, "Link not found");
      res.json({ status: true, data: { note: await serializePublicNote(note) } });
    },
  );

  app.get(
    "/api/xennote/public/notebook/:token",
    validateParams(xenNoteTokenParamSchema),
    async (req: Request, res: Response) => {
      const book = await XenNotebook.findOne({ "share.token": req.params.token, "share.enabled": true });
      if (!book) throw new AppError(404, "Link not found");
      const notes = await XenNote.find({ notebook_id: book._id, archived: { $ne: true } })
        .sort({ pinned: -1, updated_at: -1 })
        .limit(500);
      res.json({
        status: true,
        data: {
          notebook: { name: book.name, color: book.color },
          notes: await Promise.all(notes.map((n) => serializePublicNote(n))),
        },
      });
    },
  );
}

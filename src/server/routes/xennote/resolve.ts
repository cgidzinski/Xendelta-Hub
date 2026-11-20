import type { Request, Response } from "express";
import { validateParams, xenNoteTokenParamSchema } from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { XenNote, XenNotebook } from "../../models/xenNote";
import { roleOf, type MemberRole } from "../../utils/membership";
import { XenNotePage } from "../../models/xenNotePage";
import { pageRole } from "../../utils/xenNotePages";
import { noteRole } from "./shared";

// A signed-in person opening a public link: which of its notes or notebooks are already theirs?
// A member (or the owner of a loose note) is sent to the real page in the app at their own role; anyone else is
// just a holder of the link and sees it read-only. Needs sign-in, so it is registered after the auth middleware.
// The token only ever lets someone read: it never makes them a member.
const reply = (
  res: Response,
  role: MemberRole | null,
  ids: { note_id?: string; page_id?: string; notebook_id: string | null },
) => res.json({ status: true, data: { access: role ? "member" : "link", role, ...ids } });

export function registerSharedLinkRoutes(app: any) {
  app.get(
    "/api/xennote/shared/note/:token",
    validateParams(xenNoteTokenParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const token = req.params.token as string;
      const note = await XenNote.findOne({ "share.token": token, "share.enabled": true });
      if (!note) throw new AppError(404, "Link not found");
      reply(res, noteRole(note, uid), { note_id: note.id as string, notebook_id: null });
    },
  );

  app.get(
    "/api/xennote/shared/notebook/:token",
    validateParams(xenNoteTokenParamSchema),
    async (req: Request, res: Response) => {
      const book = await XenNotebook.findOne({ "share.token": req.params.token, "share.enabled": true });
      if (!book) throw new AppError(404, "Link not found");
      reply(res, roleOf(book.toObject(), callerId(req)), { notebook_id: book.id as string });
    },
  );

  app.get(
    "/api/xennote/shared/page/:token",
    validateParams(xenNoteTokenParamSchema),
    async (req: Request, res: Response) => {
      const page = await XenNotePage.findOne({ "share.token": req.params.token, "share.enabled": true }).lean();
      if (!page) throw new AppError(404, "Link not found");
      const [book, parent] = await Promise.all([
        XenNotebook.findById(page.notebook_id, "members").lean(),
        page.parent_id ? XenNotePage.findById(page.parent_id, "members").lean() : null,
      ]);
      if (!book) throw new AppError(404, "Link not found");
      const uid = callerId(req);
      reply(res, pageRole(page, book, parent, uid), {
        page_id: String(page._id),
        notebook_id: roleOf(book, uid) ? String(book._id) : null,
      });
    },
  );
}

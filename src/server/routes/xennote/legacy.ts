import type { Request, Response } from "express";
import { XenNotePage } from "../../models/xenNotePage";
import { XenNote, XenNotebook } from "../../models/xenNote";
import { AppError, callerId } from "../../utils/http";
import { canView } from "../../utils/membership";
import { validateParams, xenNoteIdParamSchema } from "../../utils/validation";
import { loadPage } from "./pageAccess";
import { loadNote, type NotebookDoc } from "./shared";

export async function requireLegacyNotebook(notebook: NotebookDoc) {
  if (
    notebook.pages_migrated_at ||
    (await XenNotebook.db.collection("xennote_migration_state").findOne({
      name: "notebook-pages",
      active: true,
    }))
  )
    throw new AppError(410, "This notebook uses pages. Open it in the current version of XenNote.");
}

async function locatePage(req: Request, id: string) {
  if (!(await XenNotePage.exists({ _id: id, migrated_from_note: true }))) return null;
  const result = await loadPage(req, id, "view").catch((error: unknown) => {
    if (error instanceof AppError && error.status === 404) return null;
    throw error;
  });
  if (!result) return null;
  const { page, notebook } = result;
  return {
    kind: "page" as const,
    id: page.id as string,
    notebook_id: canView(notebook, callerId(req)) ? (notebook.id as string) : null,
  };
}

export async function rejectMigratedNote(req: Request, id: string) {
  const location = await locatePage(req, id);
  if (location) throw new AppError(410, "This note is now a notebook page.", { location });
}

export function registerLegacyNoteRoutes(app: any) {
  app.get("/api/xennote/locate/:id", validateParams(xenNoteIdParamSchema), async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const page = await locatePage(req, id);
    if (page) return res.json({ status: true, data: page });
    await loadNote(req, id, "view");
    return res.json({ status: true, data: { kind: "note", id } });
  });
}

export const migratedLink = (token: string) =>
  XenNotePage.findOne({ "share.token": token, "share.enabled": true, migrated_from_note: true });

export const existsLegacyNote = (token: string) => XenNote.findOne({ "share.token": token, "share.enabled": true });

import type { Request, Response } from "express";
import { XenNotePageVersion } from "../../models/xenNotePage";
import { AppError, callerId } from "../../utils/http";
import { validateParams, xenNoteIdParamSchema, xenNoteVersionParamSchema } from "../../utils/validation";
import { filesOfPage, writePageBody } from "../../utils/xenNotePages";
import { SocketManager } from "../../infrastructure/SocketManager";
import { loadPage, markNotebookChanged, pageAudience } from "./pageAccess";
import { fileMapFor } from "./pages";

export function registerPageHistoryRoutes(app: any) {
  app.get(
    "/api/xennote/pages/:id/history",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { page } = await loadPage(req, req.params.id as string, "view");
      const versions = await XenNotePageVersion.find({ page_id: page._id }, "at by title captured_at")
        .sort({ captured_at: -1, _id: -1 })
        .limit(20)
        .lean();
      res.json({ status: true, data: versions.map(({ _id, ...version }) => ({ ...version, id: String(_id) })) });
    },
  );

  const getVersion = async (pageId: unknown, versionId: string) => {
    const version = await XenNotePageVersion.findOne({ _id: versionId, page_id: pageId }).lean();
    if (!version) throw new AppError(404, "Version not found");
    return version;
  };

  app.get(
    "/api/xennote/pages/:id/history/:versionId",
    validateParams(xenNoteVersionParamSchema),
    async (req: Request, res: Response) => {
      const { id, versionId } = xenNoteVersionParamSchema.parse(req.params);
      const { page } = await loadPage(req, id, "view");
      const version = await getVersion(page._id, versionId);
      const files = await filesOfPage(id, version.files.map(String));
      res.json({
        status: true,
        data: { id: versionId, title: version.title, doc: version.doc, files: await fileMapFor([...files]) },
      });
    },
  );

  app.post(
    "/api/xennote/pages/:id/history/:versionId/restore",
    validateParams(xenNoteVersionParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { id, versionId } = xenNoteVersionParamSchema.parse(req.params);
      const { page, notebook, parent } = await loadPage(req, id, "edit");
      const version = await getVersion(page._id, versionId);
      const saved = await writePageBody(page, version.doc, uid, page.rev, version.title);
      await markNotebookChanged(notebook);
      SocketManager.getInstance().notifyXenNotePageUpdate(pageAudience(notebook, page, parent), {
        pageId: id,
        notebookId: String(notebook._id),
        rev: saved.rev,
        by: uid,
      });
      res.json({ status: true, data: saved });
    },
  );
}

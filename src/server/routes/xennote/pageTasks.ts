import type { Request, Response } from "express";
import type { JSONContent } from "@tiptap/core";
import { XenNotebook } from "../../models/xenNote";
import { XenNotePage, XenNotePageBody } from "../../models/xenNotePage";
import { AppError, callerId } from "../../utils/http";
import { canView } from "../../utils/membership";
import {
  validate,
  validateParams,
  validateQuery,
  xenNoteBlockParamSchema,
  xenNoteTasksQuerySchema,
  xenNoteToggleTaskSchema,
} from "../../utils/validation";
import { visiblePagesFilter } from "../../utils/xenNotePageSearch";
import { pageRole, writePageBody } from "../../utils/xenNotePages";
import { SocketManager } from "../../infrastructure/SocketManager";
import { loadPage, markNotebookChanged, pageAudience } from "./pageAccess";
import { loadNotebook } from "./shared";
import { walkBlocks } from "../../../shared/xennote/blockReferences";
import type { ListedTask } from "../../../shared/xennote/tasks";

const LIMIT = 1000;

export function registerTaskRoutes(app: any) {
  app.get("/api/xennote/tasks", validateQuery(xenNoteTasksQuerySchema), async (req: Request, res: Response) => {
    const uid = callerId(req);
    const { notebook, done } = xenNoteTasksQuerySchema.parse(req.query);
    const book = notebook ? await loadNotebook(req, notebook, "view") : null;
    const pageScope = book ? { notebook_id: book._id } : await visiblePagesFilter(uid);
    const rows = await XenNotePage.find(
      {
        ...pageScope,
        archived: { $ne: true },
        "task_items.done": done === "true",
      },
      "title notebook_id parent_id members task_items",
    )
      .sort({ updated_at: -1, _id: 1 })
      .limit(LIMIT + 1)
      .lean();
    const [books, parents] = await Promise.all([
      XenNotebook.find({ _id: { $in: rows.map((p) => p.notebook_id) } }, "name members").lean(),
      XenNotePage.find({ _id: { $in: rows.flatMap((p) => (p.parent_id ? [p.parent_id] : [])) } }, "members").lean(),
    ]);
    const notebooks = new Map(books.map((b) => [String(b._id), b]));
    const byParent = new Map(parents.map((p) => [String(p._id), p]));
    const items: ListedTask[] = [];
    for (const row of rows) {
      const id = String(row.notebook_id);
      const notebook = notebooks.get(id);
      if (!notebook) continue;
      const role = pageRole(row, notebook, row.parent_id ? (byParent.get(String(row.parent_id)) ?? null) : null, uid);
      if (!role) continue;
      const member = canView(notebook, uid);
      for (const task of row.task_items) {
        if (task.done !== (done === "true")) continue;
        items.push({
          block_id: task.block_id,
          text: task.text,
          done: task.done,
          page_id: String(row._id),
          page_title: row.title,
          notebook_id: member ? id : null,
          notebook_name: member ? notebook.name : null,
          can_edit: role !== "viewer",
        });
        if (items.length > LIMIT) break;
      }
      if (items.length > LIMIT) break;
    }
    res.json({
      status: true,
      data: { items: items.slice(0, LIMIT), truncated: items.length > LIMIT || rows.length > LIMIT },
    });
  });

  app.put(
    "/api/xennote/pages/:id/tasks/:blockId",
    validateParams(xenNoteBlockParamSchema),
    validate(xenNoteToggleTaskSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { id, blockId } = xenNoteBlockParamSchema.parse(req.params);
      const { checked } = xenNoteToggleTaskSchema.parse(req.body);
      const { page, notebook, parent } = await loadPage(req, id, "edit");
      const body = await XenNotePageBody.findOne({ page_id: page._id }, "doc rev").lean();
      if (!body) throw new AppError(404, "Task not found");
      let found = false;
      let changed = false;
      const doc: JSONContent = body.doc;
      walkBlocks(doc, (node) => {
        if (node.type !== "taskItem" || node.attrs?.id !== blockId) return;
        found = true;
        changed = node.attrs?.checked !== checked;
        node.attrs = { ...node.attrs, checked };
      });
      if (!found) throw new AppError(404, "Task not found");
      if (changed) {
        const saved = await writePageBody(page, doc, uid, body.rev, undefined, true);
        await markNotebookChanged(notebook);
        SocketManager.getInstance().notifyXenNotePageUpdate(pageAudience(notebook, page, parent), {
          pageId: id,
          notebookId: String(notebook._id),
          rev: saved.rev,
          by: uid,
        });
      }
      res.json({ status: true, data: { checked } });
    },
  );
}

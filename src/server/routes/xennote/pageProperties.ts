import type { Request, Response } from "express";
import { XenNotePage } from "../../models/xenNotePage";
import { AppError, callerId } from "../../utils/http";
import { validate, validateParams, xenNoteIdParamSchema } from "../../utils/validation";
import { visiblePagesFilter } from "../../utils/xenNotePageSearch";
import { loadPage, markNotebookChanged, notifyTree } from "./pageAccess";
import { pagePropertiesSchema, pageQuerySchema } from "../../../shared/xennote/properties";

export function registerPagePropertyRoutes(app: any) {
  app.put(
    "/api/xennote/pages/:id/properties",
    validateParams(xenNoteIdParamSchema),
    validate(pagePropertiesSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page, notebook } = await loadPage(req, req.params.id as string, "edit");
      const { properties } = pagePropertiesSchema.parse(req.body);
      const changed = await XenNotePage.updateOne(
        { _id: page._id },
        {
          $set: { properties, updated_by: uid, updated_at: new Date() },
        },
      );
      if (!changed.matchedCount) throw new AppError(404, "Page not found");
      await markNotebookChanged(notebook);
      notifyTree(notebook);
      res.json({ status: true, data: { properties } });
    },
  );

  app.post(
    "/api/xennote/pages/:id/query",
    validateParams(xenNoteIdParamSchema),
    validate(pageQuerySchema),
    async (req: Request, res: Response) => {
      const { notebook } = await loadPage(req, req.params.id as string, "view");
      const { key, type, operator, value, limit } = pageQuerySchema.parse(req.body);
      const filter = {
        key,
        type,
        ...(operator === "exists"
          ? {}
          : {
              value: operator === "equals" ? value : operator === "atLeast" ? { $gte: value } : { $lte: value },
            }),
      };
      const scope = await visiblePagesFilter(callerId(req));
      const result = await XenNotePage.find(
        {
          ...scope,
          notebook_id: notebook._id,
          archived: { $ne: true },
          properties: { $elemMatch: filter },
        },
        { title: 1, properties: { $elemMatch: filter } },
      )
        .sort({ updated_at: -1, _id: 1 })
        .limit(limit)
        .lean();
      res.json({
        status: true,
        data: result.map((row) => ({ id: String(row._id), title: row.title, value: row.properties[0]?.value })),
      });
    },
  );
}

import type { Request, Response } from "express";
import { validateQuery, xenNoteSearchQuerySchema } from "../../utils/validation";
import { callerId } from "../../utils/http";
import { searchPages } from "../../utils/xenNotePageSearch";

// Search inside XenNote's notebooks: by name (title and aliases), then by what a page says, optionally in one notebook
// or with one tag. Only pages the person can see (utils/xenNotePageSearch.ts).

export function registerPageSearchRoutes(app: any) {
  app.get("/api/xennote/search", validateQuery(xenNoteSearchQuerySchema), async (req: Request, res: Response) => {
    const { q, notebook, tag } = xenNoteSearchQuerySchema.parse(req.query);
    res.json({ status: true, data: { pages: await searchPages(callerId(req), { q, notebook, tag }) } });
  });
}

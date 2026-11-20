import type { Request, Response } from "express";
import type { JSONContent } from "@tiptap/core";
import { XenNotebook } from "../../models/xenNote";
import { XenNotePage, XenNotePageBody, XenNoteSection } from "../../models/xenNotePage";
import { AppError, callerId } from "../../utils/http";
import { filesOfPage } from "../../utils/xenNotePages";
import { signedUrlsFor } from "../../utils/appFiles";
import {
  validateParams,
  xenNoteBlockParamSchema,
  xenNoteIdParamSchema,
  xenNotePublicBlockParamSchema,
} from "../../utils/validation";
import { visiblePagesFilter } from "../../utils/xenNotePageSearch";
import { loadPage } from "./pageAccess";
import { blockIdPattern, walkBlocks, type BlockPreview } from "../../../shared/xennote/blockReferences";
import { deriveFromDoc } from "../../../shared/xennote/deriveFromDoc";

interface BlockPage {
  _id: unknown;
  title: string;
  files: unknown[];
}

const locked = { status: "locked" } as const;
const excerptOf = (block: JSONContent) =>
  deriveFromDoc(block).search_text.slice(0, 800) ||
  String(block.attrs?.name || block.attrs?.alt || block.type || "Block");

export async function blockPreview(page: BlockPage, id: string): Promise<BlockPreview> {
  const body = await XenNotePageBody.findOne({ page_id: page._id }, "doc").lean();
  let block: JSONContent | undefined;
  if (body?.doc)
    walkBlocks(body.doc, (node) => {
      if (!block && node.attrs?.id === id) block = node;
    });
  if (!block) return { status: "removed" };
  const selected: JSONContent = block;
  const type = selected.type ?? "paragraph";
  let url: string | undefined;
  const file = selected.attrs?.file_id;
  if (
    (type === "fileBlock" || type === "imageBlock") &&
    typeof file === "string" &&
    page.files.map(String).includes(file)
  ) {
    const files = await filesOfPage(String(page._id), [file]);
    url = (await signedUrlsFor([...files], 60)).get(file);
  }
  return {
    status: "available",
    title: page.title || "Untitled page",
    excerpt: excerptOf(selected),
    type,
    url,
    name: typeof selected.attrs?.name === "string" ? selected.attrs.name : undefined,
  };
}

const reply = (res: Response, data: BlockPreview) => res.json({ status: true, data });

export function registerPublicBlockRoutes(app: any) {
  app.get(
    "/api/xennote/public/page/:token/blocks/:id/:blockId",
    validateParams(xenNotePublicBlockParamSchema),
    async (req: Request, res: Response) => {
      const { token, id, blockId } = xenNotePublicBlockParamSchema.parse(req.params);
      const page = await XenNotePage.findOne(
        { _id: id, "share.token": token, "share.enabled": true },
        "title files notebook_id",
      ).lean();
      if (!page || !(await XenNotebook.exists({ _id: page.notebook_id }))) return reply(res, locked);
      return reply(res, await blockPreview(page, blockId));
    },
  );
  app.get(
    "/api/xennote/public/notebook/:token/blocks/:id/:blockId",
    validateParams(xenNotePublicBlockParamSchema),
    async (req: Request, res: Response) => {
      const { token, id, blockId } = xenNotePublicBlockParamSchema.parse(req.params);
      const book = await XenNotebook.findOne({ "share.token": token, "share.enabled": true }, "_id").lean();
      if (!book) return reply(res, locked);
      const page = await XenNotePage.findOne(
        { _id: id, notebook_id: book._id, archived: { $ne: true } },
        "title files section_id parent_id",
      ).lean();
      if (!page) return reply(res, locked);
      const [section, parent] = await Promise.all([
        XenNoteSection.exists({ _id: page.section_id, notebook_id: book._id }),
        page.parent_id
          ? XenNotePage.exists({ _id: page.parent_id, section_id: page.section_id, archived: { $ne: true } })
          : true,
      ]);
      return reply(res, section && parent ? await blockPreview(page, blockId) : locked);
    },
  );
}

export function registerBlockRoutes(app: any) {
  app.get(
    "/api/xennote/pages/:id/blocks",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { page } = await loadPage(req, req.params.id as string, "view");
      const body = await XenNotePageBody.findOne({ page_id: page._id }, "doc").lean();
      const blocks: Array<{ id: string; excerpt: string }> = [];
      if (body?.doc)
        walkBlocks(body.doc, (node) => {
          const id = node.attrs?.id;
          if (typeof id === "string" && blockIdPattern.test(id) && blocks.length < 400)
            blocks.push({ id, excerpt: excerptOf(node) });
        });
      res.json({ status: true, data: blocks });
    },
  );

  app.get(
    "/api/xennote/pages/:id/blocks/:blockId",
    validateParams(xenNoteBlockParamSchema),
    async (req: Request, res: Response) => {
      const { id, blockId } = xenNoteBlockParamSchema.parse(req.params);
      try {
        const { page } = await loadPage(req, id, "view");
        return reply(res, await blockPreview(page, blockId));
      } catch (error) {
        if (error instanceof AppError && error.status === 404) return reply(res, locked);
        throw error;
      }
    },
  );

  app.get(
    "/api/xennote/pages/:id/blocks/:blockId/backlinks",
    validateParams(xenNoteBlockParamSchema),
    async (req: Request, res: Response) => {
      const { id, blockId } = xenNoteBlockParamSchema.parse(req.params);
      await loadPage(req, id, "view");
      const visible = await visiblePagesFilter(callerId(req));
      const rows = await XenNotePage.find(
        {
          ...visible,
          block_refs: { $elemMatch: { page_id: id, block_id: blockId } },
        },
        "title",
      )
        .sort({ updated_at: -1 })
        .limit(100)
        .lean();
      res.json({ status: true, data: rows.map((p) => ({ id: String(p._id), title: p.title })) });
    },
  );
}

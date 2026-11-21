import type { JSONContent } from "@tiptap/core";
import { blockTarget, deriveBlockRefs } from "../../../shared/xennote/blockReferences";
import { visiblePagesFilter } from "../../utils/xenNotePageSearch";
import { blockPreview } from "./pageBlocks";
import { callerId } from "../../utils/http";
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import { XenNotePage, XenNotePageBody, XenNoteSection } from "../../models/xenNotePage";
import { FileRecord } from "../../models/fileRecord";
import { privateStore } from "../../storage";
import { signedUrlsFor } from "../../utils/appFiles";
import { filesOfPage } from "../../utils/xenNotePages";
import { validateParams, xenNoteIdParamSchema } from "../../utils/validation";
import { docToMarkdown } from "../../../shared/xennote/convert/v1/docToMarkdown";
import { emptyDoc } from "../../../shared/xennote/pageSchema";
import { loadNotebook } from "./shared";
import { loadPage } from "./pageAccess";

const filename = (name: string) =>
  Array.from(name)
    .filter((character) => character >= " ")
    .join("")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 90) || "Untitled";
const filePath = (id: string, name: string) => `files/${id}-${filename(name)}`;
const markdownPath = (path: string) =>
  path
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/[()]/g, (x) => (x === "(" ? "%28" : "%29")))
    .join("/");
const markdownTitle = (title: string) => `# ${(title || "Untitled").replace(/[\r\n]+/g, " ")}\n\n`;

interface Entry {
  path: string;
  stream: AsyncIterable<Buffer>;
}

/** Stream a ZIP archive with UTF-8 names and stored entries, buffering only the central directory. */
async function* archive(entries: AsyncIterable<Entry>) {
  let offset = 0;
  const directory: Buffer[] = [];
  for await (const entry of entries) {
    const name = Buffer.from(entry.path);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x808, 6); // UTF-8 names, CRC and sizes after the payload.
    header.writeUInt16LE(0x21, 12); // January 1, 1980.
    header.writeUInt16LE(name.length, 26);
    const start = offset;
    yield header;
    yield name;
    let size = 0;
    let checksum = 0;
    for await (const chunk of entry.stream) {
      checksum = crc32(chunk, checksum);
      size += chunk.length;
      if (size > 0xffffffff || start + size > 0xffffffff) throw new Error("Notebook export exceeds the ZIP size limit");
      yield chunk;
    }
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(checksum, 4);
    descriptor.writeUInt32LE(size, 8);
    descriptor.writeUInt32LE(size, 12);
    yield descriptor;
    offset += header.length + name.length + size + descriptor.length;

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x808, 8);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(start, 42);
    directory.push(Buffer.concat([central, name]));
    if (directory.length > 0xffff) throw new Error("Notebook export contains too many files");
  }
  const bytes = directory.reduce((sum, entry) => sum + entry.length, 0);
  for (const entry of directory) yield entry;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(directory.length, 8);
  end.writeUInt16LE(directory.length, 10);
  end.writeUInt32LE(bytes, 12);
  end.writeUInt32LE(offset, 16);
  yield end;
}

async function expandEmbeds(doc: JSONContent, visible: Record<string, unknown>) {
  const targets = deriveBlockRefs(doc);
  if (!targets.length) return doc;
  const pages = await XenNotePage.find(
    { $and: [visible, { _id: { $in: targets.map((t) => t.page_id) } }] },
    "title files",
  ).lean();
  const available = new Map(pages.map((page) => [String(page._id), page]));
  const previews = new Map<string, string>();
  for (const target of targets) {
    const page = available.get(target.page_id);
    if (!page) continue;
    const block = await blockPreview(page, target.block_id);
    previews.set(
      `${target.page_id}:${target.block_id}`,
      block.status === "available" ? block.excerpt : "Block removed",
    );
  }
  const walk = (node: JSONContent): JSONContent => {
    if (node.type === "blockRef" || node.type === "blockEmbed") {
      const target = blockTarget(node);
      const contents = (target && previews.get(`${target.page_id}:${target.block_id}`)) || "Locked block";
      const inline = { type: "text", text: contents };
      return node.type === "blockRef"
        ? inline
        : { type: "blockquote", content: [{ type: "paragraph", content: [inline] }] };
    }
    return node.content ? { ...node, content: node.content.map(walk) } : node;
  };
  return walk(doc);
}

export function registerPageExportRoutes(app: any) {
  app.get(
    "/api/xennote/pages/:id/export",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const { page } = await loadPage(req, req.params.id as string, "view");
      const [body, allowed] = await Promise.all([
        XenNotePageBody.findOne({ page_id: page._id }, "doc").lean(),
        filesOfPage(String(page._id), page.files.map(String)),
      ]);
      const files = await signedUrlsFor([...allowed], 60);
      const doc = await expandEmbeds(body?.doc ?? emptyDoc(), await visiblePagesFilter(callerId(req)));
      const text = docToMarkdown(doc, { fileUrl: (id) => files.get(id) ?? "" });
      res
        .attachment(`${filename(page.title)}.md`)
        .type("text/markdown")
        .send(markdownTitle(page.title) + text);
    },
  );

  app.get(
    "/api/xennote/notebooks/:id/export",
    validateParams(xenNoteIdParamSchema),
    async (req: Request, res: Response) => {
      const notebook = await loadNotebook(req, req.params.id as string, "view");
      const [sections, pages] = await Promise.all([
        XenNoteSection.find({ notebook_id: notebook._id }, "name").lean(),
        XenNotePage.find({ notebook_id: notebook._id }, "title section_id files").sort({ order: 1, _id: 1 }).lean(),
      ]);
      const sectionNames = new Map(sections.map((section) => [String(section._id), filename(section.name)]));
      const pageNames = new Map(pages.map((page) => [String(page._id), page.title]));
      const ids = new Set<string>();
      async function* entries(): AsyncIterable<Entry> {
        for (const page of pages) {
          const section = sectionNames.get(String(page.section_id));
          if (!section) continue;
          const [body, fileRows] = await Promise.all([
            XenNotePageBody.findOne({ page_id: page._id }, "doc").lean(),
            FileRecord.find(
              {
                _id: { $in: page.files },
                "space.app": "xennote",
                "space.ref": String(page._id),
                bucket: "private",
              },
              "name key",
            ).lean(),
          ]);
          const names = new Map(fileRows.map((file) => [String(file._id), filePath(String(file._id), file.name)]));
          const text = docToMarkdown(body?.doc ?? emptyDoc(), {
            pageTitle: (id, stored) => pageNames.get(id) || stored,
            fileUrl: (id) => {
              const path = names.get(id);
              return path ? `../${markdownPath(path)}` : "";
            },
          });
          const pagePath = `${section}/${filename(page.title)}-${page._id}.md`;
          yield { path: pagePath, stream: Readable.from([Buffer.from(markdownTitle(page.title) + text)]) };
          for (const file of fileRows) {
            const id = String(file._id);
            if (ids.has(id)) continue;
            ids.add(id);
            yield { path: names.get(id) as string, stream: await privateStore.read(file.key) };
          }
        }
      }
      res.attachment(`${filename(notebook.name)}.zip`).type("application/zip");
      await pipeline(Readable.from(archive(entries())), res);
    },
  );
}

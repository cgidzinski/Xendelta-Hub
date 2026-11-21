import { Types, type HydratedDocument } from "mongoose";
import type { JSONContent } from "@tiptap/core";
import { FileRecord } from "../models/fileRecord";
import {
  XenNotePage,
  XenNotePageBody,
  XenNotePageVersion,
  XenNoteSection,
  type XenNotePageAttrs,
} from "../models/xenNotePage";
import { pageQuerySchema } from "../../shared/xennote/properties";
import { deriveTasks } from "../../shared/xennote/tasks";
import { blockTarget, deriveBlockRefs } from "../../shared/xennote/blockReferences";
import { deriveFromDoc } from "../../shared/xennote/deriveFromDoc";
import { MAX_PAGE_TAGS, MAX_PAGE_VERSIONS, PAGE_SCHEMA_VERSION } from "../../shared/xennote/pages";
import { canEdit, type MemberRole } from "./membership";
import { checkPageDoc, stripUnsafeLinks } from "../../shared/xennote/pageSchema";
import { AppError } from "./http";
import { removeAppFiles } from "./appFiles";
import { trashCutoff } from "./softDelete";
import { VERSION_GAP_MS } from "./xenNoteVersions";

export const XENNOTE_APP = "xennote";

type People = { members: Array<{ user_id: string; role: MemberRole }> };

/** Moving or deleting a page requires notebook edit access. */
export const canManagePage = (notebook: People | null, uid: string): boolean => !!notebook && canEdit(notebook, uid);

const isId = (value: unknown): value is string =>
  typeof value === "string" && Types.ObjectId.isValid(value) && /^[0-9a-f]{24}$/i.test(value);

/** Every stored file a body shows (image and file blocks), as ids. */
export function referencedFileIds(doc: JSONContent): string[] {
  const ids = new Set<string>();
  const walk = (node: JSONContent) => {
    if ((node.type === "imageBlock" || node.type === "fileBlock") && isId(node.attrs?.file_id)) {
      ids.add(node.attrs!.file_id);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return [...ids];
}

/**
 * Make a body safe to store and later show to other people:
 *  - an address that isn't http(s) loses its link;
 *  - an image or file block keeps its file only if that file really belongs to this page (`allowedFileIds`), so nobody
 *    can name another person's file in their page and have it shown through a link;
 *  - a page link keeps its target only if it is a well-formed id.
 */
export function sanitizePageDoc(doc: JSONContent, allowedFileIds: ReadonlySet<string>): JSONContent {
  const walk = (node: JSONContent): JSONContent => {
    let next = node;
    if (node.type === "imageBlock" || node.type === "fileBlock") {
      const id = node.attrs?.file_id;
      if (id != null && !(isId(id) && allowedFileIds.has(id)))
        next = { ...next, attrs: { ...node.attrs, file_id: null } };
    } else if (node.type === "wikiLink") {
      const id = node.attrs?.page_id;
      if (id != null && !isId(id)) next = { ...next, attrs: { ...node.attrs, page_id: null } };
    }
    if ((node.type === "blockRef" || node.type === "blockEmbed") && !blockTarget(node)) {
      next = { ...next, attrs: { ...next.attrs, page_id: null, block_id: null } };
    }
    if (node.type === "pageQuery") {
      const parsed = pageQuerySchema.safeParse(node.attrs?.query);
      next = { ...next, attrs: { ...next.attrs, query: parsed.success ? parsed.data : null } };
    }
    if (node.content) next = { ...next, content: node.content.map(walk) };
    return next;
  };
  return walk(stripUnsafeLinks(doc));
}

/** Which of these files belong to the page: uploaded to it, so they are tagged with its id. */
export async function filesOfPage(pageId: string, fileIds: string[]): Promise<Set<string>> {
  if (fileIds.length === 0) return new Set();
  const rows = await FileRecord.find(
    { _id: { $in: fileIds }, "space.app": XENNOTE_APP, "space.ref": pageId },
    "_id",
  ).lean();
  return new Set(rows.map((r) => String(r._id)));
}

interface Before {
  doc: unknown;
  title: string;
  files: unknown[];
  at: Date;
  by: string | null;
}

/**
 * Keep how a page's body stood before a save replaced it, unless the newest kept version is recent enough to stand in
 * for it (typing autosaves, so without the wait a few minutes of writing would use every slot). `force` skips the wait:
 * a save over somebody else's newer one always keeps what it replaced. At most MAX_PAGE_VERSIONS are kept.
 */
export async function keepPageVersion(pageId: unknown, before: Before, force = false): Promise<boolean> {
  if (!force) {
    const newest = await XenNotePageVersion.findOne({ page_id: pageId }, "captured_at")
      .sort({ captured_at: -1 })
      .lean();
    if (newest && Date.now() - newest.captured_at.getTime() < VERSION_GAP_MS) return false;
  }
  await XenNotePageVersion.create({
    page_id: pageId,
    at: before.at,
    by: before.by,
    title: before.title,
    doc: before.doc,
    files: before.files,
  });
  const extra = await XenNotePageVersion.find({ page_id: pageId }, "_id")
    .sort({ captured_at: -1 })
    .skip(MAX_PAGE_VERSIONS)
    .lean();
  if (extra.length > 0) await XenNotePageVersion.deleteMany({ _id: { $in: extra.map((v) => v._id) } });
  return true;
}

/** Delete the files uploaded to these pages from storage and from their owners' files. */
export async function removePageFiles(pageIds: unknown[]): Promise<void> {
  if (pageIds.length === 0) return;
  const rows = await FileRecord.find(
    { "space.app": XENNOTE_APP, "space.ref": { $in: pageIds.map(String) } },
    "_id",
  ).lean();
  await removeAppFiles(rows.map((r) => r._id));
}

/**
 * Remove the pages matching `filter` for good, whether or not they are in the trash: their files, bodies and history
 * go first, then the pages. Returns how many were removed.
 */
export async function deletePagesForever(filter: Record<string, unknown>): Promise<number> {
  const pages = await XenNotePage.find(filter, "_id").setOptions({ includeDeleted: true }).lean();
  const ids = pages.map((p) => p._id);
  if (ids.length === 0) return 0;
  await removePageFiles(ids).catch((e) => console.error("xennote page file cleanup failed:", e));
  await Promise.all([
    XenNotePageBody.deleteMany({ page_id: { $in: ids } }),
    XenNotePageVersion.deleteMany({ page_id: { $in: ids } }),
  ]);
  await XenNotePage.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

/** Remove everything a notebook holds (sections, pages, bodies, history, files), for when the notebook is deleted. */
export async function deleteNotebookPages(notebookId: unknown): Promise<void> {
  await deletePagesForever({ notebook_id: notebookId });
  await XenNoteSection.deleteMany({ notebook_id: notebookId });
}

/** Put a page in the Trash. */
export async function trashPage(pageId: unknown, uid: string, now = new Date()): Promise<void> {
  await XenNotePage.updateOne({ _id: pageId }, { $set: { deleted_at: now, deleted_by: uid } });
}

/** Bring a page back from the Trash. */
export async function restorePage(pageId: unknown): Promise<void> {
  const clear = { $set: { deleted_at: null, deleted_by: null, deleted_with: null } };
  await XenNotePage.updateOne({ _id: pageId }, clear).setOptions({ includeDeleted: true });
}

/** Put a section in the Trash, and the pages in it that were not already there (they come back with it). */
export async function trashSection(sectionId: unknown, uid: string, now = new Date()): Promise<void> {
  await XenNotePage.updateMany(
    { section_id: sectionId },
    { $set: { deleted_at: now, deleted_by: uid, deleted_with: sectionId } },
  );
  await XenNoteSection.updateOne({ _id: sectionId }, { $set: { deleted_at: now, deleted_by: uid } });
}

/** Bring a section back with exactly the pages that went to the Trash with it. */
export async function restoreSection(sectionId: unknown): Promise<void> {
  const clear = { $set: { deleted_at: null, deleted_by: null, deleted_with: null } };
  await XenNotePage.updateMany({ deleted_with: sectionId }, clear).setOptions({ includeDeleted: true });
  await XenNoteSection.updateOne({ _id: sectionId }, clear).setOptions({ includeDeleted: true });
}

/** Remove a section and everything in it for good. */
export async function deleteSectionForever(sectionId: unknown): Promise<void> {
  await deletePagesForever({ section_id: sectionId });
  await XenNoteSection.deleteOne({ _id: sectionId });
}

/** The daily purge: sections and pages that have been in the Trash for 30 days. Returns how many were removed. */
export async function purgeExpiredPages(now = new Date()): Promise<number> {
  const cutoff = trashCutoff(now);
  let removed = 0;
  const sections = await XenNoteSection.find({ deleted_at: { $lte: cutoff } }, "_id")
    .setOptions({ includeDeleted: true })
    .limit(100)
    .lean();
  for (const s of sections) {
    await deleteSectionForever(s._id);
    removed += 1;
  }
  const pages = await XenNotePage.find({ deleted_at: { $lte: cutoff } }, "_id")
    .setOptions({ includeDeleted: true })
    .limit(500)
    .lean();
  removed += await deletePagesForever({ _id: { $in: pages.map((p) => p._id) } });
  return removed;
}

/** The tags a page shows: those written in the text and those added as properties, each once. */
export const unionTags = (inline: string[], manual: string[]): string[] =>
  [...new Set([...inline, ...manual])].slice(0, MAX_PAGE_TAGS);

/**
 * Save a page's text: check it against the page schema and size limit, remove what must not be stored (unsafe links, files
 * that don't belong to the page), work out the derived fields, keep what it replaces as a version when needed, and bump
 * the revision. `baseRev` is the revision the change started from; a save over a newer one still goes through (the last
 * save wins for now), keeps what it replaced as a version regardless of the usual wait, and reports `conflict`.
 */
export async function writePageBody(
  page: HydratedDocument<XenNotePageAttrs>,
  docInput: unknown,
  uid: string,
  baseRev: number,
  restoredTitle?: string,
  requireCurrentRev = false,
): Promise<{ rev: number; conflict: boolean }> {
  const checked = checkPageDoc(docInput);
  if (!checked.ok) throw new AppError(400, checked.reason);
  const allowed = await filesOfPage(page.id as string, referencedFileIds(checked.doc));
  // Through JSON, so no `undefined` is stored as null.
  const clean = JSON.parse(JSON.stringify(sanitizePageDoc(checked.doc, allowed)));
  const derived = deriveFromDoc(clean);

  const before = await XenNotePageBody.findOne({ page_id: page._id }).lean();
  const conflict = baseRev !== page.rev;
  if (requireCurrentRev && (conflict || before?.rev !== baseRev))
    throw new AppError(409, "The page just changed. Try again.");
  if (before && (restoredTitle !== undefined || JSON.stringify(before.doc) !== JSON.stringify(clean))) {
    await keepPageVersion(
      page._id,
      { doc: before.doc, title: page.title, files: page.files, at: before.updated_at, by: page.updated_by ?? null },
      conflict || restoredTitle !== undefined,
    );
  }

  const now = new Date();
  const saved = await XenNotePage.findOneAndUpdate(
    { _id: page._id, ...(requireCurrentRev ? { rev: baseRev } : {}) },
    {
      $set: {
        ...(restoredTitle === undefined ? {} : { title: restoredTitle }),
        links: derived.links,
        block_refs: deriveBlockRefs(clean),
        unresolved: derived.unresolved,
        tags_inline: derived.tags,
        tags: unionTags(derived.tags, page.tags_manual),
        files: derived.files,
        search_text: derived.search_text,
        excerpt: derived.excerpt,
        todo: derived.todo,
        task_items: deriveTasks(clean),
        word_count: derived.word_count,
        updated_by: uid,
        updated_at: now,
      },
      $inc: { rev: 1 },
    },
    { new: true },
  );
  if (!saved) {
    if (requireCurrentRev) throw new AppError(409, "The page just changed. Try again.");
    throw new AppError(404, "Page not found");
  }
  await XenNotePageBody.findOneAndUpdate(
    { page_id: page._id },
    [
      {
        $set: Object.fromEntries(
          Object.entries({
            doc: clean,
            schema_version: PAGE_SCHEMA_VERSION,
            rev: saved.rev,
            updated_at: now,
          }).map(([field, value]) => [
            field,
            { $cond: [{ $lte: [{ $ifNull: ["$rev", -1] }, saved.rev] }, { $literal: value }, "$" + field] },
          ]),
        ),
      },
    ],
    { upsert: true },
  );
  return { rev: saved.rev, conflict };
}

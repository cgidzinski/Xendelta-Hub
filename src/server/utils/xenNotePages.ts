import { Types } from "mongoose";
import type { JSONContent } from "@tiptap/core";
import { FileRecord } from "../models/fileRecord";
import { XenNotePage, XenNotePageBody, XenNotePageVersion, XenNoteSection } from "../models/xenNotePage";
import { MAX_PAGE_VERSIONS } from "../../shared/xennote/pages";
import { bestRole, canEdit, roleOf, type MemberRole } from "./membership";
import { stripUnsafeLinks } from "../../shared/xennote/pageSchema";
import { removeAppFiles } from "./appFiles";
import { trashCutoff } from "./softDelete";
import { VERSION_GAP_MS } from "./xenNoteVersions";

export const XENNOTE_APP = "xennote";

type People = { members: Array<{ user_id: string; role: MemberRole }> };

/**
 * What a person may do with a page: the best of their role in its notebook, the role the page itself gives them, and
 * the role its parent page gives them (people added to a page also see its sub-pages).
 */
export const pageRole = (
  page: People,
  notebook: People | null,
  parent: People | null,
  uid: string,
): MemberRole | null =>
  bestRole([notebook ? roleOf(notebook, uid) : null, roleOf(page, uid), parent ? roleOf(parent, uid) : null]);

/** Moving, deleting and sharing a page is for people who can edit the whole notebook. */
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

/** Put a page in the Trash, and its sub-pages with it (they come back with it). */
export async function trashPage(pageId: unknown, uid: string, now = new Date()): Promise<void> {
  await XenNotePage.updateMany(
    { parent_id: pageId },
    { $set: { deleted_at: now, deleted_by: uid, deleted_with: pageId } },
  );
  await XenNotePage.updateOne({ _id: pageId }, { $set: { deleted_at: now, deleted_by: uid } });
}

/** Bring a page back from the Trash with the sub-pages that went with it. */
export async function restorePage(pageId: unknown): Promise<void> {
  const clear = { $set: { deleted_at: null, deleted_by: null, deleted_with: null } };
  await XenNotePage.updateMany({ deleted_with: pageId }, clear).setOptions({ includeDeleted: true });
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

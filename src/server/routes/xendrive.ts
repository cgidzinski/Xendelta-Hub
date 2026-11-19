import { assertCanStore } from "../billing/storageMeter";
import express = require("express");
import { escapeRegex } from "@shared/regex";
import { Types } from "mongoose";
import {
  validate,
  validateParams,
  validateQuery,
  xenDriveBrowseQuerySchema,
  xenDriveChunkSchema,
  xenDriveDownloadQuerySchema,
  xenDriveFileIdParamSchema,
  xenDriveFileUrlQuerySchema,
  xenDriveFinalizeSchema,
  xenDriveFolderCreateSchema,
  xenDriveFolderIdParamSchema,
  xenDriveFolderRenameSchema,
  xenDriveFolderShareSettingsSchema,
  xenDriveFolderTokenFileParamSchema,
  xenDriveFolderTokenParamSchema,
  xenDriveInitiateSchema,
  xenDriveMoveSchema,
  xenDrivePublicFolderQuerySchema,
  xenDriveSettingsSchema,
  xenDriveShareTokenParamSchema,
  xenDriveTicketSchema,
  xenDriveZipQuerySchema,
  xenDriveZipTicketSchema,
  xenDriveUploadIdParamSchema,
} from "../utils/validation";
import { AppError, callerId } from "../utils/http";
import { authenticateToken } from "../middleware/auth";
import { assertDriveSource } from "../utils/driveSources";
import {
  initiateChunkedUpload,
  uploadChunk,
  finalizeChunkedUpload,
  cleanupFailedUpload,
  getUploadSessionStatus,
  assertOwnFolder,
  usageFor,
} from "../utils/xendriveUtils";
import {
  MAX_FOLDER_DEPTH,
  breadcrumbOf,
  deleteFolderTree,
  depthOf,
  folderStats,
  heightOf,
  isInside,
  subtreeIds,
} from "../utils/xendriveFolders";
import { randomToken } from "../utils/tokens";
import { isValidDownloadTicket, signDownloadTicket } from "../utils/downloadTickets";
import { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, ZipWriter, zipPath } from "../utils/zipStream";
import { checkSharePassword, hashSharePassword, isUnset } from "../utils/sharePasswords";
import { generateSignedUrl } from "../utils/storageUtils";
import { isTextPreviewable, readTextPreview } from "../utils/fileText";
import { previewUrlFor, thumbnailUrlFor } from "../utils/xendriveThumbs";
import { privateStore } from "../storage";
import {
  XenDriveFile,
  withRecord,
  withRecords,
  type DriveFileDetails,
  type XenDriveFileDocument,
} from "../models/xendriveFile";
import { XenDriveFolder } from "../models/xendriveFolder";
import { purgeDate } from "../utils/softDelete";
import { deleteFilesForever } from "../utils/xendriveTrash";

/** RFC 5987 header value so any file name (spaces, accents, quotes) downloads under its own name. */
const attachment = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;

const serializeFile = (file: (XenDriveFileDocument & DriveFileDetails) | any, thumbUrl: string | null = null) => ({
  _id: file._id.toString(),
  name: file.name,
  folder_id: file.folder_id ? file.folder_id.toString() : null,
  mimeType: file.mimeType,
  size: file.size,
  createdAt: file.createdAt.toISOString(),
  shared: !!file.shareEnabled,
  shareToken: file.shareToken,
  // Whether there is one, never the password itself: it is stored as a hash.
  hasPassword: !!(file.passwordHash || file.password),
  expiry: file.expiry ? file.expiry.toISOString() : null,
  downloads: file.downloads ?? 0,
  lastDownloadedAt: file.lastDownloadedAt ? file.lastDownloadedAt.toISOString() : null,
  // Kept for the client: a XenDrive file is never one an app stored, and always counts.
  source: null,
  // A cacheable link to the small WebP beside the original, once it is made (the grid and list show it).
  thumbUrl,
});

const serializeFolder = (folder: any, itemCount = 0) => ({
  _id: folder._id.toString(),
  itemCount,
  name: folder.name,
  parent_id: folder.parent_id ? folder.parent_id.toString() : null,
  shared: !!folder.share?.enabled,
  shareToken: folder.share?.enabled ? folder.share.token : null,
  // The link's own extras, for the owner: whether it has a password (never the password), when it stops working, and
  // how many files have been downloaded through it.
  hasPassword: !!folder.share?.passwordHash,
  expiry: folder.share?.expiry ? folder.share.expiry.toISOString() : null,
  downloads: folder.share?.downloads ?? 0,
  lastDownloadedAt: folder.share?.lastDownloadedAt ? folder.share.lastDownloadedAt.toISOString() : null,
  created_at: folder.created_at.toISOString(),
});

/** What a person can look at in the browser without downloading. */
const PREVIEWABLE = /^(image\/|application\/pdf$|video\/|audio\/)/;
const PREVIEW_MINUTES = 60;
/** A visitor's preview link is short-lived: they can ask again when they open the next file. */
const PUBLIC_PREVIEW_MINUTES = 15;

/**
 * Cacheable thumbnail links for files that have one, falling back to the original for images whose thumbnail isn't
 * made yet (so a freshly uploaded photo shows at once, and swaps to the thumbnail once the background job finishes).
 */
async function thumbnailUrls(
  files: Array<{ _id: unknown; thumb?: { path?: string | null } | null; storage_path: string; mimeType: string }>,
): Promise<Map<string, string>> {
  const pairs = await Promise.all(
    files.map(async (f) => {
      if (f.thumb?.path) return [String(f._id), await thumbnailUrlFor(f.storage_path)] as const;
      if (f.mimeType.startsWith("image/")) {
        return [String(f._id), await generateSignedUrl(f.storage_path, PREVIEW_MINUTES)] as const;
      }
      return null;
    }),
  );
  return new Map(pairs.filter((p): p is readonly [string, string] => p !== null));
}

/** How many things (files and folders) sit directly inside each folder. */
async function itemCounts(ownerId: string, folderIds: unknown[]): Promise<Map<string, number>> {
  if (folderIds.length === 0) return new Map();
  const owner = new Types.ObjectId(ownerId);
  const [files, folders] = await Promise.all([
    XenDriveFile.aggregate<{ _id: unknown; n: number }>([
      { $match: { owner_id: owner, folder_id: { $in: folderIds } } },
      { $group: { _id: "$folder_id", n: { $sum: 1 } } },
    ]),
    XenDriveFolder.aggregate<{ _id: unknown; n: number }>([
      { $match: { owner_id: owner, parent_id: { $in: folderIds } } },
      { $group: { _id: "$parent_id", n: { $sum: 1 } } },
    ]),
  ]);
  const counts = new Map<string, number>();
  for (const row of [...files, ...folders]) counts.set(String(row._id), (counts.get(String(row._id)) ?? 0) + row.n);
  return counts;
}

/** One of the caller's own XenDrive files, or a 404 (a stranger's file, or one an app stored, looks the same as missing). */
async function ownFile(fileId: string, userId: string) {
  const file = await withRecord(await XenDriveFile.findOne({ _id: fileId, owner_id: userId }).exec());
  if (!file) throw new AppError(404, "File not found");
  return file;
}

async function ownFolder(folderId: string, userId: string) {
  const folder = await XenDriveFolder.findOne({ _id: folderId, owner_id: userId }).exec();
  if (!folder) throw new AppError(404, "Folder not found");
  return folder;
}

/** No two folders with the same name side by side. */
async function assertNameFree(userId: string, parentId: string | null, name: string, exceptId?: string) {
  const clash = await XenDriveFolder.exists({
    owner_id: userId,
    parent_id: parentId,
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  });
  if (clash) throw new AppError(409, "A folder with that name already exists here");
}

/**
 * The link password a request carries: in the X-Share-Password header (what the site sends), or in ?password= for
 * older links and scripts. It is never read from the address by the site itself, so it stays out of history and logs.
 */
const sharePasswordOf = (req: express.Request): string | undefined => {
  const header = req.headers["x-share-password"];
  if (typeof header === "string" && header) return header;
  return typeof req.query.password === "string" && req.query.password ? req.query.password : undefined;
};

/** A shared folder, looked up by its public token. */
async function sharedFolder(token: string) {
  const folder = await XenDriveFolder.findOne({ "share.token": token, "share.enabled": true }).exec();
  if (!folder) throw new AppError(404, "Link not found");
  return folder;
}

const folderLinkExpired = (folder: { share?: { expiry?: Date | null } | null }) =>
  !!folder.share?.expiry && new Date() > folder.share.expiry;

/**
 * A shared folder that this request may open: its link is on, hasn't expired, and the password (when there is one,
 * sent as ?password=, the same way a file's link takes it) is right. A wrong or missing password is a 403, not a
 * 401: the client treats every 401 as "your sign-in expired" and would sign the owner out of their own browser.
 */
async function openSharedFolder(token: string, password: unknown, passwordAlreadyChecked = false) {
  const folder = await sharedFolder(token);
  if (folderLinkExpired(folder)) throw new AppError(403, "Link expired");
  const hash = folder.share?.passwordHash;
  if (
    hash &&
    !passwordAlreadyChecked &&
    !(typeof password === "string" && password && (await checkSharePassword(password, { hash })))
  ) {
    throw new AppError(403, password ? "Incorrect password" : "Password required");
  }
  return folder;
}

module.exports = function (app: express.Application) {
  // ---------------------------------------------------------------------------------------------
  // Uploads: initiate -> chunk* -> finalize. A session belongs to whoever started it.
  // ---------------------------------------------------------------------------------------------

  app.post(
    "/api/xendrive/initiate",
    authenticateToken,
    validate(xenDriveInitiateSchema),
    async function (req: express.Request, res: express.Response) {
      const { filename, totalChunks, folderId, source } = req.body;
      const userId = callerId(req);
      // An app uploading for the person (a chat attachment): they must be allowed to store files for that source.
      if (source) await assertDriveSource(userId, source);

      try {
        await assertOwnFolder(userId, folderId);
      } catch {
        throw new AppError(404, "Folder not found");
      }

      // Whoever pays to store it must be able to.
      await assertCanStore(userId, source);

      const uploadId = await initiateChunkedUpload(userId, filename, totalChunks, folderId ?? null, source);
      return res.json({ status: true, message: "Upload session initiated", data: { uploadId } });
    },
  );

  app.post(
    "/api/xendrive/chunk",
    authenticateToken,
    validate(xenDriveChunkSchema),
    async function (req: express.Request, res: express.Response) {
      const { uploadId, chunkIndex, chunkData } = req.body;
      const chunkBuffer = Buffer.from(chunkData, "base64");
      try {
        await uploadChunk(uploadId, callerId(req), chunkIndex, chunkBuffer);
      } catch (e) {
        if (/session not found/i.test((e as Error).message)) throw new AppError(404, "Upload session not found");
        throw e;
      }
      return res.json({ status: true, message: "Chunk uploaded successfully", data: { chunkIndex } });
    },
  );

  app.post(
    "/api/xendrive/finalize",
    authenticateToken,
    validate(xenDriveFinalizeSchema),
    async function (req: express.Request, res: express.Response) {
      try {
        const fileData = await finalizeChunkedUpload(req.body.uploadId, callerId(req));
        return res.json({ status: true, message: "File uploaded successfully", data: fileData });
      } catch (e) {
        if (/session not found/i.test((e as Error).message)) throw new AppError(404, "Upload session not found");
        if (/Not all chunks/i.test((e as Error).message)) throw new AppError(400, (e as Error).message);
        throw e;
      }
    },
  );

  app.get(
    "/api/xendrive/status/:uploadId",
    authenticateToken,
    validateParams(xenDriveUploadIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const status = await getUploadSessionStatus(req.params.uploadId as string, callerId(req));
      if (!status) throw new AppError(404, "Upload session not found");
      return res.json({ status: true, data: status });
    },
  );

  // Cancel an upload and remove its partial file
  app.delete(
    "/api/xendrive/uploads/:uploadId",
    authenticateToken,
    validateParams(xenDriveUploadIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      await cleanupFailedUpload(req.params.uploadId as string, callerId(req));
      return res.json({ status: true, message: "Upload session cancelled" });
    },
  );

  // ---------------------------------------------------------------------------------------------
  // Browsing: one folder at a time, or a search across the whole drive
  // ---------------------------------------------------------------------------------------------

  app.get(
    "/api/xendrive/browse",
    authenticateToken,
    validateQuery(xenDriveBrowseQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const folderId = (req.query.folder as string | undefined) || null;
      const search = ((req.query.search as string | undefined) || "").trim();
      const view = req.query.view as "shared" | "recent" | undefined;

      // One response shape for every way of looking at the drive
      const send = async (folderDocs: any[], found: any[], extra: Record<string, unknown>) => {
        const fileDocs = await withRecords(found);
        const [counts, urls] = await Promise.all([
          itemCounts(
            userId,
            folderDocs.map((f) => f._id),
          ),
          thumbnailUrls(fileDocs),
        ]);
        return res.json({
          status: true,
          data: {
            folders: folderDocs.map((f) => serializeFolder(f, counts.get(String(f._id)))),
            files: fileDocs.map((f) => serializeFile(f, urls.get(String(f._id)) ?? null)),
            ...extra,
          },
        });
      };

      if (search) {
        const files = await XenDriveFile.find({
          owner_id: userId,
          name: { $regex: escapeRegex(search), $options: "i" },
        })
          .sort({ createdAt: -1 })
          .limit(200)
          .exec();
        return send([], files, { folder: null, breadcrumb: [], searching: true, view: "search" });
      }

      if (view === "shared") {
        const [folders, files] = await Promise.all([
          XenDriveFolder.find({ owner_id: userId, "share.enabled": true }).sort({ name: 1 }).exec(),
          XenDriveFile.find({ owner_id: userId, shareEnabled: true }).sort({ createdAt: -1 }).limit(500).exec(),
        ]);
        return send(folders, files, { folder: null, breadcrumb: [], searching: false, view: "shared" });
      }

      if (view === "recent") {
        const files = await XenDriveFile.find({ owner_id: userId }).sort({ createdAt: -1 }).limit(50).exec();
        return send([], files, { folder: null, breadcrumb: [], searching: false, view: "recent" });
      }

      const folder = folderId ? await ownFolder(folderId, userId) : null;
      const [folders, files, breadcrumb] = await Promise.all([
        XenDriveFolder.find({ owner_id: userId, parent_id: folderId }).sort({ name: 1 }).exec(),
        XenDriveFile.find({ owner_id: userId, folder_id: folderId }).sort({ createdAt: -1 }).exec(),
        folderId ? breadcrumbOf(folderId, userId) : Promise.resolve([]),
      ]);
      return send(folders, files, {
        folder: folder ? { _id: folder._id.toString(), name: folder.name } : null,
        breadcrumb,
        searching: false,
        view: "folder",
      });
    },
  );

  // The latest files anywhere in the drive, the totals, and how many things have a public link
  // (the home screen card and the sidebar)
  app.get("/api/xendrive/recent", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = callerId(req);
    const [files, usage, sharedFiles, sharedFolders] = await Promise.all([
      XenDriveFile.find({ owner_id: userId }).sort({ createdAt: -1 }).limit(3).exec().then(withRecords),
      usageFor(userId),
      XenDriveFile.countDocuments({ owner_id: userId, shareEnabled: true }),
      XenDriveFolder.countDocuments({ owner_id: userId, "share.enabled": true }),
    ]);
    return res.json({
      status: true,
      data: {
        files: files.map((f) => serializeFile(f)),
        ...usage,
        sharedCount: sharedFiles + sharedFolders,
      },
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Folders
  // ---------------------------------------------------------------------------------------------

  app.post(
    "/api/xendrive/folders",
    authenticateToken,
    validate(xenDriveFolderCreateSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const { name } = req.body;
      const parentId: string | null = req.body.parentId ?? null;

      if (parentId) await ownFolder(parentId, userId);
      if ((await depthOf(parentId)) >= MAX_FOLDER_DEPTH) {
        throw new AppError(400, `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`);
      }
      await assertNameFree(userId, parentId, name);

      const folder = await XenDriveFolder.create({ owner_id: userId, parent_id: parentId, name });
      return res.json({ status: true, message: "Folder created", data: { folder: serializeFolder(folder) } });
    },
  );

  // Move files and folders into another folder (or the top level). Checked as a whole first, so a clash or a loop
  // refuses the lot instead of moving half of them.
  app.post(
    "/api/xendrive/move",
    authenticateToken,
    validate(xenDriveMoveSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const { fileIds, folderIds, targetFolderId } = xenDriveMoveSchema.parse(req.body);
      const target = targetFolderId ?? null;
      if (target) await ownFolder(target, userId);

      const folders = await XenDriveFolder.find({ _id: { $in: folderIds }, owner_id: userId }).exec();
      const files = await XenDriveFile.find({ _id: { $in: fileIds }, owner_id: userId }).exec();
      const sameParent = (id: unknown) => (id ? String(id) : null) === target;
      const foldersToMove = folders.filter((f) => !sameParent(f.parent_id));

      const targetDepth = await depthOf(target);
      const names = new Set<string>();
      for (const folder of foldersToMove) {
        // Into itself or something inside it would cut it off from the tree.
        if (target && (await isInside(target, folder.id))) {
          throw new AppError(400, `"${folder.name}" can't be moved into itself or a folder inside it`);
        }
        if (targetDepth + (await heightOf(folder.id)) > MAX_FOLDER_DEPTH) {
          throw new AppError(400, `Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`);
        }
        const lower = folder.name.toLowerCase();
        if (names.has(lower)) throw new AppError(409, `Two of the folders are called "${folder.name}"`);
        names.add(lower);
        await assertNameFree(userId, target, folder.name, folder.id);
      }

      const filesToMove = files.filter((f) => (f.folder_id ? String(f.folder_id) : null) !== target);
      if (filesToMove.length > 0) {
        await XenDriveFile.updateMany({ _id: { $in: filesToMove.map((f) => f._id) } }, { $set: { folder_id: target } });
      }
      if (foldersToMove.length > 0) {
        await XenDriveFolder.updateMany(
          { _id: { $in: foldersToMove.map((f) => f._id) } },
          { $set: { parent_id: target } },
        );
      }
      return res.json({
        status: true,
        message: "Moved",
        data: { files: filesToMove.length, folders: foldersToMove.length },
      });
    },
  );

  app.put(
    "/api/xendrive/folders/:folderId",
    authenticateToken,
    validateParams(xenDriveFolderIdParamSchema),
    validate(xenDriveFolderRenameSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const folder = await ownFolder(req.params.folderId as string, userId);
      await assertNameFree(userId, folder.parent_id ? folder.parent_id.toString() : null, req.body.name, folder.id);
      folder.name = req.body.name;
      await folder.save();
      return res.json({ status: true, message: "Folder renamed", data: { folder: serializeFolder(folder) } });
    },
  );

  // What deleting a folder would remove, so the client can say so before asking
  app.get(
    "/api/xendrive/folders/:folderId/stats",
    authenticateToken,
    validateParams(xenDriveFolderIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const folder = await ownFolder(req.params.folderId as string, callerId(req));
      return res.json({ status: true, data: await folderStats(folder.id) });
    },
  );

  app.delete(
    "/api/xendrive/folders/:folderId",
    authenticateToken,
    validateParams(xenDriveFolderIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const folder = await ownFolder(req.params.folderId as string, callerId(req));
      await deleteFolderTree(folder.id);
      return res.json({ status: true, message: "Folder deleted" });
    },
  );

  // Public link for a folder: enable (or fetch the current one), rotate, disable. The link's password, expiry and download
  // tally belong to the folder's sharing, so they survive all three.
  const folderShare = (action: "enable" | "rotate" | "disable") =>
    async function (req: express.Request, res: express.Response) {
      const folder = await ownFolder(req.params.folderId as string, callerId(req));
      if (action === "disable") {
        folder.set("share.enabled", false);
      } else {
        const keep = action === "enable" && folder.share?.token;
        folder.set("share.enabled", true);
        if (!keep) folder.set("share.token", randomToken(16));
      }
      await folder.save();
      return res.json({ status: true, data: { folder: serializeFolder(folder) } });
    };
  app.post(
    "/api/xendrive/folders/:folderId/share",
    authenticateToken,
    validateParams(xenDriveFolderIdParamSchema),
    folderShare("enable"),
  );
  app.post(
    "/api/xendrive/folders/:folderId/share/rotate",
    authenticateToken,
    validateParams(xenDriveFolderIdParamSchema),
    folderShare("rotate"),
  );
  app.delete(
    "/api/xendrive/folders/:folderId/share",
    authenticateToken,
    validateParams(xenDriveFolderIdParamSchema),
    folderShare("disable"),
  );

  // Set or clear the folder link's password and expiry (a field left out stays as it is).
  app.put(
    "/api/xendrive/folders/:folderId/share/settings",
    authenticateToken,
    validateParams(xenDriveFolderIdParamSchema),
    validate(xenDriveFolderShareSettingsSchema),
    async function (req: express.Request, res: express.Response) {
      const folder = await ownFolder(req.params.folderId as string, callerId(req));
      const { password, expiry } = req.body;
      if (password !== undefined) {
        folder.set("share.passwordHash", isUnset(password) ? undefined : await hashSharePassword(password));
      }
      if (expiry !== undefined) folder.set("share.expiry", isUnset(expiry) ? undefined : new Date(expiry));
      await folder.save();
      return res.json({ status: true, message: "Link settings saved", data: { folder: serializeFolder(folder) } });
    },
  );

  // ---------------------------------------------------------------------------------------------
  // Files (owner)
  // ---------------------------------------------------------------------------------------------

  app.get(
    "/api/xendrive/files/:fileId",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const file = await ownFile(req.params.fileId as string, userId);
      const isImage = file.mimeType.startsWith("image/");
      const isVideo = file.mimeType.startsWith("video/");
      const [breadcrumb, siblings, previewUrl, posterUrl] = await Promise.all([
        file.folder_id ? breadcrumbOf(file.folder_id.toString(), userId) : Promise.resolve([]),
        // the same order the folder lists them in, for previous / next
        XenDriveFile.find(
          {
            owner_id: userId,
            folder_id: file.folder_id,
          },
          "name",
        )
          .sort({ createdAt: -1 })
          .limit(500)
          .lean(),
        // Images show the ~1600 px rendition once it is made, and the original before then (the original always opens on
        // demand). PDFs, video and audio stream the original.
        isImage
          ? file.thumb?.path
            ? previewUrlFor(file.storage_path)
            : generateSignedUrl(file.storage_path, PREVIEW_MINUTES)
          : PREVIEWABLE.test(file.mimeType)
            ? generateSignedUrl(file.storage_path, PREVIEW_MINUTES)
            : Promise.resolve(null),
        isVideo && file.thumb?.path ? thumbnailUrlFor(file.storage_path) : Promise.resolve(null),
      ]);
      const at = siblings.findIndex((x) => String(x._id) === file.id);
      const pick = (x?: { _id: unknown; name: string }) => (x ? { _id: String(x._id), name: x.name } : null);
      return res.json({
        status: true,
        data: {
          file: serializeFile(file),
          breadcrumb,
          previewUrl,
          posterUrl,
          neighbors: {
            index: at + 1,
            total: siblings.length,
            prev: pick(siblings[at - 1]),
            next: pick(siblings[at + 1]),
          },
        },
      });
    },
  );

  app.get(
    "/api/xendrive/files/:fileId/url",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    validateQuery(xenDriveFileUrlQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownFile(req.params.fileId as string, callerId(req));
      const url = await generateSignedUrl(
        file.storage_path,
        15, // minutes
        req.query.download === "1" ? { downloadName: file.name } : {},
      );
      return res.json({ status: true, data: { url } });
    },
  );

  // The first ~256 KB of a text-like file, for the in-page preview (no R2 CORS setup needed).
  app.get(
    "/api/xendrive/files/:fileId/text",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownFile(req.params.fileId as string, callerId(req));
      if (!isTextPreviewable(file.mimeType)) throw new AppError(404, "No text preview for this kind of file");
      return res.json({ status: true, data: await readTextPreview(file.storage_path) });
    },
  );

  // Rename, set or clear the password, set or clear the expiry
  app.put(
    "/api/xendrive/files/:fileId/settings",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    validate(xenDriveSettingsSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownFile(req.params.fileId as string, callerId(req));
      const { password, expiry, name, shareEnabled } = req.body;

      if (name !== undefined) file.name = name;
      if (shareEnabled !== undefined) file.shareEnabled = shareEnabled;
      if (password !== undefined) {
        file.passwordHash = isUnset(password) ? undefined : await hashSharePassword(password);
        file.password = undefined; // drops any old plain-text copy
      }
      if (expiry !== undefined) file.expiry = isUnset(expiry) ? undefined : new Date(expiry);

      await file.save();

      return res.json({
        status: true,
        message: "File settings updated successfully",
        data: {
          name: file.name,
          shared: !!file.shareEnabled,
          hasPassword: file.hasPassword(),
          expiry: file.expiry ? file.expiry.toISOString() : null,
          shareUrl: `${req.protocol}://${req.get("host")}/xendrive/${file.shareToken}`,
        },
      });
    },
  );

  // Replace the file's link with a new one; the old link stops working
  app.post(
    "/api/xendrive/files/:fileId/share/rotate",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownFile(req.params.fileId as string, callerId(req));
      file.shareToken = randomToken(16);
      await file.save();
      return res.json({ status: true, message: "New link made", data: { file: serializeFile(file) } });
    },
  );

  app.delete(
    "/api/xendrive/files/:fileId",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownFile(req.params.fileId as string, callerId(req));
      // Into the Trash for 30 days (its link stops working; the stored file still counts toward storage).
      await XenDriveFile.updateOne({ _id: file._id }, { $set: { deleted_at: new Date(), deleted_by: callerId(req) } });
      return res.json({ status: true, message: "File moved to Trash" });
    },
  );

  // ---------------------------------------------------------------------------------------------
  // Trash: files deleted in the last 30 days
  // ---------------------------------------------------------------------------------------------

  const trashedFiles = (userId: string) =>
    XenDriveFile.find({ owner_id: userId, deleted_at: { $ne: null } }).setOptions({ includeDeleted: true });

  app.get("/api/xendrive/trash", authenticateToken, async function (req: express.Request, res: express.Response) {
    const files = await withRecords(await trashedFiles(callerId(req)).sort({ deleted_at: -1 }).limit(500).exec());
    return res.json({
      status: true,
      data: {
        files: files.map((f) => ({
          _id: f._id.toString(),
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          deleted_at: (f.deleted_at as Date).toISOString(),
          purge_at: purgeDate(f.deleted_at as Date).toISOString(),
        })),
      },
    });
  });

  async function trashedFile(fileId: string, userId: string) {
    const file = await XenDriveFile.findOne({ _id: fileId, owner_id: userId, deleted_at: { $ne: null } })
      .setOptions({ includeDeleted: true })
      .exec();
    if (!file) throw new AppError(404, "File not found in the Trash");
    return file;
  }

  app.post(
    "/api/xendrive/trash/:fileId/restore",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const file = await trashedFile(req.params.fileId as string, userId);
      // Back in its folder, or at the top level if the folder has been deleted since.
      const folderGone = file.folder_id && !(await XenDriveFolder.exists({ _id: file.folder_id, owner_id: userId }));
      file.set("folder_id", folderGone ? null : file.folder_id);
      file.set("deleted_at", null);
      file.set("deleted_by", null);
      await file.save();
      return res.json({ status: true, message: "File restored", data: { backToTop: !!folderGone } });
    },
  );

  app.delete(
    "/api/xendrive/trash/:fileId",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await trashedFile(req.params.fileId as string, callerId(req));
      await deleteFilesForever([file._id]);
      return res.json({ status: true, message: "File deleted for good" });
    },
  );

  app.delete("/api/xendrive/trash", authenticateToken, async function (req: express.Request, res: express.Response) {
    const files = await trashedFiles(callerId(req)).select("_id").lean();
    const removed = await deleteFilesForever(files.map((f) => f._id));
    return res.json({ status: true, message: "Trash emptied", data: { removed } });
  });

  // ---------------------------------------------------------------------------------------------
  // A link opened by someone signed in: is the file or folder theirs? Then they go to it in the app. Nobody else is a
  // member (XenDrive shares by link only), so everyone else stays on the public page. The token only ever lets
  // someone read.
  // ---------------------------------------------------------------------------------------------

  app.get(
    "/api/xendrive/shared-link/file/:shareToken",
    authenticateToken,
    validateParams(xenDriveShareTokenParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await XenDriveFile.findOne({ shareToken: req.params.shareToken, shareEnabled: true }).exec();
      if (!file) throw new AppError(404, "File not found");
      const mine = String(file.owner_id) === callerId(req);
      return res.json({ status: true, data: { mine, file_id: mine ? String(file._id) : null } });
    },
  );

  app.get(
    "/api/xendrive/shared-link/folder/:token",
    authenticateToken,
    validateParams(xenDriveFolderTokenParamSchema),
    async function (req: express.Request, res: express.Response) {
      const folder = await XenDriveFolder.findOne({ "share.token": req.params.token, "share.enabled": true }).exec();
      if (!folder) throw new AppError(404, "Folder not found");
      const mine = String(folder.owner_id) === callerId(req);
      return res.json({ status: true, data: { mine, folder_id: mine ? String(folder._id) : null } });
    },
  );

  // ---------------------------------------------------------------------------------------------
  // Public: a single file's own link
  // ---------------------------------------------------------------------------------------------

  app.get(
    "/api/xendrive/info/:shareToken",
    validateParams(xenDriveShareTokenParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await withRecord(
        await XenDriveFile.findOne({ shareToken: req.params.shareToken, shareEnabled: true }).exec(),
      );
      if (!file) throw new AppError(404, "File not found");

      if (file.isExpired()) {
        throw new AppError(403, "Link expired", { isExpired: true });
      }

      return res.json({
        status: true,
        data: {
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
          requiresPassword: file.hasPassword(),
          expiry: file.expiry ? file.expiry.toISOString() : null,
        },
      });
    },
  );

  /** A file's own link, if it works: switched on, not expired, and the password (when it has one) is right. */
  async function openFileLink(shareToken: string, password: string | undefined, passwordAlreadyChecked = false) {
    const file = await withRecord(await XenDriveFile.findOne({ shareToken, shareEnabled: true }).exec());
    if (!file) throw new AppError(404, "File not found");
    if (file.isExpired()) throw new AppError(403, "Link expired");
    if (file.hasPassword() && !passwordAlreadyChecked) {
      const wrong = !password || !(await file.checkPassword(password));
      if (wrong) {
        throw new AppError(401, !password ? "Password required" : "Incorrect password", {
          requiresPassword: true,
          name: file.name,
          expiry: file.expiry ? file.expiry.toISOString() : null,
        });
      }
    }
    return file;
  }

  // The site asks for a ticket (password in the body), then downloads with only the ticket in the address.
  app.post(
    "/api/xendrive/download/:shareToken/ticket",
    validateParams(xenDriveShareTokenParamSchema),
    validate(xenDriveTicketSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await openFileLink(req.params.shareToken as string, req.body.password);
      return res.json({ status: true, data: { ticket: signDownloadTicket(req.params.shareToken as string, file.id) } });
    },
  );

  app.get(
    "/api/xendrive/download/:shareToken",
    validateParams(xenDriveShareTokenParamSchema),
    validateQuery(xenDriveDownloadQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const shareToken = req.params.shareToken as string;
      const ticket = typeof req.query.ticket === "string" ? req.query.ticket : undefined;
      // A ticket stands in for the password, but only for the file it was made for; everything else is checked again.
      const peek = ticket ? await XenDriveFile.findOne({ shareToken, shareEnabled: true }, "_id").exec() : null;
      const ticketOk = !!peek && isValidDownloadTicket(ticket, shareToken, peek.id);
      const file = await openFileLink(shareToken, sharePasswordOf(req), ticketOk);
      return streamFile(res, file);
    },
  );

  // ---------------------------------------------------------------------------------------------
  // Public: a folder's link. Browse the shared folder and everything under it, and download from it.
  // A file's own password does not apply here: the owner shared the whole folder. An expired file is hidden.
  // ---------------------------------------------------------------------------------------------

  app.get(
    "/api/xendrive/public/folder/:token",
    validateParams(xenDriveFolderTokenParamSchema),
    validateQuery(xenDrivePublicFolderQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const root = await openSharedFolder(req.params.token as string, sharePasswordOf(req));
      const requested = (req.query.folder as string | undefined) || root.id;

      if (!(await isInside(requested, root.id))) throw new AppError(404, "Folder not found");
      const current = await XenDriveFolder.findOne({ _id: requested, owner_id: root.owner_id }).exec();
      if (!current) throw new AppError(404, "Folder not found");

      const now = new Date();
      const [folders, files, breadcrumb] = await Promise.all([
        XenDriveFolder.find({ owner_id: root.owner_id, parent_id: requested }).sort({ name: 1 }).exec(),
        XenDriveFile.find({
          owner_id: root.owner_id,
          folder_id: requested,
          $or: [{ expiry: null }, { expiry: { $exists: false } }, { expiry: { $gt: now } }],
        })
          .sort({ name: 1 })
          .exec()
          .then(withRecords),
        breadcrumbOf(requested, root.owner_id.toString(), root.id),
      ]);

      const urls = await thumbnailUrls(files);
      return res.json({
        status: true,
        data: {
          root: { _id: root.id, name: root.name },
          folder: { _id: current.id, name: current.name },
          breadcrumb,
          folders: folders.map((f) => ({ _id: f.id, name: f.name })),
          files: files.map((f) => ({
            _id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size,
            createdAt: f.createdAt.toISOString(),
            thumbUrl: urls.get(f.id) ?? null,
          })),
        },
      });
    },
  );

  /** A file inside a shared folder, if the link works (and the password is right, unless a ticket stands in for it). */
  async function openFolderFile(token: string, fileId: string, password: string | undefined, ticket?: string) {
    const ticketOk = isValidDownloadTicket(ticket, token, fileId);
    const root = await openSharedFolder(token, password, ticketOk);
    const file = await withRecord(await XenDriveFile.findOne({ _id: fileId, owner_id: root.owner_id }).exec());
    if (!file || !file.folder_id || !(await isInside(file.folder_id.toString(), root.id))) {
      throw new AppError(404, "File not found");
    }
    if (file.isExpired()) throw new AppError(403, "Link expired");
    return { root, file };
  }

  // What the folder page needs to show a file in place: a short-lived link for images, PDFs, video and audio, and the
  // start of a text file. The password goes in the X-Share-Password header, like the listing's.
  app.get(
    "/api/xendrive/public/folder/:token/files/:fileId/preview",
    validateParams(xenDriveFolderTokenFileParamSchema),
    async function (req: express.Request, res: express.Response) {
      const { file } = await openFolderFile(
        req.params.token as string,
        req.params.fileId as string,
        sharePasswordOf(req),
      );
      const isImage = file.mimeType.startsWith("image/");
      const [previewUrl, posterUrl, text] = await Promise.all([
        isImage && file.thumb?.path
          ? previewUrlFor(file.storage_path)
          : PREVIEWABLE.test(file.mimeType)
            ? generateSignedUrl(file.storage_path, PUBLIC_PREVIEW_MINUTES)
            : Promise.resolve(null),
        file.mimeType.startsWith("video/") && file.thumb?.path ? thumbnailUrlFor(file.storage_path) : null,
        isTextPreviewable(file.mimeType) ? readTextPreview(file.storage_path) : null,
      ]);
      return res.json({
        status: true,
        data: { name: file.name, mimeType: file.mimeType, size: file.size, previewUrl, posterUrl, text },
      });
    },
  );

  app.post(
    "/api/xendrive/public/folder/:token/files/:fileId/ticket",
    validateParams(xenDriveFolderTokenFileParamSchema),
    validate(xenDriveTicketSchema),
    async function (req: express.Request, res: express.Response) {
      const token = req.params.token as string;
      const { file } = await openFolderFile(
        token,
        req.params.fileId as string,
        req.body.password ?? sharePasswordOf(req),
      );
      return res.json({ status: true, data: { ticket: signDownloadTicket(token, file.id) } });
    },
  );

  app.get(
    "/api/xendrive/public/folder/:token/files/:fileId",
    validateParams(xenDriveFolderTokenFileParamSchema),
    validateQuery(xenDriveDownloadQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const { root, file } = await openFolderFile(
        req.params.token as string,
        req.params.fileId as string,
        sharePasswordOf(req),
        typeof req.query.ticket === "string" ? req.query.ticket : undefined,
      );
      return streamFile(res, file, root.id);
    },
  );

  // The shared folder (or one inside it) as a single zip. Like a file, it is asked for with the password in a POST and
  // fetched with a ticket made for exactly this folder.
  async function openZipFolder(token: string, folderId: string | undefined, password?: string, ticket?: string) {
    const ticketOk = isValidDownloadTicket(ticket, token, `zip:${folderId ?? ""}`);
    const root = await openSharedFolder(token, password, ticketOk);
    const requested = folderId || root.id;
    if (!(await isInside(requested, root.id))) throw new AppError(404, "Folder not found");
    const current = await XenDriveFolder.findOne({ _id: requested, owner_id: root.owner_id }).exec();
    if (!current) throw new AppError(404, "Folder not found");
    return { root, current };
  }

  app.post(
    "/api/xendrive/public/folder/:token/zip/ticket",
    validateParams(xenDriveFolderTokenParamSchema),
    validate(xenDriveZipTicketSchema),
    async function (req: express.Request, res: express.Response) {
      const token = req.params.token as string;
      const { password, folder } = req.body;
      await openZipFolder(token, folder, password ?? sharePasswordOf(req));
      return res.json({ status: true, data: { ticket: signDownloadTicket(token, `zip:${folder ?? ""}`) } });
    },
  );

  app.get(
    "/api/xendrive/public/folder/:token/zip",
    validateParams(xenDriveFolderTokenParamSchema),
    validateQuery(xenDriveZipQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const { folder, ticket } = req.query as { folder?: string; ticket?: string };
      const { root, current } = await openZipFolder(req.params.token as string, folder, sharePasswordOf(req), ticket);

      // Everything in the folder and beneath it, except files whose own expiry has passed.
      const ids = await subtreeIds(current.id);
      const [folders, found] = await Promise.all([
        XenDriveFolder.find({ _id: { $in: ids }, owner_id: root.owner_id }, "name parent_id").lean(),
        XenDriveFile.find({
          owner_id: root.owner_id,
          folder_id: { $in: ids },
          $or: [{ expiry: null }, { expiry: { $exists: false } }, { expiry: { $gt: new Date() } }],
        })
          .sort({ name: 1 })
          .exec(),
      ]);
      const files = await withRecords(found);
      if (files.length === 0) throw new AppError(404, "There is nothing to download in this folder");
      const total = files.reduce((sum, f) => sum + (f.size || 0), 0);
      if (files.length > MAX_ZIP_ENTRIES || total > MAX_ZIP_BYTES) {
        throw new AppError(413, "This folder is too big to download in one go. Download its files one at a time.");
      }

      // A file's path inside the zip: the folder names from the one being downloaded down to where it sits.
      const byId = new Map(folders.map((f) => [String(f._id), f]));
      const pathOf = (folderId: string): string[] => {
        const parts: string[] = [];
        for (let id: string | null = folderId, i = 0; id && i <= MAX_FOLDER_DEPTH; i++) {
          const f = byId.get(id);
          if (!f) break;
          parts.unshift(f.name);
          id = id === current.id ? null : f.parent_id ? String(f.parent_id) : null;
        }
        return parts;
      };

      const zipName = `${current.name}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", attachment(zipName));
      const zip = new ZipWriter(res);
      const taken = new Set<string>();
      const sent: unknown[] = [];
      try {
        for (const file of files) {
          let data;
          try {
            data = await privateStore.read(file.storage_path);
          } catch {
            continue; // the bytes are gone from storage; leave that file out rather than failing the lot
          }
          await zip.addFile(zipPath([...pathOf(String(file.folder_id)), file.name], taken), data, file.createdAt);
          sent.push(file._id);
        }
        await zip.finish();
      } catch (err) {
        // Part of the zip is already on its way, so the only honest thing left is to cut the connection.
        res.destroy(err as Error);
        return;
      }
      const at = new Date();
      await Promise.all([
        XenDriveFile.updateMany({ _id: { $in: sent } }, { $inc: { downloads: 1 }, $set: { lastDownloadedAt: at } }),
        XenDriveFolder.updateOne(
          { _id: root.id },
          { $inc: { "share.downloads": sent.length }, $set: { "share.lastDownloadedAt": at } },
        ),
      ]).catch(() => undefined); // a tally that can't be kept must not matter now
    },
  );

  // What a visitor needs to know before opening a folder link: its name, and whether it wants a password. Answers 200
  // for a working link (even a locked one) so the page can show the right prompt without a failed request.
  app.get(
    "/api/xendrive/public/folder/:token/info",
    validateParams(xenDriveFolderTokenParamSchema),
    async function (req: express.Request, res: express.Response) {
      const folder = await sharedFolder(req.params.token as string);
      if (folderLinkExpired(folder)) throw new AppError(403, "Link expired", { isExpired: true });
      return res.json({
        status: true,
        data: {
          name: folder.name,
          requiresPassword: !!folder.share?.passwordHash,
          expiry: folder.share?.expiry ? folder.share.expiry.toISOString() : null,
        },
      });
    },
  );
};

/**
 * Send a stored file to the response, under its own name, and count it as a download of the file (and of the folder
 * link it came through, when there is one).
 */
async function streamFile(res: express.Response, file: XenDriveFileDocument & DriveFileDetails, viaFolderId?: string) {
  if (!(await privateStore.exists(file.storage_path))) throw new AppError(404, "File not found in storage");

  const at = new Date();
  await Promise.all([
    XenDriveFile.updateOne({ _id: file._id }, { $inc: { downloads: 1 }, $set: { lastDownloadedAt: at } }),
    viaFolderId
      ? XenDriveFolder.updateOne(
          { _id: viaFolderId },
          { $inc: { "share.downloads": 1 }, $set: { "share.lastDownloadedAt": at } },
        )
      : null,
  ]).catch(() => undefined); // a tally that can't be kept must not stop the download

  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", attachment(file.name));
  if (file.size != null) res.setHeader("Content-Length", file.size);
  if (file.expiry) res.setHeader("X-File-Expiry", file.expiry.toISOString());
  (await privateStore.read(file.storage_path)).pipe(res);
}

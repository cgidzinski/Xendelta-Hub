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
  xenDrivePublicFolderQuerySchema,
  xenDriveSettingsSchema,
  xenDriveShareTokenParamSchema,
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
  isInside,
} from "../utils/xendriveFolders";
import { randomToken } from "../utils/tokens";
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
async function openSharedFolder(token: string, password: unknown) {
  const folder = await sharedFolder(token);
  if (folderLinkExpired(folder)) throw new AppError(403, "Link expired");
  const hash = folder.share?.passwordHash;
  if (hash && !(typeof password === "string" && password && (await checkSharePassword(password, { hash })))) {
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

  app.get(
    "/api/xendrive/download/:shareToken",
    validateParams(xenDriveShareTokenParamSchema),
    validateQuery(xenDriveDownloadQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const { password } = req.query;

      const file = await withRecord(
        await XenDriveFile.findOne({ shareToken: req.params.shareToken, shareEnabled: true }).exec(),
      );
      if (!file) throw new AppError(404, "File not found");

      if (file.isExpired()) {
        throw new AppError(403, "Link expired");
      }

      if (file.hasPassword()) {
        const wrong = !password || typeof password !== "string" || !(await file.checkPassword(password));
        if (wrong) {
          throw new AppError(401, !password ? "Password required" : "Incorrect password", {
            requiresPassword: true,
            name: file.name,
            expiry: file.expiry ? file.expiry.toISOString() : null,
          });
        }
      }

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
      const root = await openSharedFolder(req.params.token as string, req.query.password);
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

  app.get(
    "/api/xendrive/public/folder/:token/files/:fileId",
    validateParams(xenDriveFolderTokenFileParamSchema),
    validateQuery(xenDriveDownloadQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const root = await openSharedFolder(req.params.token as string, req.query.password);
      const file = await withRecord(
        await XenDriveFile.findOne({ _id: req.params.fileId, owner_id: root.owner_id }).exec(),
      );
      if (!file || !file.folder_id || !(await isInside(file.folder_id.toString(), root.id))) {
        throw new AppError(404, "File not found");
      }
      if (file.isExpired()) throw new AppError(403, "Link expired");
      return streamFile(res, file, root.id);
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

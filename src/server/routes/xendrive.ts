import express = require("express");
import { escapeRegex } from "@shared/regex";
import { Types } from "mongoose";
import {
  validate,
  validateParams,
  validateQuery,
  xenDriveAppFilesQuerySchema,
  xenDriveBrowseQuerySchema,
  xenDriveChunkSchema,
  xenDriveDownloadQuerySchema,
  xenDriveFileIdParamSchema,
  xenDriveFileUrlQuerySchema,
  xenDriveFinalizeSchema,
  xenDriveFolderCreateSchema,
  xenDriveFolderIdParamSchema,
  xenDriveFolderRenameSchema,
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
import { assertDriveSource, driveListFilter, driveOnly, driveSourceApp } from "../utils/driveSources";
import {
  initiateChunkedUpload,
  uploadChunk,
  finalizeChunkedUpload,
  cleanupFailedUpload,
  getUploadSessionStatus,
  checkQuota,
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
import { generateSignedUrl } from "../utils/gcsUtils";
import { isPdf, thumbPathFor } from "../utils/xendriveThumbPaths";
import { scheduleThumbnails } from "../utils/xendriveThumbs";
import { privateBucket } from "../config/gcs";
import { XenDriveFile, type XenDriveFileDocument } from "../models/xendriveFile";
import { XenDriveFolder } from "../models/xendriveFolder";

/** RFC 5987 header value so any file name (spaces, accents, quotes) downloads under its own name. */
const attachment = (name: string) => `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;

const serializeFile = (file: XenDriveFileDocument | any) => ({
  _id: file._id.toString(),
  name: file.name,
  folder_id: file.folder_id ? file.folder_id.toString() : null,
  mimeType: file.mimeType,
  size: file.size,
  createdAt: file.createdAt.toISOString(),
  shared: !!file.shareEnabled,
  shareToken: file.shareToken,
  hasPassword: !!file.password,
  password: file.password || null, // returned to the owner in plain text, as it always has been
  expiry: file.expiry ? file.expiry.toISOString() : null,
  // Set when an app stored the file for the person; `counted: false` means it doesn't use their storage.
  source: file.source?.app
    ? { app: file.source.app as string, label: driveSourceApp(file.source.app)?.label ?? file.source.app }
    : null,
  counted: file.counted !== false,
});

const serializeFolder = (folder: any, itemCount = 0) => ({
  _id: folder._id.toString(),
  itemCount,
  name: folder.name,
  parent_id: folder.parent_id ? folder.parent_id.toString() : null,
  shared: !!folder.share?.enabled,
  shareToken: folder.share?.enabled ? folder.share.token : null,
  created_at: folder.created_at.toISOString(),
});

const isImage = (mime: string) => mime.startsWith("image/");
/** What a person can look at in the browser without downloading. */
const PREVIEWABLE = /^(image\/|application\/pdf$|video\/|audio\/)/;
const MAX_THUMBS = 60;
const PREVIEW_MINUTES = 60;

/**
 * Short-lived picture links for image files (the grid shows them). A file with a thumbnail gets the thumbnail's link; one
 * without gets the original's, and has its thumbnail made in the background for next time. Capped so a huge folder signs
 * a bounded number.
 */
async function previewUrls(
  files: Array<{
    _id: unknown;
    mimeType: string;
    storage_path: string;
    size?: number | null;
    thumbnail?: string | null;
  }>,
): Promise<Map<string, string>> {
  // A PDF is only worth a link once its first page has been drawn: the original can't stand in for it in an <img>.
  const pictured = files.filter((f) => isImage(f.mimeType) || isPdf(f.mimeType)).slice(0, MAX_THUMBS);
  scheduleThumbnails(pictured.filter((f) => !f.thumbnail));
  const images = pictured.filter((f) => isImage(f.mimeType) || f.thumbnail === "ready");
  const pairs = await Promise.all(
    images.map(
      async (f) =>
        [
          String(f._id),
          await generateSignedUrl(
            f.thumbnail === "ready" ? thumbPathFor(f.storage_path) : f.storage_path,
            PREVIEW_MINUTES,
          ),
        ] as const,
    ),
  );
  return new Map(pairs);
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

/** One of the caller's files, or a 404 (a stranger's file looks the same as a missing one). */
async function ownFile(fileId: string, userId: string) {
  const file = await XenDriveFile.findOne({ _id: fileId, owner_id: userId }).exec();
  if (!file) throw new AppError(404, "File not found");
  return file;
}

/** A file an app stored on the person's behalf (a chat attachment) stays private: no renaming or public link from here. */
function assertNotAppFile(file: { source?: { app?: string | null } | null }) {
  if (file.source?.app)
    throw new AppError(400, "This file belongs to another app, so it can't be shared or renamed here");
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

module.exports = function (app: express.Application) {
  // ---------------------------------------------------------------------------------------------
  // Uploads: initiate -> chunk* -> finalize. A session belongs to whoever started it.
  // ---------------------------------------------------------------------------------------------

  app.post(
    "/api/xendrive/initiate",
    authenticateToken,
    validate(xenDriveInitiateSchema),
    async function (req: express.Request, res: express.Response) {
      const { filename, totalChunks, fileSize, folderId, source } = req.body;
      const userId = callerId(req);
      // An app uploading for the person (a chat attachment): they must be allowed to store files for that source.
      if (source) await assertDriveSource(userId, source);

      try {
        await assertOwnFolder(userId, folderId);
      } catch {
        throw new AppError(404, "Folder not found");
      }

      // Only a file that counts toward the person's storage needs room for it (an app's files are exempt for now).
      const counts = source ? ((await driveSourceApp(source.app)?.counts(source.ref)) ?? true) : true;
      if (counts) {
        const quotaCheck = await checkQuota(userId, fileSize);
        if (!quotaCheck.canUpload) throw new AppError(403, quotaCheck.message || "Quota exceeded");
      }

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
      const thumbs = req.query.thumbs === "true";
      // Files an app stored for the person only show when they ask for them (a source).
      const source = req.query.source as string | undefined;
      const listFilter = driveListFilter(source);

      // One response shape for every way of looking at the drive
      const send = async (folderDocs: any[], fileDocs: any[], extra: Record<string, unknown>) => {
        const [counts, urls] = await Promise.all([
          itemCounts(
            userId,
            folderDocs.map((f) => f._id),
          ),
          thumbs ? previewUrls(fileDocs) : Promise.resolve(new Map<string, string>()),
        ]);
        return res.json({
          status: true,
          data: {
            folders: folderDocs.map((f) => serializeFolder(f, counts.get(String(f._id)))),
            files: fileDocs.map((f) => ({ ...serializeFile(f), previewUrl: urls.get(String(f._id)) ?? null })),
            ...extra,
          },
        });
      };

      if (search) {
        const files = await XenDriveFile.find({
          owner_id: userId,
          ...listFilter,
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
          XenDriveFile.find({ owner_id: userId, ...driveOnly, shareEnabled: true })
            .sort({ createdAt: -1 })
            .limit(500)
            .exec(),
        ]);
        return send(folders, files, { folder: null, breadcrumb: [], searching: false, view: "shared" });
      }

      if (view === "recent") {
        const files = await XenDriveFile.find({ owner_id: userId, ...listFilter })
          .sort({ createdAt: -1 })
          .limit(50)
          .exec();
        return send([], files, { folder: null, breadcrumb: [], searching: false, view: "recent" });
      }

      const folder = folderId ? await ownFolder(folderId, userId) : null;
      // Folders hold only the person's own files, so they step aside when looking at one app's or uncounted files.
      const showFolders = !source || source === "all";
      const [folders, files, breadcrumb] = await Promise.all([
        showFolders
          ? XenDriveFolder.find({ owner_id: userId, parent_id: folderId }).sort({ name: 1 }).exec()
          : Promise.resolve([]),
        XenDriveFile.find({ owner_id: userId, ...listFilter, folder_id: folderId })
          .sort({ createdAt: -1 })
          .exec(),
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
    const [files, usage, sharedFiles, sharedFolders, [apps]] = await Promise.all([
      XenDriveFile.find({ owner_id: userId, ...driveOnly })
        .sort({ createdAt: -1 })
        .limit(3)
        .exec(),
      usageFor(userId),
      XenDriveFile.countDocuments({ owner_id: userId, ...driveOnly, shareEnabled: true }),
      XenDriveFolder.countDocuments({ owner_id: userId, "share.enabled": true }),
      // What apps have stored for the person (XenDrive > From apps): it still counts toward their quota.
      XenDriveFile.aggregate<{ count: number; size: number }>([
        { $match: { owner_id: new Types.ObjectId(userId), "source.app": { $exists: true } } },
        { $group: { _id: null, count: { $sum: 1 }, size: { $sum: { $ifNull: ["$size", 0] } } } },
      ]),
    ]);
    return res.json({
      status: true,
      data: {
        files: files.map(serializeFile),
        ...usage,
        sharedCount: sharedFiles + sharedFolders,
        appFiles: { count: apps?.count ?? 0, size: apps?.size ?? 0 },
      },
    });
  });

  // What apps have stored in the person's drive (chat attachments, ...), grouped by app and then by where it came from
  // ("Weekend trip"), so they can see it and free the space.
  app.get(
    "/api/xendrive/app-files",
    authenticateToken,
    validateQuery(xenDriveAppFilesQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const only = req.query.app as string | undefined;
      const files = await XenDriveFile.find({ owner_id: userId, "source.app": only ?? { $exists: true } })
        .sort({ createdAt: -1 })
        .limit(2000)
        .exec();

      const byApp = new Map<string, Map<string, XenDriveFileDocument[]>>();
      for (const f of files) {
        const appKey = f.source!.app!;
        const ref = f.source!.ref ?? "";
        const refs = byApp.get(appKey) ?? new Map<string, XenDriveFileDocument[]>();
        refs.set(ref, [...(refs.get(ref) ?? []), f]);
        byApp.set(appKey, refs);
      }

      const sum = (list: XenDriveFileDocument[]) => list.reduce((n, f) => n + (f.size ?? 0), 0);
      const apps = await Promise.all(
        [...byApp.entries()].map(async ([appKey, refs]) => {
          const definition = driveSourceApp(appKey);
          const names = definition ? await definition.describe(userId, [...refs.keys()]) : new Map<string, string>();
          const groups = [...refs.entries()].map(([ref, list]) => ({
            ref,
            label: names.get(ref) ?? "Unavailable",
            count: list.length,
            size: sum(list),
            files: list.map(serializeFile),
          }));
          const all = [...refs.values()].flat();
          return { app: appKey, label: definition?.label ?? appKey, count: all.length, size: sum(all), groups };
        }),
      );
      return res.json({ status: true, data: { apps, count: files.length, size: sum(files) } });
    },
  );

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

  // Public link for a folder: enable (or fetch the current one), rotate, disable
  const folderShare = (action: "enable" | "rotate" | "disable") =>
    async function (req: express.Request, res: express.Response) {
      const folder = await ownFolder(req.params.folderId as string, callerId(req));
      if (action === "disable") {
        folder.share = { enabled: false, token: folder.share?.token };
      } else {
        const keep = action === "enable" && folder.share?.token;
        folder.share = { enabled: true, token: keep ? folder.share!.token : randomToken(16) };
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
      const [breadcrumb, siblings, previewUrl] = await Promise.all([
        file.folder_id ? breadcrumbOf(file.folder_id.toString(), userId) : Promise.resolve([]),
        // the same order the folder lists them in, for previous / next
        // previous / next stay within the same kind: the drive's own files, or the same app's
        XenDriveFile.find(
          {
            owner_id: userId,
            folder_id: file.folder_id,
            ...(file.source?.app ? { "source.app": file.source.app } : driveOnly),
          },
          "name",
        )
          .sort({ createdAt: -1 })
          .limit(500)
          .lean(),
        PREVIEWABLE.test(file.mimeType) ? generateSignedUrl(file.storage_path, PREVIEW_MINUTES) : Promise.resolve(null),
      ]);
      const at = siblings.findIndex((x) => String(x._id) === file.id);
      const pick = (x?: { _id: unknown; name: string }) => (x ? { _id: String(x._id), name: x.name } : null);
      return res.json({
        status: true,
        data: {
          file: serializeFile(file),
          breadcrumb,
          previewUrl,
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

  // Rename, set or clear the password, set or clear the expiry
  app.put(
    "/api/xendrive/files/:fileId/settings",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    validate(xenDriveSettingsSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownFile(req.params.fileId as string, callerId(req));
      assertNotAppFile(file);
      const { password, expiry, name, shareEnabled } = req.body;

      if (name !== undefined) file.name = name;
      if (shareEnabled !== undefined) file.shareEnabled = shareEnabled;
      if (password !== undefined) file.password = password === "" || password === null ? undefined : password;
      if (expiry !== undefined) file.expiry = expiry === "" || expiry === null ? undefined : new Date(expiry);

      await file.save();

      return res.json({
        status: true,
        message: "File settings updated successfully",
        data: {
          name: file.name,
          shared: !!file.shareEnabled,
          hasPassword: !!file.password,
          password: file.password || null,
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
      assertNotAppFile(file);
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
      // The pre-delete hook removes the stored bytes too
      await XenDriveFile.findByIdAndDelete(file.id);
      // An app that stored the file lets go of it (a photo on an expense), so it doesn't show a broken image.
      if (file.source?.app) {
        await driveSourceApp(file.source.app)?.onRemoved?.(file.source.ref ?? "", [file.id]);
      }
      return res.json({ status: true, message: "File deleted successfully" });
    },
  );

  // ---------------------------------------------------------------------------------------------
  // Public: a single file's own link
  // ---------------------------------------------------------------------------------------------

  app.get(
    "/api/xendrive/info/:shareToken",
    validateParams(xenDriveShareTokenParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await XenDriveFile.findOne({ shareToken: req.params.shareToken, shareEnabled: true }).exec();
      if (!file) throw new AppError(404, "File not found");

      if (file.isExpired()) {
        return res.status(403).json({ status: false, message: "Link expired", isExpired: true });
      }

      return res.json({
        status: true,
        data: {
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
          requiresPassword: !!file.password,
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

      const file = await XenDriveFile.findOne({ shareToken: req.params.shareToken, shareEnabled: true }).exec();
      if (!file) throw new AppError(404, "File not found");

      if (file.isExpired()) {
        return res.status(403).json({ status: false, message: "Link expired" });
      }

      if (file.password) {
        const wrong = !password || typeof password !== "string" || !file.validPassword(password);
        if (wrong) {
          return res.status(401).json({
            status: false,
            message: !password ? "Password required" : "Incorrect password",
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
      const root = await sharedFolder(req.params.token as string);
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
          .exec(),
        breadcrumbOf(requested, root.owner_id.toString(), root.id),
      ]);

      const urls = await previewUrls(files);
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
            previewUrl: urls.get(f.id) ?? null,
          })),
        },
      });
    },
  );

  app.get(
    "/api/xendrive/public/folder/:token/files/:fileId",
    validateParams(xenDriveFolderTokenFileParamSchema),
    async function (req: express.Request, res: express.Response) {
      const root = await sharedFolder(req.params.token as string);
      const file = await XenDriveFile.findOne({ _id: req.params.fileId, owner_id: root.owner_id }).exec();
      if (!file || !file.folder_id || !(await isInside(file.folder_id.toString(), root.id))) {
        throw new AppError(404, "File not found");
      }
      if (file.isExpired()) throw new AppError(403, "Link expired");
      return streamFile(res, file);
    },
  );
};

/** Send a stored file to the response, under its own name. */
async function streamFile(res: express.Response, file: XenDriveFileDocument) {
  const gcsFile = privateBucket.file(file.storage_path);
  const [exists] = await gcsFile.exists();
  if (!exists) throw new AppError(404, "File not found in storage");

  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", attachment(file.name));
  if (file.size != null) res.setHeader("Content-Length", file.size);
  if (file.expiry) res.setHeader("X-File-Expiry", file.expiry.toISOString());
  gcsFile.createReadStream().pipe(res);
}

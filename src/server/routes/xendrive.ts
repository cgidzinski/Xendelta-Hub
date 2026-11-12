import express = require("express");
import {
  validate,
  validateParams,
  validateQuery,
  xenDriveBrowseQuerySchema,
  xenDriveChunkSchema,
  xenDriveDownloadQuerySchema,
  xenDriveFileIdParamSchema,
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
  shareToken: file.shareToken,
  hasPassword: !!file.password,
  password: file.password || null, // returned to the owner in plain text, as it always has been
  expiry: file.expiry ? file.expiry.toISOString() : null,
});

const serializeFolder = (folder: any) => ({
  _id: folder._id.toString(),
  name: folder.name,
  parent_id: folder.parent_id ? folder.parent_id.toString() : null,
  shared: !!folder.share?.enabled,
  shareToken: folder.share?.enabled ? folder.share.token : null,
  created_at: folder.created_at.toISOString(),
});

/** One of the caller's files, or a 404 (a stranger's file looks the same as a missing one). */
async function ownFile(fileId: string, userId: string) {
  const file = await XenDriveFile.findOne({ _id: fileId, owner_id: userId }).exec();
  if (!file) throw new AppError(404, "File not found");
  return file;
}

async function ownFolder(folderId: string, userId: string) {
  const folder = await XenDriveFolder.findOne({ _id: folderId, owner_id: userId }).exec();
  if (!folder) throw new AppError(404, "Folder not found");
  return folder;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
      const { filename, totalChunks, fileSize, folderId } = req.body;
      const userId = callerId(req);

      try {
        await assertOwnFolder(userId, folderId);
      } catch {
        throw new AppError(404, "Folder not found");
      }

      const quotaCheck = await checkQuota(userId, fileSize);
      if (!quotaCheck.canUpload) throw new AppError(403, quotaCheck.message || "Quota exceeded");

      const uploadId = await initiateChunkedUpload(userId, filename, totalChunks, folderId ?? null);
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

      if (search) {
        const files = await XenDriveFile.find({
          owner_id: userId,
          name: { $regex: escapeRegex(search), $options: "i" },
        })
          .sort({ createdAt: -1 })
          .limit(200)
          .exec();
        return res.json({
          status: true,
          data: { folder: null, breadcrumb: [], folders: [], files: files.map(serializeFile), searching: true },
        });
      }

      const folder = folderId ? await ownFolder(folderId, userId) : null;
      const [folders, files, breadcrumb] = await Promise.all([
        XenDriveFolder.find({ owner_id: userId, parent_id: folderId }).sort({ name: 1 }).exec(),
        XenDriveFile.find({ owner_id: userId, folder_id: folderId }).sort({ createdAt: -1 }).exec(),
        folderId ? breadcrumbOf(folderId, userId) : Promise.resolve([]),
      ]);

      return res.json({
        status: true,
        data: {
          folder: folder ? { _id: folder._id.toString(), name: folder.name } : null,
          breadcrumb,
          folders: folders.map(serializeFolder),
          files: files.map(serializeFile),
          searching: false,
        },
      });
    },
  );

  // The latest files anywhere in the drive, and the totals (the home screen card)
  app.get("/api/xendrive/recent", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = callerId(req);
    const [files, usage] = await Promise.all([
      XenDriveFile.find({ owner_id: userId }).sort({ createdAt: -1 }).limit(3).exec(),
      usageFor(userId),
    ]);
    return res.json({ status: true, data: { files: files.map(serializeFile), ...usage } });
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
      const file = await ownFile(req.params.fileId as string, callerId(req));
      const breadcrumb = file.folder_id ? await breadcrumbOf(file.folder_id.toString(), callerId(req)) : [];
      return res.json({ status: true, data: { file: serializeFile(file), breadcrumb } });
    },
  );

  app.get(
    "/api/xendrive/files/:fileId/url",
    authenticateToken,
    validateParams(xenDriveFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownFile(req.params.fileId as string, callerId(req));
      const url = await generateSignedUrl(file.storage_path, 15); // 15 minutes
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
      const { password, expiry, name } = req.body;

      if (name !== undefined) file.name = name;
      if (password !== undefined) file.password = password === "" || password === null ? undefined : password;
      if (expiry !== undefined) file.expiry = expiry === "" || expiry === null ? undefined : new Date(expiry);

      await file.save();

      return res.json({
        status: true,
        message: "File settings updated successfully",
        data: {
          name: file.name,
          hasPassword: !!file.password,
          password: file.password || null,
          expiry: file.expiry ? file.expiry.toISOString() : null,
          shareUrl: `${req.protocol}://${req.get("host")}/xendrive/${file.shareToken}`,
        },
      });
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
      const file = await XenDriveFile.findOne({ shareToken: req.params.shareToken }).exec();
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

      const file = await XenDriveFile.findOne({ shareToken: req.params.shareToken }).exec();
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

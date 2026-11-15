import express = require("express");
import { callerId, AppError } from "../utils/http";
import { authenticateToken } from "../middleware/auth";
import { driveSourceApp } from "../utils/driveSources";
import { generateSignedUrl } from "../utils/storageUtils";
import { isTextPreviewable, readTextPreview } from "../utils/fileText";
import { previewUrlFor, thumbnailUrlFor } from "../utils/xendriveThumbs";
import { FileRecord, type FileRecordDocument } from "../models/fileRecord";
import { removeAppFiles } from "../utils/appFiles";
import {
  storageAppFilesQuerySchema,
  storageFileIdParamSchema,
  storageFileUrlQuerySchema,
  validateParams,
  validateQuery,
} from "../utils/validation";

// The storage viewer (docs/storage.md): files apps stored for the person (chat attachments, photos on an expense, note
// or recipe). They are real XenDrive files but no longer listed inside XenDrive itself; this is where people see them and
// free the space. The old `/api/xendrive/app-files` address is kept as an alias for one release.

/** What a person can look at in the browser without downloading. */
const PREVIEWABLE = /^(image\/|application\/pdf$|video\/|audio\/)/;
const PREVIEW_MINUTES = 60;

const serializeStorageFile = (file: FileRecordDocument | any) => ({
  _id: file._id.toString(),
  name: file.name,
  mimeType: file.mimeType,
  size: file.size,
  createdAt: file.createdAt.toISOString(),
  source: file.space?.app
    ? { app: file.space.app as string, label: driveSourceApp(file.space.app)?.label ?? file.space.app }
    : null,
  counted: file.counted !== false,
});

/** What apps stored (everything private that isn't a file uploaded straight to XenDrive). */
const appFiles = (userId: string) => ({ bucket: "private", uploadedBy: userId, "space.app": { $ne: "xendrive" } });

/** One of the caller's app-stored files, or a 404 (a stranger's file looks the same as a missing one). */
async function ownAppFile(fileId: string, userId: string) {
  const file = await FileRecord.findOne({ _id: fileId, ...appFiles(userId) }).exec();
  if (!file) throw new AppError(404, "File not found");
  return file;
}

/** What apps have stored for the person, grouped by app and then by where it came from ("Weekend trip"). */
const appFilesHandler = async function (req: express.Request, res: express.Response) {
  const userId = callerId(req);
  const only = req.query.app as string | undefined;
  const files = await FileRecord.find({ ...appFiles(userId), ...(only ? { "space.app": only } : {}) })
    .sort({ createdAt: -1 })
    .limit(2000)
    .exec();

  const byApp = new Map<string, Map<string, FileRecordDocument[]>>();
  for (const f of files) {
    const appKey = f.space.app;
    const ref = f.space.ref ?? "";
    const refs = byApp.get(appKey) ?? new Map<string, FileRecordDocument[]>();
    refs.set(ref, [...(refs.get(ref) ?? []), f]);
    byApp.set(appKey, refs);
  }

  const sum = (list: FileRecordDocument[]) => list.reduce((n, f) => n + (f.size ?? 0), 0);
  const apps = await Promise.all(
    [...byApp.entries()].map(async ([appKey, refs]) => {
      const definition = driveSourceApp(appKey);
      const names = definition ? await definition.describe(userId, [...refs.keys()]) : new Map<string, string>();
      const groups = [...refs.entries()].map(([ref, list]) => ({
        ref,
        label: names.get(ref) ?? "Unavailable",
        count: list.length,
        size: sum(list),
        files: list.map(serializeStorageFile),
      }));
      const all = [...refs.values()].flat();
      return { app: appKey, label: definition?.label ?? appKey, count: all.length, size: sum(all), groups };
    }),
  );
  return res.json({ status: true, data: { apps, count: files.length, size: sum(files) } });
};

module.exports = function (app: express.Application) {
  app.get("/api/storage/app-files", authenticateToken, validateQuery(storageAppFilesQuerySchema), appFilesHandler);
  // One-release alias so bookmarks and the old client keep working.
  app.get("/api/xendrive/app-files", authenticateToken, validateQuery(storageAppFilesQuerySchema), appFilesHandler);

  app.get(
    "/api/storage/files/:fileId",
    authenticateToken,
    validateParams(storageFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownAppFile(req.params.fileId as string, callerId(req));
      const isImage = file.mimeType.startsWith("image/");
      const isVideo = file.mimeType.startsWith("video/");
      const previewUrl = isImage
        ? file.thumbKey
          ? await previewUrlFor(file.key)
          : await generateSignedUrl(file.key, PREVIEW_MINUTES)
        : PREVIEWABLE.test(file.mimeType)
          ? await generateSignedUrl(file.key, PREVIEW_MINUTES)
          : null;
      const posterUrl = isVideo && file.thumbKey ? await thumbnailUrlFor(file.key) : null;
      return res.json({ status: true, data: { file: serializeStorageFile(file), previewUrl, posterUrl } });
    },
  );

  // The first ~256 KB of a text-like file, for the in-page preview (no R2 CORS setup needed).
  app.get(
    "/api/storage/files/:fileId/text",
    authenticateToken,
    validateParams(storageFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownAppFile(req.params.fileId as string, callerId(req));
      if (!isTextPreviewable(file.mimeType)) throw new AppError(404, "No text preview for this kind of file");
      return res.json({ status: true, data: await readTextPreview(file.key) });
    },
  );

  app.get(
    "/api/storage/files/:fileId/url",
    authenticateToken,
    validateParams(storageFileIdParamSchema),
    validateQuery(storageFileUrlQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownAppFile(req.params.fileId as string, callerId(req));
      const url = await generateSignedUrl(
        file.key,
        15, // minutes
        req.query.download === "1" ? { downloadName: file.name } : {},
      );
      return res.json({ status: true, data: { url } });
    },
  );

  app.delete(
    "/api/storage/files/:fileId",
    authenticateToken,
    validateParams(storageFileIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const file = await ownAppFile(req.params.fileId as string, callerId(req));
      // A file that doesn't use the person's storage belongs to the app that stored it: the app owns deleting it.
      // (A community channel's files are the exception: the uploader may delete their own, though the community pays.)
      if (file.counted === false && file.payer.type !== "community")
        throw new AppError(
          400,
          "This file belongs to another app and doesn't use your storage, so it can't be deleted here",
        );
      await removeAppFiles([file.id]);
      // An app that stored the file lets go of it (a photo on an expense), so it doesn't show a broken image.
      await driveSourceApp(file.space.app)?.onRemoved?.(file.space.ref ?? "", [file.id]);
      return res.json({ status: true, message: "File deleted successfully" });
    },
  );
};

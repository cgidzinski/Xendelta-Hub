import type { Request, Response } from "express";
import { validateParams, xenNoteIdParamSchema } from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { uploadXenNotePageFiles } from "../../config/multer";
import { FileRecord } from "../../models/fileRecord";
import { XenNotePage } from "../../models/xenNotePage";
import { storeAppFiles, removeAppFiles, signedUrlsFor, thumbnailUrlsFor } from "../../utils/appFiles";
import { MAX_PAGE_FILES } from "../../../shared/xennote/pages";
import { XENNOTE_APP } from "../../utils/xenNotePages";
import { loadPage } from "./pageAccess";
import { processImage, renamed } from "./images";

// Files for a page: pictures and anything else (PDFs and text preview in the page). They are stored as the uploader's
// own files, tagged with the page (utils/appFiles.ts), and a page's text refers to them by id. A body only keeps a file
// that was uploaded to this page (utils/xenNotePages.ts sanitizePageDoc), so naming someone else's file does nothing.

const MAX_PER_REQUEST = 10;

export function registerPageFileRoutes(app: any) {
  app.post(
    "/api/xennote/pages/:id/files",
    validateParams(xenNoteIdParamSchema),
    uploadXenNotePageFiles.array("files", MAX_PER_REQUEST),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { page } = await loadPage(req, req.params.id as string, "edit");
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw new AppError(400, "Choose at least one file");
      const have = await FileRecord.countDocuments({ "space.app": XENNOTE_APP, "space.ref": page.id });
      if (have + files.length > MAX_PAGE_FILES) {
        throw new AppError(400, `A page can have up to ${MAX_PAGE_FILES} files`);
      }

      // Pictures are resized (GIFs are kept); everything else is stored as it came. Do them all first, so one
      // unreadable picture fails the request before anything is stored.
      const prepared = await Promise.all(
        files.map(async (file) => {
          if (!file.mimetype.startsWith("image/") || file.mimetype === "image/svg+xml") {
            return {
              buffer: file.buffer,
              mimeType: file.mimetype || "application/octet-stream",
              name: file.originalname,
            };
          }
          try {
            const image = await processImage(file);
            return { buffer: image.buffer, mimeType: image.contentType, name: renamed(file.originalname, image.ext) };
          } catch {
            throw new AppError(400, `Couldn't read "${file.originalname}". Try a JPEG or PNG.`);
          }
        }),
      );
      const stored = await storeAppFiles(uid, { app: XENNOTE_APP, ref: page.id as string }, prepared);

      const ids = stored.map((f) => String(f._id));
      let urls: Awaited<ReturnType<typeof signedUrlsFor>>;
      let thumbs: Awaited<ReturnType<typeof thumbnailUrlsFor>>;
      try {
        [urls, thumbs] = await Promise.all([signedUrlsFor(ids, 60), thumbnailUrlsFor(ids)]);
        await loadPage(req, page.id as string, "edit");
        const attached = await XenNotePage.updateOne(
          {
            _id: page._id,
            $expr: {
              $lte: [
                { $size: { $setUnion: [{ $ifNull: ["$attachments", []] }, { $ifNull: ["$files", []] }] } },
                MAX_PAGE_FILES - ids.length,
              ],
            },
          },
          { $addToSet: { attachments: { $each: ids } } },
        );
        if (attached.matchedCount === 0) throw new AppError(409, "The page changed while uploading. Try again.");
      } catch (error) {
        await removeAppFiles(ids);
        throw error;
      }
      const uploaded = stored.map((file) => ({
        id: String(file._id),
        name: file.name,
        size: file.size,
        mime: file.mimeType,
        url: urls.get(String(file._id)) ?? null,
        thumbUrl: thumbs.get(String(file._id)) ?? null,
      }));
      res.json({ status: true, message: "Files added", data: { files: uploaded } });
    },
  );
}

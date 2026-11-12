import type { Request, Response } from "express";
import sharp from "sharp";
import { validateParams, xenNoteIdParamSchema, xenNoteImageParamSchema } from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { uploadXenNoteImages } from "../../config/multer";
import { storeAppFiles, removeAppFiles } from "../../utils/appFiles";
import { XENNOTE_SOURCE, removeNotePhotos } from "../../utils/xenNoteFiles";
import { roleOf } from "../../utils/membership";
import { MAX_NOTE_IMAGES } from "../../../shared/xennote/notes";
import { loadNote, notifyChange, serializeNote } from "./shared";

const IMAGE_MAX_EDGE = 1600;

/** The file's name with the extension of what it was re-encoded to ("IMG_1.heic" → "IMG_1.webp"). */
const renamed = (name: string, ext: string) => `${name.replace(/\.[^.]*$/, "") || "photo"}.${ext}`;

/** Resize to a sensible size, honour EXIF rotation, and re-encode as WebP (GIF stays GIF). */
async function processImage(file: Express.Multer.File): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  if (file.mimetype === "image/gif") return { buffer: file.buffer, contentType: "image/gif", ext: "gif" };
  const buffer = await sharp(file.buffer)
    .rotate()
    .resize(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return { buffer, contentType: "image/webp", ext: "webp" };
}

export function registerNoteImageRoutes(app: any) {
  // Add photos to a note. Stored privately; clients get short-lived signed URLs.
  app.post(
    "/api/xennote/notes/:id/images",
    validateParams(xenNoteIdParamSchema),
    uploadXenNoteImages.array("images", MAX_NOTE_IMAGES),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, notebook } = await loadNote(req, req.params.id as string, "edit");
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) throw new AppError(400, "Choose at least one photo");
      if (note.images.length + files.length > MAX_NOTE_IMAGES) {
        throw new AppError(400, `A note can have up to ${MAX_NOTE_IMAGES} photos`);
      }

      // Resize them all first, so one unreadable file fails the request before anything is stored.
      const processed = await Promise.all(
        files.map(async (file) => {
          try {
            const image = await processImage(file);
            return { buffer: image.buffer, mimeType: image.contentType, name: renamed(file.originalname, image.ext) };
          } catch {
            throw new AppError(400, `Couldn't read "${file.originalname}". Try a JPEG or PNG.`);
          }
        }),
      );
      // Stored as XenDrive files owned by the uploader (tagged to this note); all or nothing.
      const stored = await storeAppFiles(uid, { app: XENNOTE_SOURCE, ref: note.id as string }, processed);
      for (const file of stored) note.images.push({ file_id: file._id, uploaded_by: uid });
      note.updated_by = uid;
      try {
        await note.save();
      } catch (error) {
        await removeAppFiles(stored.map((f) => f._id));
        throw error;
      }
      notifyChange(notebook, note.owner_id);
      res.json({
        status: true,
        message: "Photos added",
        data: { note: await serializeNote(note, { uid, role: notebook ? roleOf(notebook.toObject(), uid) : "owner" }) },
      });
    },
  );

  app.delete(
    "/api/xennote/notes/:id/images/:imageId",
    validateParams(xenNoteImageParamSchema),
    async (req: Request, res: Response) => {
      const uid = callerId(req);
      const { note, notebook } = await loadNote(req, req.params.id as string, "edit");
      const image = note.images.find((i) => String(i._id) === req.params.imageId);
      if (!image) throw new AppError(404, "Photo not found");
      await removeNotePhotos([image]);
      note.images.pull(image._id);
      note.updated_by = uid;
      await note.save();
      notifyChange(notebook, note.owner_id);
      res.json({
        status: true,
        message: "Photo removed",
        data: { note: await serializeNote(note, { uid, role: notebook ? roleOf(notebook.toObject(), uid) : "owner" }) },
      });
    },
  );
}

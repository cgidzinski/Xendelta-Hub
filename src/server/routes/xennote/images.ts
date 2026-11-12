import type { Request, Response } from "express";
import crypto from "crypto";
import sharp from "sharp";
import { validateParams, xenNoteIdParamSchema, xenNoteImageParamSchema } from "../../utils/validation";
import { AppError, callerId } from "../../utils/http";
import { uploadXenNoteImages } from "../../config/multer";
import { deleteFromGCS, uploadToGCS } from "../../utils/gcsUtils";
import { roleOf } from "../../utils/membership";
import { MAX_NOTE_IMAGES } from "../../../shared/xennote/notes";
import { loadNote, notifyChange, serializeNote } from "./shared";

const IMAGE_MAX_EDGE = 1600;

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

      for (const file of files) {
        let processed;
        try {
          processed = await processImage(file);
        } catch {
          throw new AppError(400, `Couldn't read "${file.originalname}". Try a JPEG or PNG.`);
        }
        const path = `xennote/${note.id}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${processed.ext}`;
        await uploadToGCS(processed.buffer, path, processed.contentType, true);
        note.images.push({ gcs_path: path });
        note.updated_by = uid;
        // Save after each photo, so one bad file doesn't orphan the ones already stored.
        await note.save();
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
      await deleteFromGCS(image.gcs_path, true).catch(() => undefined);
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

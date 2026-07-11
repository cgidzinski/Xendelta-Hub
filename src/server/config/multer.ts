/**
 * Multer Configuration
 * File upload configuration for avatar and blog asset uploads
 * Uses memory storage since files are processed and uploaded directly to GCS
 */

import multer from "multer";
import { Request } from "express";
import os from "os";
import crypto from "crypto";
import {
  MAX_FILE_SIZE,
  MAX_BLOG_ASSET_SIZE,
  MAX_RECIPAINT_ASSET_SIZE,
  MAX_XENSPLIT_IMAGE_SIZE,
  MAX_DATABASE_IMPORT_SIZE,
  ALLOWED_IMAGE_MIMES,
} from "../constants";

// File filter function for images only
const imageFileFilter = function (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  // Accept only image files
  if (ALLOWED_IMAGE_MIMES.includes(file.mimetype as typeof ALLOWED_IMAGE_MIMES[number])) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images are allowed."));
  }
};

// File filter function for all file types (for blog assets)
const allFileFilter = function (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  // Accept all file types for blog assets
  cb(null, true);
};

// Configured multer instance for avatars (memory storage)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: imageFileFilter,
});

// Configured multer instance for blog assets (memory storage) - accepts all file types
export const uploadBlogAsset = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_BLOG_ASSET_SIZE,
  },
  fileFilter: allFileFilter,
});

// Configured multer instance for recipaint assets (memory storage) - accepts images only
export const uploadRecipaintAsset = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_RECIPAINT_ASSET_SIZE,
  },
  fileFilter: imageFileFilter,
});

// Configured multer instance for xensplit expense images (memory storage) - accepts images only
export const uploadXenSplitImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_XENSPLIT_IMAGE_SIZE,
  },
  fileFilter: imageFileFilter,
});

// File filter for database dump uploads - only gzip archives
const gzipFileFilter = function (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (file.mimetype === "application/gzip" || file.originalname.endsWith(".gz")) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only .gz database dump files are allowed."));
  }
};

// Configured multer instance for admin database dump uploads (disk storage, since dumps can
// be large and shouldn't sit fully-buffered in process memory)
export const uploadDatabaseDump = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `xendelta-import-${Date.now()}-${crypto.randomUUID()}.gz`),
  }),
  limits: {
    fileSize: MAX_DATABASE_IMPORT_SIZE,
  },
  fileFilter: gzipFileFilter,
});


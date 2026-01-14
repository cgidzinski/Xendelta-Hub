/**
 * Multer Configuration
 * File upload configuration for avatar and blog asset uploads
 * Uses memory storage since files are processed and uploaded directly to GCS
 */

import multer from "multer";
import { Request } from "express";
import { MAX_FILE_SIZE, MAX_BLOG_ASSET_SIZE, MAX_RECIPAINT_ASSET_SIZE, ALLOWED_IMAGE_MIMES } from "../constants";

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


/**
 * Multer Configuration
 * File upload configuration for avatar uploads
 */

import multer from "multer";
import path from "path";
import fs from "fs";
import { MAX_FILE_SIZE, ALLOWED_IMAGE_MIMES } from "../constants";

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), "src", "server", "public", "avatars");
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Temporary filename, will be renamed by saveAvatarFile
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "temp-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter function
const fileFilter = function (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  // Accept only image files
  if (ALLOWED_IMAGE_MIMES.includes(file.mimetype as any)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images are allowed."));
  }
};

// Configured multer instance
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: fileFilter,
});

// Blog image upload storage
const blogImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), "src", "server", "public", "blog-images");
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Temporary filename, will be renamed by saveBlogImage
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "temp-" + uniqueSuffix + path.extname(file.originalname));
  },
});

// Configured multer instance for blog images
export const uploadBlogImage = multer({
  storage: blogImageStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: fileFilter,
});


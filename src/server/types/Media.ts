import { MediaType } from "./MediaType";

/**
 * Media document interface (as stored in database)
 */
export interface MediaDocument {
  _id: string;
  location: string; // Folder location (e.g., "blog", "avatar")
  filename: string; // Filename with extension (e.g., "image-1234567890.jpg")
  type: MediaType; // Media type: "avatar" or "blog"
  mimeType: string; // MIME type (e.g., "image/jpeg", "application/pdf")
  size?: number; // File size in bytes
  uploadedBy?: string; // User ID who uploaded (optional)
  createdAt: Date;
}

/**
 * Media API response (formatted for frontend)
 */
export interface MediaResponse {
  _id: string;
  path: string; // URL path (e.g., "/assets/{filename}")
  filename: string; // Filename with extension
  location: string; // Folder location
  type: MediaType;
  mimeType: string;
  size?: number;
  uploadedBy?: string;
  createdAt: string; // ISO string
}


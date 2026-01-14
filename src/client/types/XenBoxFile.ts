/**
 * XenBox File interface (as returned from API)
 */
export interface XenBoxFile {
  _id: string;
  location: string; // Folder location (e.g., "xenbox")
  filename: string; // Filename with extension
  mimeType: string; // MIME type (e.g., "image/jpeg", "application/pdf")
  size: number; // File size in bytes
  uploadedBy: string; // User ID who uploaded
  createdAt: string; // ISO string
  shareToken?: string; // Share token for public access
  hasPassword?: boolean; // Whether file has password protection
  password?: string | null; // Plain text password (if set)
  expiry?: string | null; // Expiry date (ISO string) or null
}

/**
 * File list response
 */
export interface XenBoxFileListResponse {
  files: XenBoxFile[];
}

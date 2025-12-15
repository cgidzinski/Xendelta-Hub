/**
 * Media upload response
 */
export interface MediaUploadResponse {
  status: boolean;
  message: string;
  data: {
    mediaId: string; // Media document ID
    path: string; // URL path (e.g., "/assets/{filename}")
    filename: string; // Filename with extension
    location: string; // Folder location
    type: string; // Media type: "avatar", "blog", or "other"
    mimeType: string; // MIME type (e.g., "image/jpeg", "application/pdf")
    size: number; // File size in bytes
  };
}


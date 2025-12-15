/**
 * Media type enum
 */
export enum MediaType {
  Avatar = "avatar",
  Blog = "blog",
}

/**
 * Media interface (as returned from API)
 */
export interface Media {
  _id: string;
  filename: string; // Filename with extension
  location: string; // Folder location
  type: MediaType;
  mimeType: string;
  size?: number;
  uploadedBy?: string;
  createdAt: string; // ISO string
}


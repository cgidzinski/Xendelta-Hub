import { UserInfo } from "./UserInfo";

/**
 * Blog post interface (as returned from API)
 */
export interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  markdown: string;
  publishDate: string; // ISO string
  assets?: string[]; // Array of direct GCS public URLs
  featuredImage?: string | null; // Direct GCS public URL or null
  categories: string[];
  tags: string[];
  featured: boolean;
  published: boolean;
  author: UserInfo | null;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}


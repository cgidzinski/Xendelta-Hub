import { BlogPostAuthor } from "./BlogPostAuthor";
import { BlogAssetResponse } from "./BlogAssetResponse";

/**
 * Blog post API response (formatted for frontend)
 */
export interface BlogPostResponse {
  _id: string;
  title: string;
  slug: string;
  markdown: string;
  publishDate: string; // ISO string
  assets: BlogAssetResponse[];
  featuredImage?: string;
  categories: string[];
  tags: string[];
  featured: boolean;
  published: boolean;
  author: BlogPostAuthor | null;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}


/**
 * Blog post creation/update payload
 */
export interface BlogPostPayload {
  title: string;
  slug: string;
  markdown: string;
  publishDate: string; // ISO string
  assets?: string[]; // Array of media IDs
  featuredImage?: string; // Media ID
  categories: string[];
  tags: string[];
  featured: boolean;
  published: boolean;
}


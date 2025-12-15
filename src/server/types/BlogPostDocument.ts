import { BlogPostAuthor } from "./BlogPostAuthor";

/**
 * Blog post document interface (as stored in database)
 */
export interface BlogPostDocument {
  _id: string;
  title: string;
  slug: string;
  markdown: string;
  publishDate: Date;
  assets: any[]; // Array of Media ObjectIds (can be populated)
  featuredImage?: any; // Media ObjectId (can be populated)
  categories: string[];
  tags: string[];
  featured: boolean;
  published: boolean;
  author: string | BlogPostAuthor; // ObjectId or populated author
  createdAt: Date;
  updatedAt: Date;
  populate?: (fields: string | string[]) => Promise<BlogPostDocument>;
}


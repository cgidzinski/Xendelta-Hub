/**
 * Slug Generation Utilities
 * Functions for generating and validating URL-friendly slugs
 */

import { BlogPost } from "../models/blogPost";

/**
 * Generate a URL-friendly slug from a title
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/[\s_-]+/g, "-") // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Ensure a slug is unique by appending a number if needed
 */
export async function ensureUniqueSlug(
  slug: string,
  excludeId: string | null = null
): Promise<string> {
  let uniqueSlug = slug;
  let counter = 1;

  while (true) {
    const query: any = { slug: uniqueSlug };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existing = await BlogPost.findOne(query).exec();
    if (!existing) {
      break;
    }

    uniqueSlug = `${slug}-${counter}`;
    counter++;
  }

  return uniqueSlug;
}

/**
 * Validate slug format
 */
export function isValidSlug(slug: string): boolean {
  // Slug should only contain lowercase letters, numbers, and hyphens
  // Should not start or end with a hyphen
  // Should be between 1 and 200 characters
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length >= 1 && slug.length <= 200;
}

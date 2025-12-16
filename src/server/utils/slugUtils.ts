const { BlogPost } = require("../models/blogPost");

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

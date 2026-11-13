import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { randomToken } from "../utils/tokens";

// XENLINK SCHEMA
const xenlinkSchema = new Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  slug: { type: String, unique: true, index: true },
  // The person who owns the link (a user id). Links used to be listed in `users.xenlink` instead.
  owner_id: { type: String, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export type XenLinkAttrs = InferSchemaType<typeof xenlinkSchema>;

const XenLink = mongoose.model("XenLink", xenlinkSchema);

const DUPLICATE_KEY = 11000;
const SLUG_ATTEMPTS = 5;

/** A short random slug (8 URL-safe characters). Older links keep their counter-style slugs; the unique index keeps both apart. */
export function newSlug(): string {
  return randomToken(6);
}

/**
 * Create a link with a fresh random slug. A collision with an existing slug (the unique index answers with
 * E11000) is retried with a new slug, so concurrent creates and deletes can never wedge link creation.
 */
export async function createXenLink(fields: { name: string; url: string; owner_id?: string }) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await new XenLink({ ...fields, slug: newSlug() }).save();
    } catch (err) {
      const duplicateSlug = (err as { code?: number }).code === DUPLICATE_KEY;
      if (!duplicateSlug || attempt >= SLUG_ATTEMPTS) throw err;
    }
  }
}

export { XenLink };

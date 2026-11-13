import mongoose, { Schema, type InferSchemaType } from "mongoose";

// XENLINK SCHEMA
const xenlinkSchema = new Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  slug: { type: String, unique: true, index: true },
  // The person who owns the link (a user id). Links used to be listed in `users.xenlink` instead.
  owner_id: { type: String, index: true },
  // Clicks: every time someone follows the link (presses Go on its page). `last_clicked_at` is the latest.
  clicks: { type: Number, default: 0 },
  last_clicked_at: { type: Date },
  // After this the link stops working (and says so). Unset = never.
  expires_at: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

xenlinkSchema.pre("save", async function (next) {
  if (!this.slug) {
    // Get the count of existing documents
    const count = await (this.constructor as mongoose.Model<unknown>).countDocuments();

    // Convert count to base62 (alphanumeric) for shorter strings
    this.slug = toBase62(count + 1);
  }
  next();
});

function toBase62(num: number): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";

  while (num > 0) {
    result = chars[num % 62] + result;
    num = Math.floor(num / 62);
  }

  return result || "0";
}

export type XenLinkAttrs = InferSchemaType<typeof xenlinkSchema>;

const XenLink = mongoose.model("XenLink", xenlinkSchema);

// Clicks per day, for each link's chart. A row per link per UTC day, bumped with one atomic upsert (so two clicks at
// once can't lose a count), and expired by the database after a little more than the chart shows.
const xenlinkDaySchema = new Schema({
  link_id: { type: Schema.Types.ObjectId, required: true },
  day: { type: Date, required: true },
  n: { type: Number, default: 0 },
});
xenlinkDaySchema.index({ link_id: 1, day: 1 }, { unique: true });
xenlinkDaySchema.index({ day: 1 }, { expireAfterSeconds: 40 * 86_400 });
const XenLinkDay = mongoose.model("XenLinkDay", xenlinkDaySchema);

/** Midnight UTC of the day `at` falls in. */
export const utcDay = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

export { XenLink, XenLinkDay };

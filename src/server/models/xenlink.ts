import mongoose, { Schema, type InferSchemaType } from "mongoose";

// XENLINK SCHEMA
const xenlinkSchema = new Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  slug: { type: String, unique: true, index: true },
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

export { XenLink };

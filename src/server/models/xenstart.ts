import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { HUB_SECTIONS, SEARCH_ENGINES } from "@shared/xenstart";

const quickLinkSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false },
);

const xenStartSchema = new Schema({
  owner_id: { type: String, required: true, unique: true },
  links: { type: [quickLinkSchema], default: [] },
  engine: { type: String, enum: SEARCH_ENGINES, required: true },
  sections: { type: [String], enum: HUB_SECTIONS, default: [] },
  revision: { type: Number, required: true },
  appearance: {
    type: new Schema({ rows: Number, columns: Number, backgroundUrl: String, showClock: Boolean }, { _id: false }),
  },
});

export type XenStartDocument = InferSchemaType<typeof xenStartSchema>;
export const XenStart = mongoose.model("XenStart", xenStartSchema);

import mongoose, { Schema, type InferSchemaType } from "mongoose";
import {
  BACKGROUND_FITS,
  CLOCK_FORMATS,
  HUB_SECTIONS,
  REGION_ALIGNMENTS,
  REGION_HEIGHT_SHARES,
  SEARCH_ENGINES,
  WIDGET_TYPES,
  WIDGET_SIZES,
} from "@shared/xenstart";

const quickLinkSchema = new Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    url: { type: String, required: true },
    iconUrl: String,
    slot: Number,
  },
  { _id: false },
);

const regionStyleSchema = new Schema(
  {
    height: { type: Number, enum: REGION_HEIGHT_SHARES },
    alignment: { type: String, enum: REGION_ALIGNMENTS },
    paddingTop: Number,
  },
  { _id: false },
);

const xenStartSchema = new Schema({
  owner_id: { type: String, required: true, unique: true },
  links: { type: [quickLinkSchema], default: [] },
  engine: { type: String, enum: SEARCH_ENGINES, required: true },
  sections: { type: [String], enum: HUB_SECTIONS, default: [] },
  revision: { type: Number, required: true },
  regionStyles: {
    type: new Schema(
      {
        top: regionStyleSchema,
        center: regionStyleSchema,
        left: regionStyleSchema,
        right: regionStyleSchema,
        bottom: regionStyleSchema,
      },
      { _id: false, minimize: false },
    ),
  },
  clockFormat: { type: String, enum: CLOCK_FORMATS },
  clockSize: { type: String, enum: WIDGET_SIZES },
  linkTileSize: { type: String, enum: WIDGET_SIZES },
  backgroundFit: { type: String, enum: BACKGROUND_FITS },
  backgroundImage: {
    type: new Schema({ id: { type: String, required: true }, data: { type: Buffer, required: true } }, { _id: false }),
  },
  layout: {
    type: new Schema(
      {
        top: { type: [String], enum: WIDGET_TYPES, required: true },
        center: { type: [String], enum: WIDGET_TYPES, required: true },
        left: { type: [String], enum: WIDGET_TYPES, required: true },
        right: { type: [String], enum: WIDGET_TYPES, required: true },
        bottom: { type: [String], enum: WIDGET_TYPES, required: true },
      },
      { _id: false },
    ),
  },
  appearance: {
    type: new Schema({ rows: Number, columns: Number, backgroundUrl: String, showClock: Boolean }, { _id: false }),
  },
});

export type XenStartDocument = InferSchemaType<typeof xenStartSchema>;
export const XenStart = mongoose.model("XenStart", xenStartSchema);

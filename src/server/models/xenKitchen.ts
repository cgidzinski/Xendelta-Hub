import mongoose, { Schema, type InferSchemaType } from "mongoose";

// A recipe book is the unit of sharing: items and categories belong to a book, and people
// are members of it. Everything in a shared book is shared with everyone in it.
const bookMemberSchema = new Schema(
  {
    user_id: { type: String, required: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" },
    added_at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const bookSchema = new Schema({
  name: { type: String, required: true, maxlength: 60 },
  description: { type: String, default: "", maxlength: 500 },
  icon: { type: String, default: "restaurant", maxlength: 30 },
  color: { type: String, default: "#ff8a65", maxlength: 9 },
  members: { type: [bookMemberSchema], default: [] },
  // Set on the starter book made automatically for this user. The unique index makes that
  // creation safe when several first-visit requests arrive at once: only one can insert.
  default_for: { type: String, default: undefined },
  share: {
    enabled: { type: Boolean, default: false },
    token: { type: String, default: undefined },
  },
  created_at: { type: Date, default: Date.now },
});

bookSchema.index({ "members.user_id": 1 });
bookSchema.index({ default_for: 1 }, { unique: true, sparse: true });
bookSchema.index({ "share.token": 1 }, { unique: true, sparse: true });

// A category decides which fields its items show. "recipe" is ingredients + steps;
// "instructions" is the heating directions off a box (oven/microwave/air fryer...).
const categorySchema = new Schema({
  book_id: { type: Schema.Types.ObjectId, ref: "XenKitchenBook", required: true },
  name: { type: String, required: true, maxlength: 40 },
  icon: { type: String, default: "restaurant", maxlength: 30 },
  color: { type: String, default: "#8d6e63", maxlength: 9 },
  layout: { type: String, enum: ["recipe", "instructions"], default: "recipe" },
  order: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
});

categorySchema.index({ book_id: 1, order: 1 });

// Each photo is a XenDriveFile owned by whoever uploaded it (source `xenkitchen`, ref = the item), kept private and
// shown through short-lived signed links. `gcs_path` and `url` belong to a photo from before that, stored in the
// public bucket; the migration moves it and they go away.
const imageSchema = new Schema({
  file_id: { type: Schema.Types.ObjectId, ref: "XenDriveFile" },
  uploaded_by: { type: String },
  gcs_path: { type: String },
  url: { type: String },
});

const ingredientSchema = new Schema({
  name: { type: String, default: "", maxlength: 120 },
  // Lowercased/trimmed name, so suggestions and "contains ingredient" filters ignore case.
  name_key: { type: String, default: "", maxlength: 120 },
  quantity: { type: String, default: "", maxlength: 20 },
  unit: { type: String, default: "", maxlength: 30 },
  note: { type: String, default: "", maxlength: 120 },
  section: { type: String, default: "", maxlength: 60 },
});

const stepSchema = new Schema({
  text: { type: String, default: "", maxlength: 2000 },
  timer_minutes: { type: Number, min: 0, max: 1440, default: null },
});

const methodSchema = new Schema({
  method: {
    type: String,
    enum: ["oven", "microwave", "air_fryer", "stovetop", "grill", "other"],
    default: "oven",
  },
  temp: { type: Number, min: 0, max: 1000, default: null },
  temp_unit: { type: String, enum: ["F", "C"], default: "F" },
  // Microwave power, "High", "Medium" etc.
  power: { type: String, default: "", maxlength: 30 },
  minutes_min: { type: Number, min: 0, max: 1440, default: null },
  minutes_max: { type: Number, min: 0, max: 1440, default: null },
  preheat: { type: Boolean, default: false },
  steps: { type: [String], default: [] },
});

// One item schema for everything. Fields that the category's layout doesn't show are
// kept, so moving an item to another category and back loses nothing.
const itemSchema = new Schema({
  book_id: { type: Schema.Types.ObjectId, ref: "XenKitchenBook", required: true },
  // Who added / last changed it, shown as "added by". The item belongs to the book, not to them.
  created_by: { type: String, default: null },
  updated_by: { type: String, default: null },
  title: { type: String, default: "", maxlength: 120 },
  description: { type: String, default: "", maxlength: 2000 },
  category_id: { type: Schema.Types.ObjectId, ref: "XenKitchenCategory", default: null },
  tags: { type: [String], default: [] },
  // Favorites are per person: each member stars things for themselves.
  favorited_by: { type: [String], default: [] },
  notes: { type: String, default: "", maxlength: 4000 },
  images: { type: [imageSchema], default: [] },

  servings: { type: Number, min: 0, max: 1000, default: null },
  prep_minutes: { type: Number, min: 0, max: 10000, default: null },
  cook_minutes: { type: Number, min: 0, max: 10000, default: null },
  ingredients: { type: [ingredientSchema], default: [] },
  steps: { type: [stepSchema], default: [] },

  brand: { type: String, default: "", maxlength: 80 },
  methods: { type: [methodSchema], default: [] },
  storage_note: { type: String, default: "", maxlength: 500 },

  share: {
    enabled: { type: Boolean, default: false },
    token: { type: String, default: undefined },
  },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

itemSchema.index({ book_id: 1, updated_at: -1 });
itemSchema.index({ book_id: 1, category_id: 1 });
itemSchema.index({ "share.token": 1 }, { unique: true, sparse: true });

itemSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

export type XenKitchenBookAttrs = InferSchemaType<typeof bookSchema>;
export type XenKitchenCategoryAttrs = InferSchemaType<typeof categorySchema>;
export type XenKitchenItemAttrs = InferSchemaType<typeof itemSchema>;

const XenKitchenBook = mongoose.model("XenKitchenBook", bookSchema);
const XenKitchenCategory = mongoose.model("XenKitchenCategory", categorySchema);
const XenKitchenItem = mongoose.model("XenKitchenItem", itemSchema);

export { XenKitchenBook, XenKitchenCategory, XenKitchenItem };

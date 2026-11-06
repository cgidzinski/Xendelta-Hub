var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// A category decides which fields its items show. "recipe" is ingredients + steps;
// "instructions" is the heating directions off a box (oven/microwave/air fryer...).
var categorySchema = new Schema({
  owner_id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 40 },
  icon: { type: String, default: "restaurant", maxlength: 30 },
  color: { type: String, default: "#8d6e63", maxlength: 9 },
  layout: { type: String, enum: ["recipe", "instructions"], default: "recipe" },
  order: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
});

categorySchema.index({ owner_id: 1, order: 1 });

var imageSchema = new Schema({
  gcs_path: { type: String, required: true },
  url: { type: String, required: true },
});

var ingredientSchema = new Schema({
  name: { type: String, default: "", maxlength: 120 },
  // Lowercased/trimmed name, so suggestions and "contains ingredient" filters ignore case.
  name_key: { type: String, default: "", maxlength: 120 },
  quantity: { type: String, default: "", maxlength: 20 },
  unit: { type: String, default: "", maxlength: 30 },
  note: { type: String, default: "", maxlength: 120 },
  section: { type: String, default: "", maxlength: 60 },
});

var stepSchema = new Schema({
  text: { type: String, default: "", maxlength: 2000 },
  timer_minutes: { type: Number, min: 0, max: 1440, default: null },
});

var methodSchema = new Schema({
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
var itemSchema = new Schema({
  owner_id: { type: String, required: true },
  title: { type: String, default: "", maxlength: 120 },
  description: { type: String, default: "", maxlength: 2000 },
  category_id: { type: Schema.Types.ObjectId, ref: "XenKitchenCategory", default: null },
  tags: { type: [String], default: [] },
  favorite: { type: Boolean, default: false },
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

itemSchema.index({ owner_id: 1, updated_at: -1 });
itemSchema.index({ owner_id: 1, category_id: 1 });
itemSchema.index({ owner_id: 1, "ingredients.name_key": 1 });
itemSchema.index({ "share.token": 1 }, { unique: true, sparse: true });

itemSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

const XenKitchenCategory = mongoose.model("XenKitchenCategory", categorySchema);
const XenKitchenItem = mongoose.model("XenKitchenItem", itemSchema);

module.exports = { XenKitchenCategory, XenKitchenItem };

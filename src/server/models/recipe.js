var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// PAINT SCHEMA (embedded in a step)
// The paint list drives the swatches on each step, the recipe's "Paints used" panel and
// search-by-paint. PAINT_TYPES is shared with the client so both ends agree on the enum.
var paintSchema = new mongoose.Schema(
  {
    brand: { type: String, default: "" }, // e.g., "Citadel"
    name: { type: String, default: "" }, // e.g., "Nuln Oil"
    hex: { type: String, default: "" }, // swatch colour, "" when unset
    type: {
      type: String,
      enum: ["base", "layer", "wash", "contrast", "metallic", "technical", ""],
      default: "",
    },
  },
  { _id: false }
);

// STEP SCHEMA (embedded in Recipe)
var stepSchema = new mongoose.Schema(
  {
    index: { type: Number, required: true },
    stepName: { type: String }, // Name of the step
    method: { type: String }, // Method (e.g., "Dry brush", "Wash", etc.)
    images: [{ type: String }], // Array of public GCS URLs
    text: { type: String },
    paints: [paintSchema],
  },
  { _id: false }
);

// RECIPE SCHEMA
var recipeSchema = new mongoose.Schema({
  showcase: [{ type: String }], // Array of public GCS URLs
  title: { type: String, required: true },
  description: { type: String },
  dateCreated: { type: Date, default: Date.now },
  dateUpdated: { type: Date, default: Date.now },
  steps: [stepSchema], // Array of RecipeStep objects only
  isPublic: { type: Boolean, default: false },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
  originalRecipeId: { type: Schema.Types.ObjectId, ref: "Recipe", default: null },
});

// Add indexes
recipeSchema.index({ author: 1 });
recipeSchema.index({ owner: 1 });
recipeSchema.index({ isPublic: 1 });
recipeSchema.index({ dateUpdated: -1 });
recipeSchema.index({ "steps.paints.name": 1 });

// Update dateUpdated before saving
recipeSchema.pre("save", function (next) {
  this.dateUpdated = Date.now();
  next();
});

var Recipe = mongoose.model("Recipe", recipeSchema);

module.exports = { Recipe };

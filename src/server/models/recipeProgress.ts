import mongoose, { Schema, type InferSchemaType } from "mongoose";

// Which steps of a recipe a given user has ticked off.
//
// Kept out of the Recipe document on purpose: progress is per-viewer, and several people
// can be painting from the same public recipe at once. Steps are referenced by index, so
// reordering or deleting steps in the editor can shift what a saved tick refers to - the
// reader clamps to the current step count rather than trusting stale indexes.
const recipeProgressSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true },
  recipe: { type: Schema.Types.ObjectId, ref: "Recipe", required: true },
  completedSteps: [{ type: Number }],
  updatedAt: { type: Date, default: Date.now },
});

// One row per user per recipe; the upsert in the route relies on this.
recipeProgressSchema.index({ user: 1, recipe: 1 }, { unique: true });

export type RecipeProgressAttrs = InferSchemaType<typeof recipeProgressSchema>;

const RecipeProgress = mongoose.model("RecipeProgress", recipeProgressSchema);

export { RecipeProgress };

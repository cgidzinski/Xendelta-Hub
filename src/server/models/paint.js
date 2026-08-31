var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// A paint the user owns.
//
// Deliberately separate from the paints embedded in a recipe step. A step stores a snapshot
// (brand/name/hex/type) so a public or cloned recipe still renders its swatches for someone
// who does not own those paints; this collection answers "what do I have on the shelf?".
// The two are matched by brand+name, not by reference.
var paintSchema = new mongoose.Schema({
  owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  brand: { type: String, default: "" },
  name: { type: String, required: true },
  hex: { type: String, default: "" }, // swatch colour, "" when unset
  type: {
    type: String,
    enum: ["base", "layer", "wash", "contrast", "metallic", "technical", ""],
    default: "",
  },
  quantity: { type: Number, default: 1, min: 0 },
  // Normalised brand+name, produced by normalizePaintInput (shared/recipaint/paints.ts).
  // Stored rather than derived so the unique index below can be case-insensitive without a
  // collation, and so it stays identical to the key the palette aggregation uses.
  key: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// One entry per paint per user. The POST route turns a violation into a 409.
paintSchema.index({ owner: 1, key: 1 }, { unique: true });
paintSchema.index({ owner: 1, brand: 1, name: 1 });

paintSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

var Paint = mongoose.model("Paint", paintSchema);

module.exports = { Paint };

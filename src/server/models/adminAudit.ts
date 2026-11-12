import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { AUDIT_CATEGORIES } from "@shared/admin";

// The admin audit log: one row per change an admin makes (who, what, to whom, when). Append-only: nothing in the app
// updates or deletes these rows, and there is no route that could. See utils/adminAudit.ts to write one.
const adminAuditSchema = new Schema({
  admin_id: { type: Schema.Types.ObjectId, required: true },
  // A snapshot, so the log still reads correctly after the admin is renamed or removed.
  admin_name: { type: String, required: true },
  action: { type: String, required: true },
  category: { type: String, enum: AUDIT_CATEGORIES, required: true },
  target: {
    type: { type: String, required: true },
    id: { type: String },
    label: { type: String, required: true },
  },
  detail: { type: String, required: true },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
});

adminAuditSchema.index({ createdAt: -1 });
adminAuditSchema.index({ category: 1, createdAt: -1 });
adminAuditSchema.index({ "target.id": 1, createdAt: -1 });

export type AdminAuditAttrs = InferSchemaType<typeof adminAuditSchema>;
export const AdminAudit = mongoose.model("AdminAudit", adminAuditSchema);

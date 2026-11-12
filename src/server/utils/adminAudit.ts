import type { Request } from "express";
import { AdminAudit } from "../models/adminAudit";
import type { AuditAction, AuditEntry } from "@shared/admin";
import { AUDIT_CATEGORY_OF } from "@shared/admin";
import type { AuthenticatedRequest } from "../types";

export interface AuditInput {
  action: AuditAction;
  target: AuditEntry["target"];
  detail: string;
  meta?: Record<string, unknown>;
}

/**
 * Write one audit row for the admin making this request. Call it after the change has been made, from every admin route
 * that writes. A failure to log is reported but never undoes or blocks the change that was already made.
 */
export async function recordAudit(req: Request, input: AuditInput): Promise<void> {
  const admin = (req as AuthenticatedRequest).user;
  if (!admin) return;
  try {
    await AdminAudit.create({
      admin_id: admin._id,
      admin_name: admin.username || "admin",
      action: input.action,
      category: AUDIT_CATEGORY_OF[input.action],
      target: input.target,
      detail: input.detail,
      meta: input.meta,
    });
  } catch (error) {
    console.error("Failed to write the admin audit log:", error);
  }
}

/** A stored row as the wire shape. */
export function serializeAudit(row: any): AuditEntry {
  return {
    _id: String(row._id),
    createdAt: row.createdAt.toISOString(),
    admin: { _id: String(row.admin_id), username: row.admin_name },
    action: row.action,
    category: row.category,
    target: { type: row.target.type, id: row.target.id, label: row.target.label },
    detail: row.detail,
    meta: row.meta ?? undefined,
  };
}

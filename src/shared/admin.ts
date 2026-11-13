// Admin wire types and constants, shared by the server (routes/admin/*) and the client (routes/Admin/*).

/** What an audit entry is about, for the log's filter chips. */
export const AUDIT_CATEGORIES = ["Roles", "Storage", "Gems", "Items", "Notify", "Danger", "System"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export type AuditAction =
  | "role_change"
  | "storage_change"
  | "gem_adjust"
  | "item_give"
  | "item_remove"
  | "avatar_reset"
  | "user_delete"
  | "notify_send"
  | "chats_delete_all"
  | "task_toggle"
  | "feedback_update";

/** Which filter chip each action sits under. */
export const AUDIT_CATEGORY_OF: Record<AuditAction, AuditCategory> = {
  role_change: "Roles",
  storage_change: "Storage",
  gem_adjust: "Gems",
  item_give: "Items",
  item_remove: "Items",
  avatar_reset: "Items",
  user_delete: "Danger",
  notify_send: "Notify",
  chats_delete_all: "Danger",
  task_toggle: "System",
  feedback_update: "System",
};

export interface AuditEntry {
  _id: string;
  createdAt: string;
  admin: { _id: string; username: string };
  action: AuditAction;
  category: AuditCategory;
  target: { type: "user" | "everyone" | "chats" | "task" | "group" | "feedback"; id?: string; label: string };
  /** One readable line: what changed. */
  detail: string;
  /** Structured extras (a broadcast's title and channels, a role change's before and after). */
  meta?: Record<string, unknown>;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------- people ----------

export type UserFilter = "all" | "admins" | "near_quota" | "buyers" | "new";
export type UserSort = "newest" | "name" | "storage";

export interface AdminUserRow {
  _id: string;
  username: string;
  email: string;
  roles: string[];
  avatar: string;
  joinedAt: string;
  gems: number;
  storage: { used: number; allowed: number; files: number };
}

export interface AdminUserDetail extends AdminUserRow {
  inventory: Array<{ itemKey: string; name: string; used: boolean; purchasedAt: string }>;
  /** Extra bytes granted on top of the free tier. */
  extraSpace: number;
  /** Bytes in this person's drive that apps stored for them (chat attachments). */
  appBytes: number;
  providers: string[];
  purchases: { count: number; gems: number };
  badge?: string;
}

// ---------- overview, storage, money, system ----------

export type AttentionSeverity = "error" | "warning";
export interface AttentionItem {
  key: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  /** Where in the admin to go (a path under /admin). */
  href: string;
  action: string;
}

export interface StorageByApp {
  /** "drive" for My Drive, otherwise the app key ("chat"). */
  key: string;
  label: string;
  bytes: number;
  files: number;
}

export interface AdminOverview {
  people: { total: number; new7: number; new30: number; signupsByDay: Array<{ day: string; count: number }> };
  storage: { used: number; nearQuota: number; byApp: StorageByApp[] };
  money: { gems30: number; cents30: number; purchases30: number; pending: number };
  tasks: { enabled: number; failing: number };
  attention: AttentionItem[];
  recent: AuditEntry[];
}

export interface AdminStorageReport {
  used: number;
  extraGranted: number;
  nearQuota: number;
  byApp: StorageByApp[];
  top: Array<{
    _id: string;
    username: string;
    avatar: string;
    used: number;
    allowed: number;
    files: number;
    appBytes: number;
  }>;
  housekeeping: { abandonedUploads: number; orphanedFiles: number };
}

export type PurchaseStatus = "pending" | "completed" | "failed";
export interface AdminPurchase {
  _id: string;
  createdAt: string;
  user: { _id: string; username: string } | null;
  itemId: string;
  gems: number;
  amountCents: number;
  currency: string;
  provider: string;
  status: PurchaseStatus;
}
export interface AdminMoneyReport {
  summary: {
    cents30: number;
    gems30: number;
    purchases30: number;
    pending: number;
    failed30: number;
    oldestPendingMinutes: number | null;
  };
  purchases: Paged<AdminPurchase>;
  catalogue: Array<{ id: string; name: string; kind: string; price: string }>;
}

export type NotifyAudience =
  { type: "everyone" } | { type: "role"; role: string } | { type: "users"; userIds: string[] };
export type NotifyChannel = "inapp" | "socket" | "push" | "email";

export interface AdminSystemReport {
  health: {
    env: string;
    uptimeSeconds: number;
    node: string;
    database: { connected: boolean; name: string; sizeBytes: number; collections: number };
    push: { configured: boolean; devices: number };
  };
  migrations: Array<{ name: string; state: string; appliedAt: string | null }>;
  tasks: Array<{
    _id: string;
    type: string;
    label: string;
    frequency: string | null;
    enabled: boolean;
    nextRun: string | null;
    lastRun: string | null;
    lastError: string | null;
  }>;
  documents: Array<{ label: string; collection: string; bytes: number; percentOfLimit: number }>;
}

import type { UserFilter, UserSort } from "@shared/admin";

export interface UserListParams {
  q: string;
  filter: UserFilter;
  sort: UserSort;
  page: number;
}

export const adminKeys = {
  all: ["admin"] as const,
  role: () => [...adminKeys.all, "role"] as const,
  overview: () => [...adminKeys.all, "overview"] as const,
  users: () => [...adminKeys.all, "users"] as const,
  userList: (params: UserListParams) => [...adminKeys.users(), "list", params] as const,
  user: (userId: string) => [...adminKeys.users(), "one", userId] as const,
  storage: (by: string) => [...adminKeys.all, "storage", by] as const,
  money: (status: string, page: number) => [...adminKeys.all, "money", status, page] as const,
  reach: (type: string, role: string) => [...adminKeys.all, "reach", type, role] as const,
  broadcasts: () => [...adminKeys.all, "broadcasts"] as const,
  system: () => [...adminKeys.all, "system"] as const,
  backups: () => [...adminKeys.all, "backups"] as const,
  backupJob: () => [...adminKeys.all, "backup-job"] as const,
  feedback: (status: string, page: number) => [...adminKeys.all, "feedback", status, page] as const,
  feedbackAll: () => [...adminKeys.all, "feedback"] as const,
  audit: (params: object) => [...adminKeys.all, "audit", params] as const,
};

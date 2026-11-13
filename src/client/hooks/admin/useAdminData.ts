import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type {
  AdminMoneyReport,
  AdminOverview,
  AdminStorageReport,
  AdminSystemReport,
  AdminUserDetail,
  AdminUserRow,
  AuditAction,
  AuditCategory,
  AuditEntry,
  NotifyAudience,
  NotifyChannel,
  Paged,
} from "@shared/admin";
import type { AdminFeedback, FeedbackStatus } from "@shared/feedback";
import { adminKeys, type UserListParams } from "./keys";

// One hook per admin page, plus the changes an admin can make. Reads refresh after a change, so every screen stays true.

/** Checks the signed-in person still has the admin role (the layout asks every 30 seconds). */
export const verifyAdminRole = async (): Promise<string[]> =>
  (await api.get<{ roles: string[] }>("/api/auth/roles/verify")).roles;

export const useAdminOverview = () =>
  useQuery({
    queryKey: adminKeys.overview(),
    queryFn: async () => (await api.get<{ overview: AdminOverview }>("/api/admin/overview")).overview,
    refetchInterval: 60_000,
  });

export const useAdminUserList = (params: UserListParams) =>
  useQuery({
    queryKey: adminKeys.userList(params),
    queryFn: () =>
      api.get<Paged<AdminUserRow>>("/api/admin/users", {
        params: { q: params.q || undefined, filter: params.filter, sort: params.sort, page: params.page, pageSize: 25 },
      }),
    placeholderData: keepPreviousData,
  });

export const useAdminUser = (userId: string | undefined) =>
  useQuery({
    queryKey: adminKeys.user(userId ?? ""),
    queryFn: async () => (await api.get<{ user: AdminUserDetail }>(`/api/admin/users/${userId}`)).user,
    enabled: !!userId,
    retry: false,
  });

export const useAdminStorage = (by: "size" | "percent") =>
  useQuery({
    queryKey: adminKeys.storage(by),
    queryFn: async () =>
      (await api.get<{ report: AdminStorageReport }>("/api/admin/storage", { params: { by } })).report,
  });

export const useAdminMoney = (status: string, page: number) =>
  useQuery({
    queryKey: adminKeys.money(status, page),
    queryFn: async () =>
      (
        await api.get<{ report: AdminMoneyReport }>("/api/admin/purchases", {
          params: { status: status || undefined, page },
        })
      ).report,
    placeholderData: keepPreviousData,
  });

export const useAdminSystem = () =>
  useQuery({
    queryKey: adminKeys.system(),
    queryFn: async () => (await api.get<{ report: AdminSystemReport }>("/api/admin/system")).report,
    refetchInterval: 30_000,
  });

export interface AuditParams {
  category: AuditCategory | "";
  q: string;
  days: number;
  page: number;
  targetId?: string;
}

export const useAdminAudit = (params: AuditParams, options: { enabled?: boolean; pageSize?: number } = {}) =>
  useQuery({
    queryKey: adminKeys.audit({ ...params, pageSize: options.pageSize }),
    queryFn: () =>
      api.get<Paged<AuditEntry>>("/api/admin/audit", {
        params: {
          category: params.category || undefined,
          q: params.q || undefined,
          days: params.days || undefined,
          targetId: params.targetId,
          page: params.page,
          pageSize: options.pageSize,
        },
      }),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });

export const useAdminBroadcasts = () =>
  useQuery({
    queryKey: adminKeys.broadcasts(),
    queryFn: async () => (await api.get<{ items: AuditEntry[] }>("/api/admin/broadcasts")).items,
  });

export const useAudienceReach = (type: "everyone" | "role", role: string) =>
  useQuery({
    queryKey: adminKeys.reach(type, role),
    queryFn: () =>
      api.get<{ people: number; pushDevices: number }>("/api/admin/notify/reach", {
        params: { type, role: role || undefined },
      }),
  });

/** Everything an admin can change. Each refreshes whatever depends on it (the audit log always does). */
export const useAdminActions = () => {
  const queryClient = useQueryClient();
  const refresh = (userId?: string) => {
    queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    if (userId) queryClient.invalidateQueries({ queryKey: adminKeys.user(userId) });
    for (const key of [adminKeys.overview(), [...adminKeys.all, "audit"], adminKeys.broadcasts(), adminKeys.system()]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    queryClient.invalidateQueries({ queryKey: [...adminKeys.all, "storage"] });
  };

  const updateUser = useMutation({
    mutationFn: (v: { userId: string; roles?: string[]; xendriveQuota?: number }) =>
      api.put(`/api/admin/users/${v.userId}`, { roles: v.roles, xendriveQuota: v.xendriveQuota }),
    onSuccess: (_d, v) => refresh(v.userId),
  });
  const resetAvatar = useMutation({
    mutationFn: (userId: string) => api.post(`/api/admin/users/${userId}/avatar/reset`),
    onSuccess: (_d, userId) => refresh(userId),
  });
  const deleteUser = useMutation({
    mutationFn: (v: { userId: string; confirm: string }) =>
      api.delete(`/api/admin/users/${v.userId}`, { data: { confirm: v.confirm } }),
    onSuccess: () => refresh(),
  });
  const adjustGems = useMutation({
    mutationFn: (v: { userId: string; amount: number; reason: string }) =>
      api.post<{ gems: number }>(`/api/admin/users/${v.userId}/gems`, { amount: v.amount, reason: v.reason }),
    onSuccess: (_d, v) => refresh(v.userId),
  });
  const giveItem = useMutation({
    mutationFn: (v: { userId: string; itemKey: string }) =>
      api.post(`/api/admin/users/${v.userId}/give-item`, { itemKey: v.itemKey }),
    onSuccess: (_d, v) => refresh(v.userId),
  });
  const removeItem = useMutation({
    mutationFn: (v: { userId: string; itemKey: string }) =>
      api.delete(`/api/admin/users/${v.userId}/inventory/${v.itemKey}`),
    onSuccess: (_d, v) => refresh(v.userId),
  });
  const notify = useMutation({
    mutationFn: (v: {
      audience: NotifyAudience;
      title: string;
      message: string;
      link?: string;
      channels: NotifyChannel[];
    }) =>
      api.post<{ people: number; inapp: number; push: number; email: number; errors: number }>("/api/admin/notify", v),
    onSuccess: () => refresh(),
  });
  const toggleTask = useMutation({
    mutationFn: (v: { taskId: string; enabled: boolean }) =>
      api.put(`/api/admin/tasks/${v.taskId}`, { enabled: v.enabled }),
    onSuccess: () => refresh(),
  });
  const deleteAllChats = useMutation({
    mutationFn: () =>
      api.delete<{ messagesDeleted: number; conversationsDeleted: number }>("/api/admin/chats", {
        data: { confirm: "DELETE" },
      }),
    onSuccess: () => refresh(),
  });
  const triggerServerError = useMutation({
    mutationFn: () => api.post("/api/admin/debug/trigger-error"),
  });

  return {
    updateUser,
    resetAvatar,
    deleteUser,
    adjustGems,
    giveItem,
    removeItem,
    notify,
    toggleTask,
    deleteAllChats,
    triggerServerError,
  };
};

export type { AuditAction };

// ---------- feedback ----------

export interface AdminFeedbackPage extends Paged<AdminFeedback> {
  /** How many are still "new", whatever the filter. */
  newCount: number;
}

export const useAdminFeedback = (status: FeedbackStatus | "", page: number) =>
  useQuery({
    queryKey: adminKeys.feedback(status, page),
    queryFn: () => api.get<AdminFeedbackPage>("/api/admin/feedback", { params: { status: status || undefined, page } }),
    placeholderData: keepPreviousData,
  });

export const useUpdateFeedback = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: FeedbackStatus }) =>
      api.put(`/api/admin/feedback/${v.id}`, { status: v.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.feedbackAll() }),
  });
};

/** Resolve a report: send the person a message, with gems if they should be thanked (once per feedback). */
export const useResolveFeedback = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; gems: number; message: string }) =>
      api.post(`/api/admin/feedback/${v.id}/resolve`, { gems: v.gems, message: v.message }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.feedbackAll() }),
  });
};

/** Delete archived feedback for good. */
export const useDeleteFeedback = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/feedback/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.feedbackAll() }),
  });
};

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import type { Cosmetics } from "@shared/cosmetics";

export type IntervalUnit = "days" | "weeks" | "months" | "years";
export type DueStatus = "ok" | "due_soon" | "overdue";

export interface RoutineChannels {
  inapp: boolean;
  push: boolean;
  email: boolean;
}

export interface RoutineMember {
  user_id: string;
  role: "owner" | "editor";
  username: string;
  avatar: string | null;
  cosmetics?: Cosmetics;
}

export interface RoutineHistoryEntry {
  action: "done" | "postponed";
  at: string;
  by_user?: string;
  by_username?: string | null;
  note?: string;
  due_at?: string;
  /** Set when a later occurrence was completed ahead of its time. */
  occurrence_at?: string;
}

export interface Routine {
  _id: string;
  name: string;
  category: string;
  notes: string;
  interval: { every: number; unit: IntervalUnit };
  last_done_at: string | null;
  due_at: string;
  enabled: boolean;
  remind_again_days: number;
  status: DueStatus;
  /** Positions (2 = the occurrence after due_at) already completed ahead of time; hidden from the projection. */
  done_ahead_indices?: number[];
  is_owner: boolean;
  my_notifications: { muted: boolean; lead_days: number; activity: boolean } | null;
  members: RoutineMember[];
  history: RoutineHistoryEntry[];
}

export interface RoutineInput {
  name: string;
  category?: string;
  notes?: string;
  interval: { every: number; unit: IntervalUnit };
  due_at?: string;
  last_done_at?: string;
  remind_again_days?: number;
}

export const routineKeys = {
  all: ["xenroutine"] as const,
  list: () => [...routineKeys.all, "routines"] as const,
};

const base = "/api/xenroutine/routines";

export function useRoutines() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: routineKeys.list(),
    queryFn: async () => (await apiClient.get<ApiResponse<{ routines: Routine[] }>>(base)).data.data!.routines,
  });
  return { routines: data ?? [], isLoading, isError, error, refetch };
}

// Every mutation refetches the list: the server derives status, history and member names,
// so patching the cache locally would just re-implement that.
function useRoutineMutation<TVars>(fn: (v: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: routineKeys.all }),
  });
}

export const useCreateRoutine = () => useRoutineMutation((input: RoutineInput) => apiClient.post(base, input));

export const useUpdateRoutine = () =>
  useRoutineMutation((v: { id: string; patch: Partial<RoutineInput> & { enabled?: boolean } }) =>
    apiClient.put(`${base}/${v.id}`, v.patch),
  );

export const useDeleteRoutine = () => useRoutineMutation((id: string) => apiClient.delete(`${base}/${id}`));

// Deliberately does NOT refetch on success: the Overview card plays an exit animation
// first and then calls useInvalidateRoutines, otherwise the card would vanish mid-slide.
export const useCompleteRoutine = () =>
  useMutation({
    // "always": with no connection this must fail at once (so the caller can queue it), not wait for one.
    networkMode: "always",
    mutationFn: (v: { id: string; note?: string; done_at?: string; occurrence?: number; expected_due_at?: string }) =>
      apiClient.post(`${base}/${v.id}/complete`, {
        note: v.note,
        done_at: v.done_at,
        occurrence: v.occurrence,
        expected_due_at: v.expected_due_at,
      }),
  });

export function useInvalidateRoutines() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: routineKeys.all });
}

export const usePostponeRoutine = () =>
  useRoutineMutation((v: { id: string; days?: number; until?: string; note?: string }) =>
    apiClient.post(`${base}/${v.id}/postpone`, { days: v.days, until: v.until, note: v.note }),
  );

export const useSetRoutineNotifications = () =>
  useRoutineMutation(
    (v: { id: string; muted?: boolean; remind_again_days?: number; lead_days?: number; activity?: boolean }) =>
      apiClient.put(`${base}/${v.id}/notifications`, {
        muted: v.muted,
        remind_again_days: v.remind_again_days,
        lead_days: v.lead_days,
        activity: v.activity,
      }),
  );

export const useShareRoutine = () =>
  useRoutineMutation((v: { id: string; userIds: string[] }) =>
    apiClient.post(`${base}/${v.id}/share`, { userIds: v.userIds }),
  );

export const useUnshareRoutine = () =>
  useRoutineMutation((v: { id: string; userId: string }) => apiClient.delete(`${base}/${v.id}/share/${v.userId}`));

export function intervalLabel(i: Routine["interval"]): string {
  const unit = i.every === 1 ? i.unit.replace(/s$/, "") : i.unit;
  return i.every === 1 ? `Every ${unit}` : `Every ${i.every} ${unit}`;
}

// ---- Reminder settings (per user) -----------------------------------------------------

export interface RoutineSettings {
  remind_hour: number;
  /** How this person is reached, for every routine. */
  channels: RoutineChannels;
  /** What the browser last reported; only used when the Profile timezone is empty. */
  browser_timezone: string | null;
  profile_timezone: string | null;
  /** The zone reminders are actually scheduled in. */
  timezone: string;
}

export const routineSettingsKey = [...routineKeys.all, "settings"] as const;

export function useRoutineSettings() {
  const { data, isLoading } = useQuery({
    queryKey: routineSettingsKey,
    queryFn: async () =>
      (await apiClient.get<ApiResponse<{ settings: RoutineSettings }>>("/api/xenroutine/settings")).data.data!.settings,
  });
  return { settings: data, isLoading };
}

export function useSaveRoutineSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<RoutineSettings, "remind_hour" | "channels" | "browser_timezone">>) =>
      (await apiClient.put<ApiResponse<{ settings: RoutineSettings }>>("/api/xenroutine/settings", patch)).data.data!
        .settings,
    onSuccess: (settings) => qc.setQueryData(routineSettingsKey, settings),
  });
}

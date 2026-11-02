import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

export type IntervalUnit = "days" | "weeks" | "months" | "years";
export type DueStatus = "ok" | "due_soon" | "overdue";

export interface RoutineChannels { inapp: boolean; push: boolean; email: boolean }

export interface RoutineMember {
    user_id: string;
    role: "owner" | "sharer";
    username: string;
    avatar: string | null;
}

export interface RoutineHistoryEntry {
    action: "done" | "postponed";
    at: string;
    by_user?: string;
    by_username?: string | null;
    note?: string;
    due_at?: string;
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
    is_owner: boolean;
    my_notifications: { channels: RoutineChannels; muted: boolean } | null;
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
        queryFn: async () =>
            (await apiClient.get<ApiResponse<{ routines: Routine[] }>>(base)).data.data!.routines,
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

export const useCreateRoutine = () =>
    useRoutineMutation((input: RoutineInput) => apiClient.post(base, input));

export const useUpdateRoutine = () =>
    useRoutineMutation((v: { id: string; patch: Partial<RoutineInput> & { enabled?: boolean } }) =>
        apiClient.put(`${base}/${v.id}`, v.patch));

export const useDeleteRoutine = () =>
    useRoutineMutation((id: string) => apiClient.delete(`${base}/${id}`));

export const useCompleteRoutine = () =>
    useRoutineMutation((v: { id: string; note?: string; done_at?: string }) =>
        apiClient.post(`${base}/${v.id}/complete`, { note: v.note, done_at: v.done_at }));

export const usePostponeRoutine = () =>
    useRoutineMutation((v: { id: string; days?: number; until?: string; note?: string }) =>
        apiClient.post(`${base}/${v.id}/postpone`, { days: v.days, until: v.until, note: v.note }));

export const useSetRoutineNotifications = () =>
    useRoutineMutation((v: { id: string; channels?: RoutineChannels; muted?: boolean }) =>
        apiClient.put(`${base}/${v.id}/notifications`, { channels: v.channels, muted: v.muted }));

export const useShareRoutine = () =>
    useRoutineMutation((v: { id: string; userIds: string[] }) =>
        apiClient.post(`${base}/${v.id}/share`, { userIds: v.userIds }));

export const useUnshareRoutine = () =>
    useRoutineMutation((v: { id: string; userId: string }) =>
        apiClient.delete(`${base}/${v.id}/share/${v.userId}`));

export function intervalLabel(i: Routine["interval"]): string {
    const unit = i.every === 1 ? i.unit.replace(/s$/, "") : i.unit;
    return i.every === 1 ? `Every ${unit}` : `Every ${i.every} ${unit}`;
}

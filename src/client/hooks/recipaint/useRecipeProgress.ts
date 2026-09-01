import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";
import { recipaintKeys } from "./useRecipaint";

interface ProgressResponse {
  completedSteps: number[];
}

const fetchProgress = async (id: string): Promise<number[]> => {
  const response = await apiClient.get<ApiResponse<ProgressResponse>>(`/api/recipaint/${id}/progress`);
  return response.data.data!.completedSteps;
};

const saveProgress = async ({ id, completedSteps }: { id: string; completedSteps: number[] }): Promise<number[]> => {
  const response = await apiClient.put<ApiResponse<ProgressResponse>>(`/api/recipaint/${id}/progress`, {
    completedSteps,
  });
  return response.data.data!.completedSteps;
};

export const recipeProgressKey = (id: string) => [...recipaintKeys.all, "progress", id] as const;

/**
 * Which steps of a recipe the viewer has ticked off.
 *
 * Signed in, this is stored server-side, so putting a mini down for a week and coming back
 * on another device keeps your place. Signed out - a stranger on a shared link - it stays in
 * component state for the session, which is the most that can honestly be offered.
 *
 * Toggles apply locally first and persist in the background: ticking a step mid-paint must
 * never wait on a round trip.
 */
export function useRecipeProgress(recipeId: string | undefined) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const canPersist = Boolean(recipeId) && isAuthenticated;

  const [localSteps, setLocalSteps] = useState<Set<number>>(new Set());
  // Guards against the fetch landing after the user has already ticked something.
  const hasLocalEdit = useRef(false);

  const { data: savedSteps } = useQuery({
    queryKey: recipeProgressKey(recipeId || ""),
    queryFn: () => fetchProgress(recipeId!),
    enabled: canPersist,
    staleTime: 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!savedSteps || hasLocalEdit.current) return;
    setLocalSteps(new Set(savedSteps));
  }, [savedSteps]);

  // A recipe change resets everything - otherwise step 3 of one recipe shows ticked on another.
  useEffect(() => {
    hasLocalEdit.current = false;
    setLocalSteps(new Set());
  }, [recipeId]);

  const { mutate: persist } = useMutation({
    mutationFn: saveProgress,
    onSuccess: (completedSteps) => {
      queryClient.setQueryData(recipeProgressKey(recipeId || ""), completedSteps);
    },
  });

  const commit = useCallback(
    (next: Set<number>) => {
      hasLocalEdit.current = true;
      setLocalSteps(next);
      if (canPersist) {
        persist({ id: recipeId!, completedSteps: [...next].sort((a, b) => a - b) });
      }
    },
    [canPersist, persist, recipeId],
  );

  const toggleStep = useCallback(
    (index: number) => {
      const next = new Set(localSteps);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      commit(next);
    },
    [localSteps, commit],
  );

  const resetProgress = useCallback(() => commit(new Set()), [commit]);

  const setCompleted = useCallback((indexes: number[]) => commit(new Set(indexes)), [commit]);

  return { completedSteps: localSteps, toggleStep, resetProgress, setCompleted, isPersisted: canPersist };
}

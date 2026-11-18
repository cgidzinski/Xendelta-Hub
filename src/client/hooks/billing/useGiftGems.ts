import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import { userProfileKeys } from "../user/useUserProfile";
import { billingKeys } from "./keys";

/** Give gems to another person. Each call carries its own request id, so a retry can't give twice. */
export function useGiftGems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { toUserId: string; gems: number; note?: string }) =>
      api.post<{ balance: number }>("/api/billing/gift", { ...input, requestId: crypto.randomUUID() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.me() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.all });
    },
  });
}

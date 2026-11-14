import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BillingOverview, CommunityFund } from "@shared/billing";
import { api } from "../../config/api";
import { userProfileKeys } from "../user/useUserProfile";
import { billingKeys } from "./keys";

/** Your own bill: this month so far, the free allowance, your gems and past statements. */
export function useMyBilling() {
  return useQuery({
    queryKey: billingKeys.me(),
    queryFn: () => api.get<BillingOverview>("/api/billing/me"),
  });
}

/** A community's bill, for its members. */
export function useCommunityBilling(communityId: string | undefined) {
  return useQuery({
    queryKey: billingKeys.community(communityId ?? ""),
    queryFn: () => api.get<BillingOverview>(`/api/communities/${communityId}/billing`),
    enabled: !!communityId,
  });
}

/** A community's fund and its latest donations and bill payments. */
export function useCommunityFund(communityId: string | undefined) {
  return useQuery({
    queryKey: billingKeys.fund(communityId ?? ""),
    queryFn: () => api.get<CommunityFund>(`/api/communities/${communityId}/fund`),
    enabled: !!communityId,
  });
}

/** Donate gems to a community's fund. Each donation carries its own request id, so a retry can't give twice. */
export function useDonate(communityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (gems: number) =>
      api.post<{ fund: number; balance: number }>(`/api/communities/${communityId}/fund/donate`, {
        gems,
        requestId: crypto.randomUUID(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.community(communityId) });
      queryClient.invalidateQueries({ queryKey: billingKeys.fund(communityId) });
      queryClient.invalidateQueries({ queryKey: billingKeys.me() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.all });
    },
  });
}

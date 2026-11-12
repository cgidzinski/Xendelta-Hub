import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import type { GemPack } from "@shared/monetization";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient, api } from "../../config/api";
import type { ApiResponse } from "../../types/api";
import { userProfileKeys } from "./useUserProfile";
import { inventoryKeys } from "./useInventory";

export interface ShopItem {
  id: string;
  itemKey: string;
  price: number;
  category: string;
  addToInventory?: boolean;
  item: {
    key: string;
    name: string;
    description: string;
    image: string;
    redeemable: boolean;
  };
}

export interface GemPacksInfo {
  packs: GemPack[];
  /** False when buying gems is switched off, or the test provider is on a production server and you are not an admin. */
  available: boolean;
  /** True while payments go to the dummy provider: no real money moves. */
  testMode: boolean;
}

/** What checkout answers: the gems were added at once, or the person must pay at `url` first. */
export type CheckoutResult = { result: "completed"; gems: number } | { result: "redirect"; url: string };

export const gemsKeys = {
  all: ["gems"] as const,
  shop: () => [...gemsKeys.all, "shop"] as const,
  packs: () => [...gemsKeys.all, "packs"] as const,
};

const retryUnlessUnauthorized = (failureCount: number, error: Error) =>
  !error.message.includes("Unauthorized") && failureCount < 3;

export const useGemShop = () => {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: gemsKeys.shop(),
    queryFn: async () => (await api.get<{ items: ShopItem[] }>("/api/gems/shop")).items,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessUnauthorized,
  });
  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

/** Buy a shop item with gems. Resolves true when it went through. */
export const useBuyShopItem = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const mutation = useMutation({
    mutationFn: async (item: ShopItem) =>
      (await apiClient.post<ApiResponse<unknown>>("/api/gems/shop/buy", { itemId: item.id })).data,
    onSuccess: (data) => {
      if (data.status) {
        queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        enqueueSnackbar(data.message || "Item purchased", { variant: "success" });
      } else {
        enqueueSnackbar(data.message || "Failed to purchase item", { variant: "error" });
      }
    },
  });
  return {
    buy: async (item: ShopItem) => (await mutation.mutateAsync(item)).status,
    isBuying: mutation.isPending,
  };
};

export const useGemPacks = () => {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: gemsKeys.packs(),
    queryFn: () => api.get<GemPacksInfo>("/api/gems/packs"),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessUnauthorized,
  });
  return { info: query.data, isLoading: query.isLoading, isError: query.isError };
};

/**
 * Buy a pack of gems. Handles both kinds of provider: the dummy completes at once, while a real one
 * (Stripe) answers with a URL to send the person to, so swapping providers needs no change here.
 */
export const useGemCheckout = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const mutation = useMutation({
    mutationFn: (packId: string) => api.post<CheckoutResult>("/api/gems/checkout", { packId }),
    onSuccess: (data) => {
      if (data.result === "redirect") {
        window.location.assign(data.url);
        return;
      }
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
      enqueueSnackbar(`${data.gems.toLocaleString()} gems added`, { variant: "success" });
    },
    onError: (error: Error) => {
      enqueueSnackbar(error.message || "The purchase could not be completed", { variant: "error" });
    },
  });
  return {
    checkout: async (packId: string) => {
      try {
        return await mutation.mutateAsync(packId);
      } catch {
        return null; // reported by onError
      }
    },
    isPending: mutation.isPending,
  };
};

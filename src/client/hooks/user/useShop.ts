import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient, api } from "../../config/api";
import type { ApiResponse } from "../../types/api";
import { userProfileKeys } from "./useUserProfile";
import { inventoryKeys } from "./useInventory";

/**
 * Something for sale. Exactly one price is set: `price` in gems, or `priceCents` (with `currency`) for real money,
 * which is how the gem packs are sold. Gem packs are ordinary items in the "Gems" category.
 */
export interface ShopItem {
  id: string;
  itemKey: string;
  category: string;
  price?: number;
  priceCents?: number;
  currency?: string;
  /** Gems added to the balance on purchase (gem packs). */
  grantsGems?: number;
  badge?: string;
  addToInventory?: boolean;
  item: {
    key: string;
    name: string;
    description: string;
    image: string;
    redeemable: boolean;
  };
}

export interface ShopPayments {
  /** False when paying with money is switched off, or the test provider is on a production server and you are not an admin. */
  available: boolean;
  /** True while payments go to the dummy provider: no real money moves. */
  testMode: boolean;
}

interface ShopResponse {
  items: ShopItem[];
  payments: ShopPayments;
}

/** What buying answers: it went through at once, or the person must pay at `url` first (a real provider). */
type BuyResult = { result: "completed"; gems?: number } | { result: "redirect"; url: string };

export const shopKeys = {
  all: ["shop"] as const,
  list: () => [...shopKeys.all, "list"] as const,
};

/** True for items bought with gems; false for the ones bought with money. */
export const isGemPriced = (item: ShopItem): item is ShopItem & { price: number } => item.price !== undefined;

export const useShop = () => {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: shopKeys.list(),
    queryFn: () => api.get<ShopResponse>("/api/shop"),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => !error.message.includes("Unauthorized") && failureCount < 3,
  });
  return {
    items: query.data?.items ?? [],
    payments: query.data?.payments,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
};

/**
 * Buy any item. Gem-priced items are paid from the balance; money-priced ones (gem packs) go through the payment
 * provider. A provider that answers with a URL (Stripe) sends the person there, so swapping providers needs no
 * change here. Resolves true when the purchase went through at once.
 */
export const useBuy = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const mutation = useMutation({
    mutationFn: async (item: ShopItem) =>
      (await apiClient.post<ApiResponse<BuyResult>>("/api/shop/buy", { itemId: item.id })).data,
    onSuccess: (data) => {
      if (!data.status) {
        enqueueSnackbar(data.message || "Failed to purchase item", { variant: "error" });
        return;
      }
      if (data.data?.result === "redirect") {
        window.location.assign(data.data.url);
        return;
      }
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      enqueueSnackbar(data.message || "Item purchased", { variant: "success" });
    },
    onError: (error: Error) => {
      enqueueSnackbar(error.message || "The purchase could not be completed", { variant: "error" });
    },
  });
  return {
    buy: async (item: ShopItem): Promise<boolean> => {
      try {
        const data = await mutation.mutateAsync(item);
        return data.status && data.data?.result !== "redirect";
      } catch {
        return false; // reported by onError
      }
    },
    isBuying: mutation.isPending,
  };
};

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { useSnackbar } from "notistack";
import { userProfileKeys } from "./useUserProfile";


interface BuyPointsItemResponse {
  status: boolean;
  message: string;
}

// Types
export interface PointsShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
}

interface PointsShopItemsResponse {
  items: PointsShopItem[];
}

// Query keys
export const pointsShopItemsKeys = {
  all: ["pointsShopItems"] as const,
  list: () => [...pointsShopItemsKeys.all, "list"] as const,
};

// API functions
const fetchPointsShopItems = async (): Promise<PointsShopItem[]> => {
  const response = await apiClient.get<ApiResponse<PointsShopItemsResponse>>("/api/points/shop");
  return response.data.data!.items;
};

const buyPointsItem = async (item: PointsShopItem): Promise<BuyPointsItemResponse> => {
  const response = await apiClient.post<ApiResponse<boolean>>("/api/points/redeemItem", { itemId: item.id });
  return response.data;
};

// Hooks
export const usePointsShopItems = () => {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const {
    data: pointsShopItems,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: pointsShopItemsKeys.list(),
    queryFn: fetchPointsShopItems,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const { mutateAsync: buyPointsItemMutation, isPending: isBuyingPointsItem, error: buyPointsItemError } = useMutation({
    mutationFn: buyPointsItem,
    onSuccess: (data) => {
      if (data.status) {
        queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
        enqueueSnackbar(data.message || `Item bought successfully`, {
          variant: "success",
        });
      } else {
        enqueueSnackbar(data.message || `Failed to buy item`, {
          variant: "error",
        });
      }
    },
  });

  return { pointsShopItems: pointsShopItems || [], isLoading, isError, error: error as Error | null, refetch, buyPointsItemMutation, isBuyingPointsItem, buyPointsItemError: buyPointsItemError as Error | null };
};

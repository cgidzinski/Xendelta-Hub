import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient, api } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { useSnackbar } from "notistack";
import { userProfileKeys } from "./useUserProfile";

export const inventoryKeys = {
  all: ["inventory"] as const,
};

export interface InventoryItem {
  _id: string;
  itemKey: string;
  name: string;
  description: string;
  image: string;
  redeemable?: boolean;
  purchasedAt: string;
  used: boolean;
  usedAt?: string;
}

interface InventoryResponse {
  inventory: InventoryItem[];
}

interface UseInventoryReturn {
  inventory: InventoryItem[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  redeemItem: (inventoryItemId: string) => Promise<boolean>;
  trashItem: (inventoryItemId: string) => Promise<boolean>;
  /** Wear (true) or take off (false) a cosmetic. */
  wearItem: (inventoryItemId: string, wear: boolean) => Promise<boolean>;
  isUsing: boolean;
  isTrashing: boolean;
}

const fetchInventory = async (): Promise<InventoryItem[]> => {
  return (await api.get<InventoryResponse>("/api/user/inventory")).inventory;
};

const redeemInventoryItem = async (inventoryItemId: string): Promise<boolean> => {
  const response = await apiClient.post<ApiResponse<boolean>>(`/api/user/inventory/${inventoryItemId}/use`);
  return response.data.status;
};

const trashItem = async (inventoryItemId: string): Promise<boolean> => {
  const response = await apiClient.delete<ApiResponse<boolean>>(`/api/user/inventory/${inventoryItemId}`);
  return response.data.status;
};

const setWorn = async ({ id, wear }: { id: string; wear: boolean }): Promise<ApiResponse<unknown>> =>
  (await apiClient.post<ApiResponse<unknown>>(`/api/user/inventory/${id}/${wear ? "equip" : "unequip"}`)).data;

export const useInventory = (): UseInventoryReturn => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const {
    data: inventory,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: inventoryKeys.all,
    queryFn: fetchInventory,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  const useMutationObj = useMutation({
    mutationFn: redeemInventoryItem,
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        enqueueSnackbar("Item used successfully", { variant: "success" });
      } else {
        enqueueSnackbar("Failed to use item", { variant: "error" });
      }
    },
  });

  const trashMutationObj = useMutation({
    mutationFn: trashItem,
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        // Trashing the last copy of something worn takes it off.
        queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
        enqueueSnackbar("Item trashed", { variant: "success" });
      } else {
        enqueueSnackbar("Failed to trash item", { variant: "error" });
      }
    },
  });

  const wearMutation = useMutation({
    mutationFn: setWorn,
    onSuccess: (data) => {
      if (data.status) {
        // What someone wears shows next to their name on every screen, so refresh everything that is cached.
        queryClient.invalidateQueries();
        enqueueSnackbar(data.message || "Done", { variant: "success" });
      } else {
        enqueueSnackbar(data.message || "Could not change what you are wearing", { variant: "error" });
      }
    },
    onError: (error: Error) => enqueueSnackbar(error.message, { variant: "error" }),
  });

  return {
    inventory: inventory || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    redeemItem: useMutationObj.mutateAsync,
    trashItem: trashMutationObj.mutateAsync,
    wearItem: async (id, wear) => {
      try {
        return (await wearMutation.mutateAsync({ id, wear })).status;
      } catch {
        return false; // reported by onError
      }
    },
    isUsing: useMutationObj.isPending,
    isTrashing: trashMutationObj.isPending,
  };
};

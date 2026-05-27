import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { useSnackbar } from "notistack";
import { userProfileKeys } from "./useUserProfile";

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
  useItem: (inventoryItemId: string) => Promise<boolean>;
  trashItem: (inventoryItemId: string) => Promise<boolean>;
  isUsing: boolean;
  isTrashing: boolean;
}

const fetchInventory = async (): Promise<InventoryItem[]> => {
  const response = await apiClient.get<ApiResponse<InventoryResponse>>("/api/user/inventory");
  return response.data.data!.inventory;
};

const useItem = async (inventoryItemId: string): Promise<boolean> => {
  const response = await apiClient.post<ApiResponse<boolean>>(`/api/user/inventory/${inventoryItemId}/use`);
  return response.data.status;
};

const trashItem = async (inventoryItemId: string): Promise<boolean> => {
  const response = await apiClient.delete<ApiResponse<boolean>>(`/api/user/inventory/${inventoryItemId}`);
  return response.data.status;
};

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
    queryKey: ["inventory"],
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
    mutationFn: useItem,
    onSuccess: (data) => {
      if (data) {
        queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
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
        queryClient.invalidateQueries({ queryKey: ["inventory"] });
        enqueueSnackbar("Item trashed", { variant: "success" });
      } else {
        enqueueSnackbar("Failed to trash item", { variant: "error" });
      }
    },
  });

  return {
    inventory: inventory || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    useItem: useMutationObj.mutateAsync,
    trashItem: trashMutationObj.mutateAsync,
    isUsing: useMutationObj.isPending,
    isTrashing: trashMutationObj.isPending,
  };
};

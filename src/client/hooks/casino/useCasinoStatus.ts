import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

export interface CasinoStatus {
  open: boolean;
  reason: "manual" | "broke" | null;
  bankBalance: number;
  disabledGames: string[];
}

export const casinoStatusKeys = {
  all: ["casinoStatus"] as const,
};

const fetchCasinoStatus = async (): Promise<CasinoStatus> => {
  const response = await apiClient.get<ApiResponse<CasinoStatus>>("/api/casino/status");
  return response.data.data!;
};

export const useCasinoStatus = () => {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: casinoStatusKeys.all,
    queryFn: fetchCasinoStatus,
    enabled: isAuthenticated,
    staleTime: 5 * 1000,
    refetchInterval: 5 * 1000,
    refetchOnWindowFocus: true,
  });

  return {
    open: data?.open ?? true,
    reason: data?.reason ?? null,
    bankBalance: data?.bankBalance ?? null,
    disabledGames: data?.disabledGames ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

export interface CasinoBalance {
  linked: boolean;
  balance: string | null;
}

export const casinoBalanceKeys = {
  all: ["casinoBalance"] as const,
};

const fetchCasinoBalance = async (): Promise<CasinoBalance> => {
  const response = await apiClient.get<ApiResponse<CasinoBalance>>("/api/casino/balance");
  return response.data.data!;
};

export const useCasinoBalance = () => {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: casinoBalanceKeys.all,
    queryFn: fetchCasinoBalance,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    linked: data?.linked ?? false,
    balance: data?.balance ?? null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

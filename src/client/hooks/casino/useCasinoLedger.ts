import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

export interface CasinoLedgerEntry {
  id: number;
  entryType: "credit" | "debit";
  amount: string;
  counterpartyId: number;
  displayName: string;
  note: string;
  createdAt: string;
}

export const casinoLedgerKeys = {
  all: ["casinoLedger"] as const,
};

const fetchCasinoLedger = async (): Promise<CasinoLedgerEntry[]> => {
  const response = await apiClient.get<ApiResponse<{ entries: CasinoLedgerEntry[] }>>("/api/casino/ledger");
  return response.data.data!.entries;
};

export const useCasinoLedger = () => {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: casinoLedgerKeys.all,
    queryFn: fetchCasinoLedger,
    enabled: isAuthenticated,
    staleTime: 15 * 1000,
  });

  return {
    entries: data ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

// Types
export interface CollectionStat {
  name: string;
  count: number;
}

export interface CollectionRestoreSummary {
  name: string;
  deleted: number;
  inserted: number;
  error?: string;
}

interface CollectionsResponse {
  collections: CollectionStat[];
  generatedAt: string;
}

interface ImportResponse {
  collections: CollectionRestoreSummary[];
  safetySnapshot: string | null;
}

// Query keys
export const adminDatabaseKeys = {
  all: ["adminDatabase"] as const,
  collections: () => [...adminDatabaseKeys.all, "collections"] as const,
};

// API functions
const fetchCollectionStats = async (): Promise<CollectionsResponse> => {
  const response = await apiClient.get<ApiResponse<CollectionsResponse>>("/api/admin/database/collections");
  return response.data.data!;
};

const exportDatabaseFile = async (): Promise<void> => {
  const response = await apiClient.get("/api/admin/database/export", { responseType: "blob" });

  const contentDisposition = response.headers["content-disposition"] as string | undefined;
  let filename = "xendelta-hub-backup.ndjson.gz";
  const filenameMatch = contentDisposition?.match(/filename="?(.+?)"?$/);
  if (filenameMatch) {
    filename = filenameMatch[1];
  }

  const downloadUrl = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
};

const importDatabaseFile = async (params: {
  file: File;
  confirmationPhrase: string;
  skipSafetySnapshot: boolean;
}): Promise<ImportResponse> => {
  const formData = new FormData();
  formData.append("dump", params.file);
  formData.append("confirmationPhrase", params.confirmationPhrase);
  formData.append("skipSafetySnapshot", String(params.skipSafetySnapshot));

  const response = await apiClient.post<ApiResponse<ImportResponse>>("/api/admin/database/import", formData);
  return response.data.data!;
};

// Hooks
export const useAdminDatabase = () => {
  const queryClient = useQueryClient();

  const {
    data: collectionsData,
    isLoading: isLoadingCollections,
    refetch: refetchCollections,
  } = useQuery({
    queryKey: adminDatabaseKeys.collections(),
    queryFn: fetchCollectionStats,
    staleTime: 30 * 1000,
  });

  const { mutateAsync: exportDatabaseMutation, isPending: isExporting } = useMutation({
    mutationFn: exportDatabaseFile,
    onError: () => {
      // Error handled by mutation error state
    },
  });

  const { mutateAsync: importDatabaseMutation, isPending: isImporting } = useMutation({
    mutationFn: importDatabaseFile,
    onSuccess: () => {
      // Any collection may have changed - drop every cached query in the app.
      queryClient.clear();
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  return {
    collections: collectionsData?.collections || [],
    collectionsGeneratedAt: collectionsData?.generatedAt,
    isLoadingCollections,
    refetchCollections,
    exportDatabase: exportDatabaseMutation,
    isExporting,
    importDatabase: (file: File, confirmationPhrase: string, skipSafetySnapshot: boolean) =>
      importDatabaseMutation({ file, confirmationPhrase, skipSafetySnapshot }),
    isImporting,
  };
};

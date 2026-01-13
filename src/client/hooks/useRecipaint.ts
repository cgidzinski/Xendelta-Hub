import { useMutation } from "@tanstack/react-query";
import { apiClient } from "../config/api";
import { ApiResponse } from "../types/api";

// Types
interface RecipaintAssetUploadResponse {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

// API functions
const uploadRecipaintAsset = async (file: File): Promise<RecipaintAssetUploadResponse> => {
  const formData = new FormData();
  formData.append("asset", file);

  const response = await apiClient.post<ApiResponse<RecipaintAssetUploadResponse>>("/api/recipaint/upload-asset", formData);
  return response.data.data!;
};

const deleteRecipaintAsset = async (assetUrl: string): Promise<void> => {
  await apiClient.delete(`/api/recipaint/asset?assetUrl=${encodeURIComponent(assetUrl)}`);
};

// Hooks
export const useRecipaint = () => {
  // Mutation for uploading recipaint asset
  const { mutateAsync: uploadAsset, isPending: isUploadingAsset } = useMutation({
    mutationFn: uploadRecipaintAsset,
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for deleting recipaint asset
  const { mutate: deleteAsset, isPending: isDeletingAsset } = useMutation({
    mutationFn: deleteRecipaintAsset,
    onError: () => {
      // Error handled by mutation error state
    },
  });

  return {
    uploadAsset,
    isUploadingAsset,
    deleteAsset: (assetUrl: string) => deleteAsset(assetUrl),
    isDeletingAsset,
  };
};

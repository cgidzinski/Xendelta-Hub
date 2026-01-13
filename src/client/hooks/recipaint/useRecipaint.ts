import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { Recipe } from "../../types/Recipe";

// Asset upload types
interface RecipaintAssetUploadResponse {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

// Types
interface RecipesResponse {
  recipes: Recipe[];
}

interface RecipeResponse {
  recipe: Recipe;
}

interface CreateRecipeData {
  showcase?: string[];
  title: string;
  description?: string;
  steps?: (Recipe["steps"][number])[];
  isPublic?: boolean;
}

interface UpdateRecipeData {
  showcase?: string[];
  title?: string;
  description?: string;
  steps?: (Recipe["steps"][number])[];
  isPublic?: boolean;
}

// Query keys
export const recipaintKeys = {
  all: ["recipaint"] as const,
  lists: () => [...recipaintKeys.all, "list"] as const,
  list: (search?: string) => [...recipaintKeys.lists(), { search }] as const,
  details: () => [...recipaintKeys.all, "detail"] as const,
  detail: (id: string) => [...recipaintKeys.details(), id] as const,
  public: () => [...recipaintKeys.all, "public"] as const,
};

// API functions
const fetchRecipes = async (search?: string): Promise<Recipe[]> => {
  const params = search ? { search } : {};
  const response = await apiClient.get<ApiResponse<RecipesResponse>>("/api/recipaint", { params });
  return response.data.data!.recipes;
};

const fetchPublicRecipes = async (): Promise<Recipe[]> => {
  const response = await apiClient.get<ApiResponse<RecipesResponse>>("/api/recipaint/public");
  return response.data.data!.recipes;
};

const fetchRecipe = async (id: string): Promise<Recipe> => {
  const response = await apiClient.get<ApiResponse<RecipeResponse>>(`/api/recipaint/${id}`);
  return response.data.data!.recipe;
};

const createRecipe = async (data: CreateRecipeData): Promise<Recipe> => {
  const response = await apiClient.post<ApiResponse<RecipeResponse>>("/api/recipaint", data);
  return response.data.data!.recipe;
};

const updateRecipe = async ({ id, data }: { id: string; data: UpdateRecipeData }): Promise<Recipe> => {
  const response = await apiClient.put<ApiResponse<RecipeResponse>>(`/api/recipaint/${id}`, data);
  return response.data.data!.recipe;
};

const deleteRecipe = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/recipaint/${id}`);
};

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
export const useRecipaint = (search?: string) => {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: recipaintKeys.list(search),
    queryFn: () => fetchRecipes(search),
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    recipes: data || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

export const usePublicRecipes = () => {
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: recipaintKeys.public(),
    queryFn: fetchPublicRecipes,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    recipes: data || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

export const useRecipaintRecipe = (id: string | undefined) => {
  const {
    data: recipe,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: recipaintKeys.detail(id!),
    queryFn: () => fetchRecipe(id!),
    enabled: !!id,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized") || error.message.includes("not found") || error.message.includes("Access denied")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    recipe: recipe || null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

export const useCreateRecipe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipaintKeys.lists() });
    },
  });
};

export const useUpdateRecipe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateRecipe,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: recipaintKeys.lists() });
      queryClient.invalidateQueries({ queryKey: recipaintKeys.detail(data._id) });
    },
  });
};

export const useDeleteRecipe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipaintKeys.lists() });
      queryClient.invalidateQueries({ queryKey: recipaintKeys.details() });
    },
  });
};

const cloneRecipe = async (id: string): Promise<Recipe> => {
  const response = await apiClient.post<ApiResponse<RecipeResponse>>(`/api/recipaint/${id}/clone`);
  return response.data.data!.recipe;
};

export const useCloneRecipe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cloneRecipe,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recipaintKeys.lists() });
    },
  });
};

export const useRecipaintAssets = () => {
  const { mutateAsync: uploadAsset, isPending: isUploadingAsset } = useMutation({
    mutationFn: uploadRecipaintAsset,
  });

  const { mutate: deleteAsset, isPending: isDeletingAsset } = useMutation({
    mutationFn: deleteRecipaintAsset,
  });

  return {
    uploadAsset,
    isUploadingAsset,
    deleteAsset: (assetUrl: string) => deleteAsset(assetUrl),
    isDeletingAsset,
  };
};

import { useQuery } from "@tanstack/react-query";
import { apiClient, getApiUrl } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { BlogPost } from "../../types";

// Types
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface BlogResponse {
  posts: BlogPost[];
  pagination: PaginationInfo;
}

interface UseBlogOptions {
  page?: number;
  limit?: number;
  enabled?: boolean;
}

// Query keys
export const blogKeys = {
  all: ["blog"] as const,
  lists: () => [...blogKeys.all, "list"] as const,
  list: (page: number, limit: number) => [...blogKeys.lists(), { page, limit }] as const,
};

// API functions
const fetchBlogPosts = async (page: number = 1, limit: number = 10): Promise<BlogResponse> => {
  const response = await apiClient.get<ApiResponse<BlogResponse>>(getApiUrl("api/blog"), {
    params: {
      page: page.toString(),
      limit: limit.toString(),
    },
  });
  return response.data.data!;
};

// Hooks
export const useBlog = (options: UseBlogOptions = {}) => {
  const { page = 1, limit = 10, enabled = true } = options;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: blogKeys.list(page, limit),
    queryFn: () => fetchBlogPosts(page, limit),
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    posts: data?.posts || [],
    pagination: data?.pagination,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

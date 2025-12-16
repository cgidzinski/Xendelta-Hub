import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { BlogPost } from "../../types";

// Types
interface BlogPostResponse {
  post: BlogPost;
}

// Query keys
export const blogPostKeys = {
  all: ["blogPost"] as const,
  details: () => [...blogPostKeys.all, "detail"] as const,
  detail: (slug: string) => [...blogPostKeys.details(), slug] as const,
};

// API functions
const fetchBlogPost = async (slug: string): Promise<BlogPost> => {
  const response = await apiClient.get<ApiResponse<BlogPostResponse>>(`/api/blog/${slug}`);
  return response.data.data!.post;
};

// Hooks
export const useBlogPost = (slug: string | undefined) => {
  const {
    data: post,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: blogPostKeys.detail(slug!),
    queryFn: () => fetchBlogPost(slug!),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized") || error.message.includes("not found")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    post: post || null,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

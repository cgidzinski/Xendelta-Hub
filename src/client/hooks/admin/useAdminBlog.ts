import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient, api } from "../../config/api";
import { BlogPost } from "../../types/BlogPost";
import { blogKeys } from "../blog/useBlog";
import { blogPostKeys } from "../blog/useBlogPost";

// Types
interface BlogAssetUploadResponse {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface BlogPostsResponse {
  posts: BlogPost[];
}

interface CreateBlogPostPayload {
  title: string;
  slug: string;
  markdown: string;
  publishDate: string;
  assets?: string[];
  featuredImage?: string | null;
  categories?: string[];
  tags?: string[];
  featured?: boolean;
  published?: boolean;
}

interface UpdateBlogPostPayload extends Partial<CreateBlogPostPayload> {}

// Query keys
export const adminBlogKeys = {
  all: ["adminBlogPosts"] as const,
  posts: () => [...adminBlogKeys.all, "posts"] as const,
};

// API functions
const fetchAdminBlogPosts = async (): Promise<BlogPost[]> => {
  return (await api.get<BlogPostsResponse>("/api/admin/blog")).posts;
};

const createBlogPost = async (payload: CreateBlogPostPayload): Promise<BlogPost> => {
  return (await api.post<{ post: BlogPost }>("/api/admin/blog", payload)).post;
};

const updateBlogPost = async (id: string, payload: UpdateBlogPostPayload): Promise<BlogPost> => {
  return (await api.put<{ post: BlogPost }>(`/api/admin/blog/${id}`, payload)).post;
};

const deleteBlogPost = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/admin/blog/${id}`);
};

const uploadBlogAsset = async (file: File, postId?: string): Promise<BlogAssetUploadResponse> => {
  const formData = new FormData();
  formData.append("asset", file);
  if (postId) {
    formData.append("postId", postId);
  }

  return api.post<BlogAssetUploadResponse>("/api/admin/blog/upload-asset", formData);
};

const deleteBlogAsset = async (postId: string, assetUrl: string): Promise<void> => {
  await apiClient.delete(`/api/admin/blog/asset?postId=${postId}&assetUrl=${encodeURIComponent(assetUrl)}`);
};

// Hooks
export const useAdminBlog = () => {
  const queryClient = useQueryClient();

  // Query for fetching admin blog posts
  const {
    data: posts,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: adminBlogKeys.posts(),
    queryFn: fetchAdminBlogPosts,
    staleTime: 1 * 60 * 1000, // 1 minute
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Mutation for creating blog post
  const { mutate: createPostMutation, isPending: isCreating } = useMutation({
    mutationFn: createBlogPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBlogKeys.posts() });
      queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for updating blog post
  const {
    mutateAsync: updatePostAsync,
    mutate: updatePostMutate,
    isPending: isUpdating,
  } = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBlogPostPayload }) => updateBlogPost(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBlogKeys.posts() });
      queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
      queryClient.invalidateQueries({ queryKey: blogPostKeys.details() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for deleting blog post
  const { mutate: deletePost, isPending: isDeleting } = useMutation({
    mutationFn: deleteBlogPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBlogKeys.posts() });
      queryClient.invalidateQueries({ queryKey: blogKeys.lists() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for uploading blog asset
  const { mutateAsync: uploadAsset, isPending: isUploadingAsset } = useMutation({
    mutationFn: ({ file, postId }: { file: File; postId?: string }) => uploadBlogAsset(file, postId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBlogKeys.posts() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for deleting blog asset
  const { mutate: deleteAsset, isPending: isDeletingAsset } = useMutation({
    mutationFn: ({ postId, assetUrl }: { postId: string; assetUrl: string }) => deleteBlogAsset(postId, assetUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBlogKeys.posts() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  return {
    posts: posts || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    createPost: createPostMutation,
    isCreating,
    updatePost: (
      id: string,
      payload: UpdateBlogPostPayload,
      options?: { onSuccess?: () => void; onError?: (error: Error) => void },
    ) => {
      if (options) {
        updatePostAsync({ id, payload }, options);
      } else {
        updatePostMutate({ id, payload });
      }
    },
    isUpdating,
    deletePost,
    isDeleting,
    uploadAsset,
    isUploadingAsset,
    deleteAsset: (postId: string, assetUrl: string) => deleteAsset({ postId, assetUrl }),
    isDeletingAsset,
  };
};

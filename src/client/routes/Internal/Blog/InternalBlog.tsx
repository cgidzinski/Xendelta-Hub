import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../../../hooks/useTitle";
import BlogContent, { BlogPost, PaginationInfo } from "../../External/BlogPublic/components/BlogContent";
import { get } from "../../../utils/apiClient";

export default function InternalBlog() {
  useTitle("Blog");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      setError(null);
      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "10");
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      const data = await get<{ posts: BlogPost[]; pagination: PaginationInfo }>(`/api/blog?${queryParams.toString()}`);
      setPosts(data.posts || []);
      setPagination(data.pagination);
      setIsLoading(false);
    };

    fetchPosts().catch((err: any) => {
      setError(err.message || "Failed to load blog posts");
      setIsLoading(false);
    });
  }, [searchParams]);

  const handlePostClick = (slug: string) => {
    navigate(`/internal/blog/${slug}`);
  };

  const handlePageChange = (page: number) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("page", page.toString());
    setSearchParams(newSearchParams);
  };

  return (
    <BlogContent
      blogBasePath="/internal/blog"
      posts={posts}
      isLoading={isLoading}
      error={error}
      onPostClick={handlePostClick}
      pagination={pagination}
      onPageChange={handlePageChange}
    />
  );
}

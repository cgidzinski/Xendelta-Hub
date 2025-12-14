import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTitle } from "../../../hooks/useTitle";
import BlogContent, { BlogPost } from "../../External/BlogPublic/components/BlogContent";
import { get } from "../../../utils/apiClient";

export default function InternalBlog() {
  useTitle("Blog");
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoading(true);
      setError(null);
      const data = await get<{ posts: BlogPost[] }>("/api/blog");
      setPosts(data.posts || []);
      setIsLoading(false);
    };

    fetchPosts().catch((err: any) => {
      setError(err.message || "Failed to load blog posts");
      setIsLoading(false);
    });
  }, []);

  const handlePostClick = (slug: string) => {
    navigate(`/internal/blog/${slug}`);
  };

  return (
    <BlogContent
      blogBasePath="/internal/blog"
      posts={posts}
      isLoading={isLoading}
      error={error}
      onPostClick={handlePostClick}
    />
  );
}

import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTitle } from "../../../hooks/useTitle";
import BlogPostDetailContent from "../../External/BlogPublic/components/BlogPostDetailContent";
import { BlogPost } from "../../External/BlogPublic/components/BlogContent";
import { get } from "../../../utils/apiClient";

export default function InternalBlogPostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("Invalid post slug");
      setIsLoading(false);
      return;
    }

    const fetchPost = async () => {
      setIsLoading(true);
      setError(null);
      const data = await get<{ post: BlogPost }>(`/api/blog/${slug}`);
      setPost(data.post);
      setIsLoading(false);
    };

    fetchPost().catch((err: any) => {
      setError(err.message || "Failed to load blog post");
      setIsLoading(false);
    });
  }, [slug]);

  useTitle(post?.title || "Blog Post");

  const handleBackClick = () => {
    navigate("/internal/blog");
  };

  return (
    <BlogPostDetailContent
      blogBasePath="/internal/blog"
      post={post}
      isLoading={isLoading}
      error={error}
      onBackClick={handleBackClick}
    />
  );
}

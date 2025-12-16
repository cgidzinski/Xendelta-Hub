import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTitle } from "../../../hooks/useTitle";
import BlogPostDetailContent from "../../External/BlogPublic/components/BlogPostDetailContent";
import { BlogPost } from "../../../types";
import { useBlogPost } from "../../../hooks/blog/useBlogPost";

export default function InternalBlogPostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { post, isLoading, isError, error } = useBlogPost(slug);

  useTitle(post?.title || "Blog Post");

  const handleBackClick = () => {
    navigate("/internal/blog");
  };

  return (
    <BlogPostDetailContent
      blogBasePath="/internal/blog"
      post={post}
      isLoading={isLoading}
      error={isError ? (error?.message || "Failed to load blog post") : null}
      onBackClick={handleBackClick}
    />
  );
}

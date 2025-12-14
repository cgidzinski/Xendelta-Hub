import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import LandingHeader from "../../../components/LandingHeader";
import BlogPostDetailContent from "./components/BlogPostDetailContent";
import { BlogPost } from "./components/BlogContent";
import { get } from "../../../utils/apiClient";

export default function BlogPostDetail() {
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

  const handleBackClick = () => {
    navigate("/blog");
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "background.default",
      }}
    >
      <LandingHeader />
      <BlogPostDetailContent
        blogBasePath="/blog"
        post={post}
        isLoading={isLoading}
        error={error}
        onBackClick={handleBackClick}
      />
    </Box>
  );
}

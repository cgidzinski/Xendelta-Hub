import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import LandingHeader from "../../../components/LandingHeader";
import BlogContent, { BlogPost } from "./components/BlogContent";
import { get } from "../../../utils/apiClient";

export default function Blog() {
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
    navigate(`/blog/${slug}`);
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
      <BlogContent
        blogBasePath="/blog"
        posts={posts}
        isLoading={isLoading}
        error={error}
        onPostClick={handlePostClick}
      />
    </Box>
  );
}

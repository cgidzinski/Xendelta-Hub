import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import LandingHeader from "../../../components/LandingHeader";
import BlogPostDetailContent from "./components/BlogPostDetailContent";
import { BlogPost } from "../../../types";
import { useBlogPost } from "../../../hooks/blog/useBlogPost";

export default function BlogPostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { post, isLoading, isError, error } = useBlogPost(slug);

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
        error={isError ? (error?.message || "Failed to load blog post") : null}
        onBackClick={handleBackClick}
      />
    </Box>
  );
}

import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Box } from "@mui/material";
import LandingHeader from "../../../components/LandingHeader";
import BlogContent, { BlogPost, PaginationInfo } from "./components/BlogContent";
import { useBlog } from "../../../hooks/blog/useBlog";

export default function Blog() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");
  const { posts, pagination, isLoading, isError, error } = useBlog({ page, limit });

  const handlePostClick = (slug: string) => {
    navigate(`/blog/${slug}`);
  };

  const handlePageChange = (page: number) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("page", page.toString());
    setSearchParams(newSearchParams);
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
        error={isError ? (error?.message || "Failed to load blog posts") : null}
        onPostClick={handlePostClick}
        pagination={pagination}
        onPageChange={handlePageChange}
      />
    </Box>
  );
}

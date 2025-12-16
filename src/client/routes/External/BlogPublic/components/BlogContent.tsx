import React from "react";
import {
  Container,
  Typography,
  Card,
  CardContent,
  CardMedia,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  Link,
  Box,
  Pagination,
} from "@mui/material";
import { CalendarToday, Person, Star } from "@mui/icons-material";
import { format } from "date-fns";
import type { BlogPost } from "../../../../types/BlogPost";

// Re-export for backward compatibility (BlogPost is an interface/type)
export type { BlogPost };

// Extract excerpt from markdown (first paragraph or first 200 chars)
function extractExcerpt(markdown: string): string {
  // Remove markdown headers, links, images, etc.
  const plainText = markdown
    .replace(/^#+\s+/gm, "") // Remove headers
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Replace links with text
    .replace(/!\[([^\]]*)\]\([^\)]+\)/g, "") // Remove images
    .replace(/\*\*([^\*]+)\*\*/g, "$1") // Remove bold
    .replace(/\*([^\*]+)\*/g, "$1") // Remove italic
    .replace(/`([^`]+)`/g, "$1") // Remove code
    .trim();

  // Get first paragraph or first 200 chars
  const firstParagraph = plainText.split("\n\n")[0] || plainText;
  if (firstParagraph.length <= 200) {
    return firstParagraph;
  }
  return firstParagraph.substring(0, 200) + "...";
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface BlogContentProps {
  blogBasePath: string;
  posts: BlogPost[];
  isLoading: boolean;
  error: string | null;
  onPostClick: (slug: string) => void;
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
}

export default function BlogContent({ blogBasePath, posts, isLoading, error, onPostClick, pagination, onPageChange }: BlogContentProps) {
  return (
    <Container maxWidth="lg" sx={{ py: 2, flex: 1 }}>
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
      ) : posts.length === 0 ? (
        <Alert severity="info">No blog posts available yet.</Alert>
      ) : (
        <Stack spacing={4}>
          {posts.map((post) => (
            <Card
              key={post._id}
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                transition: "all 0.3s ease",
                cursor: "pointer",
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: "0 8px 16px rgba(0,0,0,0.1)",
                  borderColor: "primary.main",
                },
              }}
              onClick={() => onPostClick(post.slug)}
            >
              {post.featuredImage && (
                <CardMedia
                  component="img"
                  height="300"
                  image={post.featuredImage}
                  alt={post.title}
                  sx={{ objectFit: "cover" }}
                />
              )}
              <CardContent sx={{ p: 4 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                  {post.featured && (
                    <Chip
                      icon={<Star />}
                      label="Featured"
                      size="small"
                      sx={{
                        backgroundColor: "warning.main",
                        color: "white",
                        fontWeight: 600,
                      }}
                    />
                  )}
                  {post.categories.map((category, index) => (
                    <Chip
                      key={index}
                      label={category}
                      size="small"
                      sx={{
                        backgroundColor: "primary.main",
                        color: "white",
                        fontWeight: 600,
                      }}
                    />
                  ))}
                  {post.tags.map((tag, index) => (
                    <Chip
                      key={index}
                      label={tag}
                      size="small"
                      variant="outlined"
                      sx={{
                        fontWeight: 500,
                      }}
                    />
                  ))}
                </Stack>
                <Typography
                  variant="h4"
                  component="h2"
                  sx={{
                    fontWeight: 700,
                    mb: 2,
                    color: "text.primary",
                  }}
                >
                  {post.title}
                </Typography>
                <Stack direction="row" spacing={2} sx={{ mb: 3, alignItems: "center" }} flexWrap="wrap">
                  {post.author && (
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary" }}>
                      <Person sx={{ fontSize: 18 }} />
                      <Typography variant="body2">{post.author.username}</Typography>
                    </Stack>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "text.secondary" }}>
                    <CalendarToday sx={{ fontSize: 18 }} />
                    <Typography variant="body2">
                      {format(new Date(post.publishDate), "MMMM d, yyyy")}
                    </Typography>
                  </Stack>
                </Stack>
                <Typography
                  variant="body1"
                  sx={{
                    color: "text.secondary",
                    lineHeight: 1.8,
                  }}
                >
                  {extractExcerpt(post.markdown)}
                </Typography>
                <Link
                  component="button"
                  variant="body2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPostClick(post.slug);
                  }}
                  sx={{ mt: 2, textDecoration: "none" }}
                >
                  Read more →
                </Link>
              </CardContent>
            </Card>
          ))}
          {pagination && onPageChange && (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 4, mb: 2 }}>
              <Pagination
                count={pagination.totalPages}
                page={pagination.page}
                onChange={(_, page) => onPageChange(page)}
                color="primary"
                size="large"
              />
            </Box>
          )}
        </Stack>
      )}
    </Container>
  );
}

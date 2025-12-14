import React from "react";
import {
  Container,
  Typography,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  CardMedia,
  Box,
  IconButton,
  Tooltip,
  Divider,
} from "@mui/material";
import { CalendarToday, Person, ArrowBack, Star } from "@mui/icons-material";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BlogPost } from "./BlogContent";

interface BlogPostDetailContentProps {
  blogBasePath: string;
  post: BlogPost | null;
  isLoading: boolean;
  error: string | null;
  onBackClick: () => void;
}

export default function BlogPostDetailContent({
  blogBasePath,
  post,
  isLoading,
  error,
  onBackClick,
}: BlogPostDetailContentProps) {
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
      ) : !post ? (
        <Alert severity="warning">Blog post not found.</Alert>
      ) : (
        <>
          <Box sx={{ mb: 4, display: "flex", alignItems: "center", gap: 2 }}>
            <Tooltip title="Back to Blog">
              <IconButton
                onClick={onBackClick}
                sx={{
                  "&:hover": {
                    backgroundColor: "action.hover",
                    transform: "translateX(-4px)",
                    transition: "all 0.2s ease",
                  },
                }}
              >
                <ArrowBack />
              </IconButton>
            </Tooltip>
            <Typography
              variant="h3"
              component="h1"
              sx={{
                fontWeight: 700,
                color: "text.primary",
                flex: 1,
              }}
            >
              {post.title}
            </Typography>
          </Box>

          {post.image && (
            <CardMedia
              component="img"
              height="400"
              image={post.image}
              alt={post.title}
              sx={{ objectFit: "cover", borderRadius: 2, mb: 4 }}
            />
          )}

          <Stack direction="row" spacing={1} sx={{ mb: 3 }} flexWrap="wrap">
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

          <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: "center" }} flexWrap="wrap">
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

          <Divider sx={{ my: 4 }} />

          <Box
            sx={{
              "& p": {
                mb: 2,
                lineHeight: 1.8,
              },
              "& h1, & h2, & h3, & h4, & h5, & h6": {
                mt: 4,
                mb: 2,
                fontWeight: 700,
              },
              "& h1": { fontSize: "2.5rem" },
              "& h2": { fontSize: "2rem" },
              "& h3": { fontSize: "1.75rem" },
              "& h4": { fontSize: "1.5rem" },
              "& ul, & ol": {
                mb: 2,
                pl: 4,
              },
              "& li": {
                mb: 1,
              },
              "& code": {
                backgroundColor: "rgba(255, 255, 255, 0.1)",
                padding: "2px 6px",
                borderRadius: 1,
                fontFamily: "monospace",
              },
              "& pre": {
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                padding: 2,
                borderRadius: 2,
                overflow: "auto",
                mb: 2,
                "& code": {
                  backgroundColor: "transparent",
                  padding: 0,
                },
              },
              "& blockquote": {
                borderLeft: "4px solid",
                borderColor: "primary.main",
                pl: 2,
                ml: 0,
                fontStyle: "italic",
                mb: 2,
              },
              "& a": {
                color: "primary.main",
                textDecoration: "none",
                "&:hover": {
                  textDecoration: "underline",
                },
              },
              "& img": {
                maxWidth: "100%",
                height: "auto",
                borderRadius: 2,
                mb: 2,
              },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.markdown}</ReactMarkdown>
          </Box>
        </>
      )}
    </Container>
  );
}

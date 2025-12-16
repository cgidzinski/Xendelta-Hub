import React from "react";
import {
  Container,
  Typography,
  Stack,
  Chip,
  Box,
  IconButton,
  Tooltip,
  Divider,
  Paper,
} from "@mui/material";
import { CalendarToday, Person, ArrowBack, Star } from "@mui/icons-material";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BlogPost } from "../../../types";
import LoadingSpinner from "../LoadingSpinner";
import ErrorDisplay from "../ErrorDisplay";

const markdownStyles = {
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
    backgroundColor: "action.selected",
    padding: "2px 6px",
    borderRadius: 1,
    fontFamily: "monospace",
  },
  "& pre": {
    backgroundColor: "background.default",
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
};

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
  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <LoadingSpinner message="Loading blog post..." />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <ErrorDisplay error={error} title="Failed to load blog post" />
      </Container>
    );
  }

  if (!post) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <ErrorDisplay error="Blog post not found" title="Not Found" />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: "flex", alignItems: "center", gap: 2 }}>
        <Tooltip title="Back to Blog">
          <IconButton onClick={onBackClick}>
            <ArrowBack />
          </IconButton>
        </Tooltip>
        <Typography variant="h3" component="h1" fontWeight={700} sx={{ flex: 1 }}>
          {post.title}
        </Typography>
      </Box>

      {post.featuredImage && (
        <Box
          component="img"
          src={post.featuredImage}
          alt={post.title}
          sx={{
            width: "100%",
            height: 400,
            objectFit: "cover",
            borderRadius: 2,
            mb: 4,
          }}
        />
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 3 }} flexWrap="wrap">
        {post.featured && (
          <Chip
            icon={<Star />}
            label="Featured"
            size="small"
            color="warning"
            sx={{ fontWeight: 600 }}
          />
        )}
        {post.categories.map((category: string, index: number) => (
          <Chip
            key={index}
            label={category}
            size="small"
            color="primary"
            sx={{ fontWeight: 600 }}
          />
        ))}
        {post.tags.map((tag: string, index: number) => (
          <Chip
            key={index}
            label={tag}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 500 }}
          />
        ))}
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 4, alignItems: "center" }} flexWrap="wrap">
        {post.author && (
          <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
            <Person fontSize="small" />
            <Typography variant="body2">{post.author.username}</Typography>
          </Stack>
        )}
        <Stack direction="row" spacing={1} alignItems="center" color="text.secondary">
          <CalendarToday fontSize="small" />
          <Typography variant="body2">
            {format(new Date(post.publishDate), "MMMM d, yyyy")}
          </Typography>
        </Stack>
      </Stack>

      <Divider sx={{ my: 4 }} />

      <Paper elevation={0} sx={{ p: 3, ...markdownStyles }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.markdown}</ReactMarkdown>
      </Paper>
    </Container>
  );
}


import { Dialog, Box, Typography } from "@mui/material";
import BlogPostDetailContent from "../../../External/BlogPublic/components/BlogPostDetailContent";
import { BlogPost as BlogPostType, BlogAssetWithMetadata } from "../../../../types";

interface PreviewPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  slug: string;
  markdown: string;
  publishDate: string;
  assets: BlogAssetWithMetadata[];
  categories: string[];
  tags: string[];
  featured: boolean;
  published: boolean;
  postId?: string;
}

export default function PreviewPanel({
  open,
  onClose,
  title,
  slug,
  markdown,
  publishDate,
  assets,
  categories,
  tags,
  featured,
  published,
  postId,
}: PreviewPanelProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <Box sx={{ mt: 2 }}>
        {title && markdown ? (
          <BlogPostDetailContent
            blogBasePath=""
            post={
              {
                _id: postId || "preview",
                title: title || "Untitled",
                slug: slug || "",
                markdown: markdown || "",
                publishDate: publishDate || new Date().toISOString(),
                assets: assets.map((asset) => asset.path),
                featuredImage: assets.find((asset) => asset.isFeatured)?.path || undefined,
                categories: categories,
                tags: tags,
                featured: featured,
                published: published,
                author: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              } as BlogPostType
            }
            isLoading={false}
            error={null}
            onBackClick={onClose}
          />
        ) : (
          <Typography variant="body1" color="text.secondary">
            Please add a title and content to preview
          </Typography>
        )}
      </Box>
    </Dialog>
  );
}


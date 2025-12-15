import React, { useState, useEffect } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Stack,
  IconButton,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  InputAdornment,
  Tabs,
  Tab,
  Switch,
  Avatar,
} from "@mui/material";
import {
  Save as SaveIcon,
  Preview as PreviewIcon,
  CloudUpload as CloudUploadIcon,
  ArrowBack as ArrowBackIcon,
  Close as CloseIcon,
  Star as StarIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { get, post, put, del } from "../../utils/apiClient";
import BlogPostDetailContent from "../External/BlogPublic/components/BlogPostDetailContent";
import { BlogPost as BlogPostType } from "../../types";

import { BlogPost, BlogAssetWithMetadata, MediaUploadResponse } from "../../types";

// Client-side slug generation (same logic as server)
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/[\s_-]+/g, "-") // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

export default function BlogPostForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [isLoading, setIsLoading] = useState(!!id);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState(0);
  const [isAssetsModalOpen, setIsAssetsModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [assets, setAssets] = useState<BlogAssetWithMetadata[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [featured, setFeatured] = useState(false);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (id) {
      fetchPost();
    } else {
      // Set default publish date for new posts
      setPublishDate(new Date().toISOString().slice(0, 16));
      setIsLoading(false);
    }
  }, [id]);

  // Reset to first tab if no id (Media and Misc tabs are disabled)
  useEffect(() => {
    if (!id && currentTab > 0) {
      setCurrentTab(0);
    }
  }, [id, currentTab]);

  const fetchPost = async () => {
    setIsLoading(true);
    const data = await get<{ posts: BlogPost[] }>("/api/admin/blog");
    const post = data.posts.find((p) => p._id === id);
    if (post) {
      setTitle(post.title);
      setSlug(post.slug);
      setMarkdown(post.markdown);
      setPublishDate(new Date(post.publishDate).toISOString().slice(0, 16));

      // Load assets - backend returns direct URLs
      const assetList: BlogAssetWithMetadata[] = [];
      if (post.assets && post.assets.length > 0) {
        post.assets.forEach((assetUrl: string) => {
          // Extract filename from URL for display
          const urlParts = assetUrl.split("/");
          const filename = urlParts[urlParts.length - 1];
          // Determine MIME type from extension (fallback)
          const ext = filename.split(".").pop()?.toLowerCase() || "";
          let mimeType = "application/octet-stream";
          if (["jpg", "jpeg"].includes(ext)) mimeType = "image/jpeg";
          else if (ext === "png") mimeType = "image/png";
          else if (ext === "gif") mimeType = "image/gif";
          else if (ext === "mp4") mimeType = "video/mp4";
          else if (ext === "pdf") mimeType = "application/pdf";
          
          assetList.push({
            path: assetUrl, // Direct GCS URL
            gcsPath: undefined,
            type: mimeType,
            id: assetUrl, // Use URL as ID
            isFeatured: post.featuredImage === assetUrl,
          });
        });
      }
      setAssets(assetList);

      setCategories(post.categories || []);
      setTags(post.tags || []);
      setFeatured(post.featured || false);
      setPublished(post.published || false);
    } else {
      enqueueSnackbar("Blog post not found", { variant: "error" });
      navigate("/admin/blog");
    }
    setIsLoading(false);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!id) {
      // Auto-generate slug from title for new posts
      const generatedSlug = generateSlug(value);
      setSlug(generatedSlug);
    }
  };

  const handleAddCategory = () => {
    if (categoryInput.trim() && !categories.includes(categoryInput.trim())) {
      setCategories([...categories, categoryInput.trim()]);
      setCategoryInput("");
    }
  };

  const handleRemoveCategory = (category: string) => {
    setCategories(categories.filter((c) => c !== category));
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleAssetUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const token = localStorage.getItem("token");
    const uploadedAssets: BlogAssetWithMetadata[] = [];

    // Upload each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("asset", file);
      if (id) {
        formData.append("postId", id);
      }

      const response = await fetch("/api/admin/blog/upload-asset", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        enqueueSnackbar(error.message || `Failed to upload asset ${i + 1}`, { variant: "error" });
        continue;
      }

      const data = await response.json();
      
      uploadedAssets.push({
        path: data.data.url, // Direct GCS public URL
        gcsPath: undefined,
        type: data.data.mimeType, // MIME type
        id: data.data.url, // Use URL as ID
        isFeatured: false,
      });
    }

    // Add uploaded assets to the list
    setAssets([...assets, ...uploadedAssets]);
    setIsUploading(false);
    enqueueSnackbar(`Successfully uploaded ${uploadedAssets.length} asset(s)`, { variant: "success" });

    // Reset file input
    event.target.value = "";
  };

  const handleRemoveAsset = async (assetId: string) => {
    const assetToRemove = assets.find((asset) => asset.id === assetId);
    if (!assetToRemove) return;

    if (!id) {
      enqueueSnackbar("Cannot delete asset: post ID is missing", { variant: "error" });
      return;
    }

    // Delete from server (assetId is now the URL)
    const token = localStorage.getItem("token");
    const response = await fetch(`/api/admin/blog/asset?postId=${id}&assetUrl=${encodeURIComponent(assetId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      enqueueSnackbar("Failed to delete asset from server", { variant: "error" });
      return;
    }

    setAssets(assets.filter((asset) => asset.id !== assetId));
    enqueueSnackbar("Asset removed", { variant: "success" });
  };

  const handleToggleFeatured = (assetId: string) => {
    setAssets(
      assets.map((asset) => ({
        ...asset,
        isFeatured: asset.id === assetId ? !asset.isFeatured : false, // Only one can be featured
      }))
    );
  };

  const handleInsertImageMarkdown = (imagePath: string, altText: string = "") => {
    const markdownCode = `![${altText}](${imagePath})`;
    const cursorPos = markdown.length;
    const newMarkdown = markdown.slice(0, cursorPos) + markdownCode + "\n\n" + markdown.slice(cursorPos);
    setMarkdown(newMarkdown);
    enqueueSnackbar("Image markdown inserted", { variant: "success" });
  };

  const handleSave = async () => {
    if (!title.trim() || !slug.trim() || !markdown.trim() || !publishDate) {
      enqueueSnackbar("Please fill in all required fields", { variant: "error" });
      return;
    }

    setIsSaving(true);

    // Assets are now stored as media IDs (strings)
    // Use stored media IDs (from asset.id) when saving
    const assetMediaIds = assets.map((asset) => asset.id).filter((id) => id);
    
    const featuredAsset = assets.find((asset) => asset.isFeatured);
    const featuredImageId = featuredAsset ? featuredAsset.id : null;

    const postData = {
      title: title.trim(),
      slug: slug.trim(),
      markdown: markdown.trim(),
      publishDate: new Date(publishDate).toISOString(),
      assets: assetMediaIds,
      featuredImage: featuredImageId || null,
      categories: categories || [],
      tags: tags || [],
      featured: featured || false,
      published: published || false,
    };

    if (id) {
      put(`/api/admin/blog/${id}`, postData)
        .then(() => {
          enqueueSnackbar("Blog post updated successfully", { variant: "success" });
          setIsSaving(false);
          // Refresh post data to get latest from server
          return fetchPost();
        })
        .catch((error) => {
          setIsSaving(false);
          const errorMessage = error instanceof Error ? error.message : "Failed to save blog post";
          enqueueSnackbar(errorMessage, { variant: "error" });
        });
    } else {
      post<{ post: BlogPost }>("/api/admin/blog", postData)
        .then((response) => {
          enqueueSnackbar("Blog post created successfully", { variant: "success" });
          setIsSaving(false);
          // Navigate to edit page so user can upload images
          navigate(`/admin/blog/${response.post._id}/edit`);
        })
        .catch((error) => {
          setIsSaving(false);
          const errorMessage = error instanceof Error ? error.message : "Failed to save blog post";
          enqueueSnackbar(errorMessage, { variant: "error" });
        });
    }
  };

  const handleDelete = async () => {
    if (!id) {
      enqueueSnackbar("Cannot delete a post that hasn't been created yet", { variant: "error" });
      return;
    }

    if (!window.confirm("Are you sure you want to delete this blog post? This action cannot be undone.")) {
      return;
    }

    await del(`/api/admin/blog/${id}`);
    enqueueSnackbar("Blog post deleted successfully", { variant: "success" });
    navigate("/admin/blog");
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Box sx={{ mb: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton onClick={() => navigate("/admin/blog")}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            Blog Management
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<PreviewIcon />}
            onClick={() => setIsPreviewOpen(true)}
            disabled={!title || !markdown}
          >
            Preview
          </Button>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : id ? "Update" : "Create"}
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Tabs
          value={currentTab}
          onChange={(e, newValue) => {
            // Prevent switching to disabled tabs
            if (newValue === 1) {
              if (!id) {
                enqueueSnackbar("Please create the blog post first", { variant: "info" });
                return;
              }
            }
            setCurrentTab(newValue);
          }}
          variant="fullWidth"
          sx={{
            width: "100%",
            backgroundColor: "grey.800",
            borderRadius: 1,
            "& .MuiTabs-flexContainer": {
              justifyContent: "space-between",
            },
            "& .MuiTab-root": {
              backgroundColor: "grey.800",
              color: "grey.300",
              "&.Mui-selected": {
                backgroundColor: "grey.700",
                color: "white",
              },
              "&.Mui-disabled": {
                opacity: 0.5,
              },
            },
          }}
        >
          <Tab label="General" />
          <Tab label="Misc" disabled={!id} />
        </Tabs>
      </Box>

      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ p: 4 }}>
          {currentTab === 0 && (
            <Stack spacing={3}>
              <TextField
                fullWidth
                label="Title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                required
              />
              <TextField
                fullWidth
                label="Slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                helperText="URL-friendly identifier (auto-generated from title)"
              />
              <TextField
                fullWidth
                label="Markdown Content"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                multiline
                rows={15}
                required
                helperText="Write your blog post content in Markdown"
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="outlined"
                  onClick={() => {
                    if (!id) {
                      enqueueSnackbar("Please create the blog post first", { variant: "info" });
                      return;
                    }
                    setIsAssetsModalOpen(true);
                  }}
                  disabled={!id}
                >
                  Assets
                </Button>
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Featured Image
                </Typography>
                {assets.find((asset) => asset.isFeatured) ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                    <Avatar
                      src={assets.find((asset) => asset.isFeatured)!.type.startsWith("image/") ? assets.find((asset) => asset.isFeatured)!.path : undefined}
                      variant="square"
                      sx={{
                        width: 100,
                        height: 100,
                        border: "2px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                      }}
                    >
                      {assets.find((asset) => asset.isFeatured)!.type.startsWith("video/") ? "V" : "F"}
                    </Avatar>
                    <Typography variant="body2" color="text.secondary">
                      {assets.find((asset) => asset.isFeatured)!.path.split("/").pop()}
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => {
                        const featuredAsset = assets.find((asset) => asset.isFeatured);
                        if (featuredAsset) {
                          handleToggleFeatured(featuredAsset.id);
                        }
                      }}
                    >
                      Clear
                    </Button>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    No featured image selected. Select an asset and mark it as featured.
                  </Typography>
                )}
              </Box>
              <TextField
                fullWidth
                label="Publish Date"
                type="datetime-local"
                value={publishDate}
                onChange={(e) => setPublishDate(e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                required
              />
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Categories
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
                  {categories.map((category) => (
                    <Chip
                      key={category}
                      label={category}
                      onDelete={() => handleRemoveCategory(category)}
                      size="small"
                    />
                  ))}
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Add category"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Button size="small" onClick={handleAddCategory}>
                          Add
                        </Button>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Tags
                </Typography>
                <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
                  {tags.map((tag) => (
                    <Chip key={tag} label={tag} onDelete={() => handleRemoveTag(tag)} size="small" variant="outlined" />
                  ))}
                </Box>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Add tag"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <Button size="small" onClick={handleAddTag}>
                          Add
                        </Button>
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
              {/* Featured and Published switches at bottom */}
              <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
                <FormControlLabel
                  control={<Switch checked={featured} onChange={(e) => setFeatured(e.target.checked)} />}
                  label="Featured (appears first in blog listings)"
                />
                <FormControlLabel
                  control={<Switch checked={published} onChange={(e) => setPublished(e.target.checked)} />}
                  label="Published"
                />
              </Box>
            </Stack>
          )}

          {currentTab === 1 && (
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: "error.main" }}>
                  Danger Zone
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={handleDelete}
                  sx={{ mt: 1 }}
                >
                  Delete Post
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Permanently delete this blog post. This action cannot be undone.
                </Typography>
              </Box>
            </Stack>
          )}
        </Box>
      </Card>

      {/* Assets Modal */}
      <Dialog open={isAssetsModalOpen} onClose={() => setIsAssetsModalOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6">Assets</Typography>
            <IconButton onClick={() => setIsAssetsModalOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Assets
              </Typography>
              <input
                accept="*/*"
                style={{ display: "none" }}
                id="asset-upload"
                type="file"
                multiple
                onChange={handleAssetUpload}
              />
              <label htmlFor="asset-upload">
                <Button
                  variant="outlined"
                  component="span"
                  startIcon={<CloudUploadIcon />}
                  disabled={isUploading}
                  fullWidth
                >
                  {isUploading ? "Uploading..." : "Upload Assets"}
                </Button>
              </label>
              {assets.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {assets.length} asset(s) uploaded
                  </Typography>
                  <Stack spacing={2}>
                    {assets.map((asset) => {
                      // Extract just the filename from the URL/path
                      const urlParts = asset.path.split("/");
                      const filename = urlParts[urlParts.length - 1];
                      
                      return (
                        <Card
                          key={asset.id}
                          elevation={0}
                          sx={{
                            border: "1px solid",
                            borderColor: "divider",
                            p: 2,
                          }}
                        >
                          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                            {/* 256x256 Avatar/Thumbnail */}
                            <Box
                              component="a"
                              href={asset.path}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                textDecoration: "none",
                                "&:hover": {
                                  opacity: 0.9,
                                },
                              }}
                            >
                              <Avatar
                                src={asset.type.startsWith("image/") ? asset.path : undefined}
                                alt={filename}
                                variant="square"
                                sx={{
                                  width: 256,
                                  height: 256,
                                  flexShrink: 0,
                                  cursor: "pointer",
                                  border: "2px solid",
                                  borderColor: "divider",
                                  backgroundColor: asset.type.startsWith("image/") ? "transparent" : "grey.900",
                                  fontSize: "10rem",
                                  fontWeight: 900,
                                  color: "primary.main",
                                  textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
                                  borderRadius: 4,
                                  "&:hover": {
                                    borderColor: "primary.main",
                                  },
                                }}
                              >
                                {asset.type.startsWith("image/") ? null : asset.type.startsWith("video/") ? "V" : "F"}
                              </Avatar>
                            </Box>

                            {/* Filename and Actions to the right of avatar */}
                            <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, justifyContent: "space-between", minHeight: 256 }}>
                              {/* Filename at the top */}
                              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                  {filename}
                                </Typography>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleRemoveAsset(asset.id)}
                                  sx={{
                                    "&:hover": {
                                      backgroundColor: "error.light",
                                      color: "error.contrastText",
                                    },
                                  }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>

                              {/* Actions at the bottom right */}
                              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                                <FormControlLabel
                                  control={
                                    <Switch
                                      checked={asset.isFeatured}
                                      onChange={() => handleToggleFeatured(asset.id)}
                                      size="small"
                                    />
                                  }
                                  label="Featured"
                                  labelPlacement="start"
                                  sx={{ margin: 0 }}
                                />
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => {
                                    const markdownCode = asset.type.startsWith("image/")
                                      ? `![${title}](${asset.path})`
                                      : `[${title}](${asset.path})`;
                                    navigator.clipboard.writeText(markdownCode);
                                    enqueueSnackbar("Markdown copied to clipboard", { variant: "success" });
                                  }}
                                >
                                  Copy Markdown
                                </Button>
                              </Box>
                            </Box>
                          </Box>
                        </Card>
                      );
                    })}
                  </Stack>
                </Box>
              )}
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} maxWidth="lg" fullWidth>
        <Box sx={{ mt: 2 }}>
          {title && markdown ? (
            <BlogPostDetailContent
              blogBasePath=""
              post={
                {
                  _id: id || "preview",
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
              onBackClick={() => setIsPreviewOpen(false)}
            />
          ) : (
            <Typography variant="body1" color="text.secondary">
              Please add a title and content to preview
            </Typography>
          )}
        </Box>
      </Dialog>
    </Container>
  );
}

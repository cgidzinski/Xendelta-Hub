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
import { BlogPost as BlogPostType } from "../External/BlogPublic/components/BlogContent";

interface BlogImage {
  path: string;
  id: string;
  isFeatured: boolean;
}

interface BlogPost {
  _id: string;
  title: string;
  slug: string;
  markdown: string;
  publishDate: string;
  image?: string;
  images?: string[];
  featuredImage?: string;
  categories: string[];
  tags: string[];
  featured: boolean;
  author: {
    _id: string;
    username: string;
    avatar?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

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

  // Form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [images, setImages] = useState<BlogImage[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [featured, setFeatured] = useState(false);

  useEffect(() => {
    if (id) {
      fetchPost();
    } else {
      // Set default publish date for new posts
      setPublishDate(new Date().toISOString().slice(0, 16));
      setIsLoading(false);
    }
  }, [id]);

  const fetchPost = async () => {
    setIsLoading(true);
    const data = await get<{ posts: BlogPost[] }>("/api/admin/blog");
    const post = data.posts.find((p) => p._id === id);
    if (post) {
      setTitle(post.title);
      setSlug(post.slug);
      setMarkdown(post.markdown);
      setPublishDate(new Date(post.publishDate).toISOString().slice(0, 16));

      // Load images - support both old (image) and new (images array) formats
      const imageList: BlogImage[] = [];
      if (post.images && post.images.length > 0) {
        post.images.forEach((imgPath) => {
          // Extract imageId from path (e.g., /blog-images/img-123.jpg -> img-123)
          const imageId = imgPath.split("/").pop()?.split(".")[0] || `img-${Date.now()}`;
          imageList.push({
            path: imgPath,
            id: imageId,
            isFeatured: post.featuredImage === imgPath,
          });
        });
      } else if (post.image) {
        // Legacy: single image
        const imageId = post.image.split("/").pop()?.split(".")[0] || `img-${Date.now()}`;
        imageList.push({
          path: post.image,
          id: imageId,
          isFeatured: true,
        });
      }
      setImages(imageList);

      setCategories(post.categories || []);
      setTags(post.tags || []);
      setFeatured(post.featured || false);
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

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const token = localStorage.getItem("token");
    const uploadedImages: BlogImage[] = [];

    // Upload each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/admin/blog/upload-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        enqueueSnackbar(error.message || `Failed to upload image ${i + 1}`, { variant: "error" });
        continue;
      }

      const data = await response.json();
      uploadedImages.push({
        path: data.data.imagePath,
        id: data.data.imageId,
        isFeatured: false,
      });
    }

    // Add uploaded images to the list
    setImages([...images, ...uploadedImages]);
    setIsUploading(false);
    enqueueSnackbar(`Successfully uploaded ${uploadedImages.length} image(s)`, { variant: "success" });

    // Reset file input
    event.target.value = "";
  };

  const handleRemoveImage = async (imageId: string) => {
    const imageToRemove = images.find((img) => img.id === imageId);
    if (!imageToRemove) return;

    // Delete from server if it's an uploaded image (not just in memory)
    if (imageToRemove.path.startsWith("/blog-images/")) {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/blog/image/${imageId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        enqueueSnackbar("Failed to delete image from server", { variant: "error" });
        return;
      }
    }

    setImages(images.filter((img) => img.id !== imageId));
    enqueueSnackbar("Image removed", { variant: "success" });
  };

  const handleToggleFeatured = (imageId: string) => {
    setImages(
      images.map((img) => ({
        ...img,
        isFeatured: img.id === imageId ? !img.isFeatured : false, // Only one can be featured
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

    const imagePaths = images.map((img) => img.path);
    const featuredImagePath = images.find((img) => img.isFeatured)?.path || null;

    const postData = {
      title: title.trim(),
      slug: slug.trim(),
      markdown: markdown.trim(),
      publishDate: new Date(publishDate).toISOString(),
      images: imagePaths,
      featuredImage: featuredImagePath || undefined,
      image: featuredImagePath || undefined, // Legacy support
      categories,
      tags,
      featured,
    };

    if (id) {
      await put(`/api/admin/blog/${id}`, postData);
      enqueueSnackbar("Blog post updated successfully", { variant: "success" });
      setIsSaving(false);
      // Refresh post data to get latest from server
      await fetchPost();
    } else {
      await post("/api/admin/blog", postData);
      enqueueSnackbar("Blog post created successfully", { variant: "success" });
      setIsSaving(false);
      navigate("/admin/blog");
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
          onChange={(e, newValue) => setCurrentTab(newValue)}
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
            },
          }}
        >
          <Tab label="General" />
          <Tab label="Media" />
          <Tab label="Misc" />
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
              <FormControlLabel
                control={<Switch checked={featured} onChange={(e) => setFeatured(e.target.checked)} />}
                label="Featured (appears first in blog listings)"
              />
            </Stack>
          )}

          {currentTab === 1 && (
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Images
                </Typography>
                <input
                  accept="image/*"
                  style={{ display: "none" }}
                  id="image-upload"
                  type="file"
                  multiple
                  onChange={handleImageUpload}
                />
                <label htmlFor="image-upload">
                  <Button
                    variant="outlined"
                    component="span"
                    startIcon={<CloudUploadIcon />}
                    disabled={isUploading}
                    fullWidth
                  >
                    {isUploading ? "Uploading..." : "Upload Images"}
                  </Button>
                </label>
                {images.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {images.length} image(s) uploaded
                    </Typography>
                    <Stack spacing={2}>
                      {images.map((img) => (
                        <Card
                          key={img.id}
                          elevation={0}
                          sx={{
                            border: "1px solid",
                            borderColor: "divider",
                            p: 2,
                            position: "relative",
                          }}
                        >
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveImage(img.id)}
                            sx={{
                              position: "absolute",
                              top: 8,
                              right: 8,
                              backgroundColor: "background.paper",
                              "&:hover": {
                                backgroundColor: "error.light",
                                color: "error.contrastText",
                              },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                          <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                            <img
                              src={img.path}
                              alt="Preview"
                              style={{ maxWidth: "200px", maxHeight: "200px", borderRadius: "8px", objectFit: "cover" }}
                            />
                            <Box sx={{ flex: 1 }}>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={img.isFeatured}
                                    onChange={() => handleToggleFeatured(img.id)}
                                    size="small"
                                  />
                                }
                                label="Featured Image"
                              />
                              <Box sx={{ mt: 1 }}>
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => {
                                    const markdownCode = `![${title}](${img.path})`;
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
                      ))}
                    </Stack>
                  </Box>
                )}
              </Box>
            </Stack>
          )}

          {currentTab === 2 && (
            <Stack spacing={3}>
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
              {id && (
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
              )}
            </Stack>
          )}
        </Box>
      </Card>

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
                  image: images.find((img) => img.isFeatured)?.path || undefined,
                  images: images.map((img) => img.path),
                  featuredImage: images.find((img) => img.isFeatured)?.path || undefined,
                  categories: categories,
                  tags: tags,
                  featured: featured,
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

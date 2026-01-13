import { useState, useEffect } from "react";
import {
  Box,
  Container,
  Card,
  Typography,
  Button,
  Tabs,
  Tab,
  IconButton,
  CircularProgress,
} from "@mui/material";
import {
  Save as SaveIcon,
  Preview as PreviewIcon,
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { BlogAssetWithMetadata } from "../../types/BlogAssetWithMetadata";
import { useAdminBlog } from "../../hooks/admin/useAdminBlog";
import FormFields from "./BlogPostForm/components/FormFields";
import AssetManager from "./BlogPostForm/components/AssetManager";
import PreviewPanel from "./BlogPostForm/components/PreviewPanel";

// Client-side slug generation (same logic as server)
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BlogPostForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const {
    posts,
    isLoading: isLoadingPosts,
    createPost: createPostMutation,
    updatePost,
    deletePost,
    isCreating,
    isUpdating,
    isDeleting,
    uploadAsset,
    isUploadingAsset,
    deleteAsset,
    isDeletingAsset,
  } = useAdminBlog();
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
    if (id && posts.length > 0) {
      fetchPost();
    } else if (!id) {
      setPublishDate(new Date().toISOString().slice(0, 16));
    }
  }, [id, posts]);

  useEffect(() => {
    if (!id && currentTab > 0) {
      setCurrentTab(0);
    }
  }, [id, currentTab]);

  const fetchPost = () => {
    const post = posts.find((p) => p._id === id);
    if (post) {
      setTitle(post.title);
      setSlug(post.slug);
      setMarkdown(post.markdown);
      setPublishDate(new Date(post.publishDate).toISOString().slice(0, 16));

      const assetList: BlogAssetWithMetadata[] = [];
      if (post.assets && post.assets.length > 0) {
        post.assets.forEach((assetUrl: string) => {
          const urlParts = assetUrl.split("/");
          const filename = urlParts[urlParts.length - 1];
          const ext = filename.split(".").pop()?.toLowerCase() || "";
          let mimeType = "application/octet-stream";
          if (["jpg", "jpeg"].includes(ext)) mimeType = "image/jpeg";
          else if (ext === "png") mimeType = "image/png";
          else if (ext === "gif") mimeType = "image/gif";
          else if (ext === "mp4") mimeType = "video/mp4";
          else if (ext === "pdf") mimeType = "application/pdf";

          assetList.push({
            path: assetUrl,
            gcsPath: undefined,
            type: mimeType,
            id: assetUrl,
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
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!id) {
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

    const uploadedAssets: BlogAssetWithMetadata[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await uploadAsset({ file, postId: id });

      if (result && result.url) {
        uploadedAssets.push({
          path: result.url,
          gcsPath: undefined,
          type: result.mimeType,
          id: result.url,
          isFeatured: false,
        });
      } else {
        enqueueSnackbar(`Failed to upload asset ${i + 1}`, { variant: "error" });
      }
    }

    setAssets([...assets, ...uploadedAssets]);
    if (uploadedAssets.length > 0) {
      enqueueSnackbar(`Successfully uploaded ${uploadedAssets.length} asset(s)`, { variant: "success" });
    }

    event.target.value = "";
  };

  const handleRemoveAsset = async (assetId: string) => {
    const assetToRemove = assets.find((asset) => asset.id === assetId);
    if (!assetToRemove) return;

    if (!id) {
      enqueueSnackbar("Cannot delete asset: post ID is missing", { variant: "error" });
      return;
    }

    deleteAsset(id, assetId);
    setAssets(assets.filter((asset) => asset.id !== assetId));
    enqueueSnackbar("Asset removed", { variant: "success" });
  };

  const handleToggleFeatured = (assetId: string) => {
    setAssets(
      assets.map((asset) => ({
        ...asset,
        isFeatured: asset.id === assetId ? !asset.isFeatured : false,
      }))
    );
  };

  const handleSave = async () => {
    if (!title.trim() || !slug.trim() || !markdown.trim() || !publishDate) {
      enqueueSnackbar("Please fill in all required fields", { variant: "error" });
      return;
    }

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
      updatePost(id, postData, {
        onSuccess: () => {
          enqueueSnackbar("Blog post updated successfully", { variant: "success" });
          fetchPost();
        },
        onError: (error) => {
          const errorMessage = error instanceof Error ? error.message : "Failed to update blog post";
          enqueueSnackbar(errorMessage, { variant: "error" });
        },
      });
    } else {
      createPostMutation(postData, {
        onSuccess: (newPost) => {
          enqueueSnackbar("Blog post created successfully", { variant: "success" });
          navigate(`/admin/blog/${newPost._id}/edit`);
        },
        onError: (error) => {
          const errorMessage = error instanceof Error ? error.message : "Failed to save blog post";
          enqueueSnackbar(errorMessage, { variant: "error" });
        },
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

    deletePost(id);
    enqueueSnackbar("Blog post deleted successfully", { variant: "success" });
    navigate("/admin/blog");
  };

  if (id && isLoadingPosts) {
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
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={isCreating || isUpdating}>
            {isCreating || isUpdating ? "Saving..." : id ? "Update" : "Create"}
          </Button>
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Tabs
          value={currentTab}
          onChange={(e, newValue) => {
            if (newValue === 1) {
              if (!id) {
                enqueueSnackbar("Please create the blog post first", { variant: "info" });
                return;
              }
            }
            setCurrentTab(newValue);
          }}
          variant="fullWidth"
        >
          <Tab label="General" />
          <Tab label="Misc" disabled={!id} />
        </Tabs>
      </Box>

      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ p: 4 }}>
          {currentTab === 0 && (
            <FormFields
              title={title}
              slug={slug}
              markdown={markdown}
              publishDate={publishDate}
              categories={categories}
              categoryInput={categoryInput}
              tags={tags}
              tagInput={tagInput}
              featured={featured}
              published={published}
              assets={assets}
              onTitleChange={handleTitleChange}
              onSlugChange={setSlug}
              onMarkdownChange={setMarkdown}
              onPublishDateChange={setPublishDate}
              onAddCategory={handleAddCategory}
              onRemoveCategory={handleRemoveCategory}
              onCategoryInputChange={setCategoryInput}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              onTagInputChange={setTagInput}
              onFeaturedChange={setFeatured}
              onPublishedChange={setPublished}
              onOpenAssets={() => {
                if (!id) {
                  enqueueSnackbar("Please create the blog post first", { variant: "info" });
                  return;
                }
                setIsAssetsModalOpen(true);
              }}
              onToggleFeaturedAsset={handleToggleFeatured}
              hasPostId={!!id}
            />
          )}

          {currentTab === 1 && (
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
        </Box>
      </Card>

      <AssetManager
        open={isAssetsModalOpen}
        onClose={() => setIsAssetsModalOpen(false)}
        assets={assets}
        isUploading={isUploadingAsset}
        title={title}
        onUpload={handleAssetUpload}
        onRemove={handleRemoveAsset}
        onToggleFeatured={handleToggleFeatured}
      />

      <PreviewPanel
        open={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={title}
        slug={slug}
        markdown={markdown}
        publishDate={publishDate}
        assets={assets}
        categories={categories}
        tags={tags}
        featured={featured}
        published={published}
        postId={id}
      />
    </Container>
  );
}

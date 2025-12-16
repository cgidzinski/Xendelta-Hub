import { Stack, TextField, Box, Typography, Chip, InputAdornment, Button, FormControlLabel, Switch } from "@mui/material";
import { BlogAssetWithMetadata } from "../../../../types";

interface FormFieldsProps {
  title: string;
  slug: string;
  markdown: string;
  publishDate: string;
  categories: string[];
  categoryInput: string;
  tags: string[];
  tagInput: string;
  featured: boolean;
  published: boolean;
  assets: BlogAssetWithMetadata[];
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onMarkdownChange: (value: string) => void;
  onPublishDateChange: (value: string) => void;
  onAddCategory: () => void;
  onRemoveCategory: (category: string) => void;
  onCategoryInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onTagInputChange: (value: string) => void;
  onFeaturedChange: (value: boolean) => void;
  onPublishedChange: (value: boolean) => void;
  onOpenAssets: () => void;
  onToggleFeaturedAsset: (assetId: string) => void;
  hasPostId: boolean;
}

export default function FormFields({
  title,
  slug,
  markdown,
  publishDate,
  categories,
  categoryInput,
  tags,
  tagInput,
  featured,
  published,
  assets,
  onTitleChange,
  onSlugChange,
  onMarkdownChange,
  onPublishDateChange,
  onAddCategory,
  onRemoveCategory,
  onCategoryInputChange,
  onAddTag,
  onRemoveTag,
  onTagInputChange,
  onFeaturedChange,
  onPublishedChange,
  onOpenAssets,
  onToggleFeaturedAsset,
  hasPostId,
}: FormFieldsProps) {
  const featuredAsset = assets.find((asset) => asset.isFeatured);

  return (
    <Stack spacing={3}>
      <TextField
        fullWidth
        label="Title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        required
      />
      <TextField
        fullWidth
        label="Slug"
        value={slug}
        onChange={(e) => onSlugChange(e.target.value)}
        required
        helperText="URL-friendly identifier (auto-generated from title)"
      />
      <TextField
        fullWidth
        label="Markdown Content"
        value={markdown}
        onChange={(e) => onMarkdownChange(e.target.value)}
        multiline
        rows={15}
        required
        helperText="Write your blog post content in Markdown"
      />
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="outlined" onClick={onOpenAssets} disabled={!hasPostId}>
          Assets
        </Button>
      </Box>
      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          Featured Image
        </Typography>
        {featuredAsset ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
            <Box
              component="img"
              src={featuredAsset.type.startsWith("image/") ? featuredAsset.path : undefined}
              alt="Featured"
              sx={{
                width: 100,
                height: 100,
                objectFit: "cover",
                border: "2px solid",
                borderColor: "divider",
                borderRadius: 2,
                backgroundColor: "grey.900",
              }}
            />
            <Typography variant="body2" color="text.secondary">
              {featuredAsset.path.split("/").pop()}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => onToggleFeaturedAsset(featuredAsset.id)}
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
        onChange={(e) => onPublishDateChange(e.target.value)}
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
              onDelete={() => onRemoveCategory(category)}
              size="small"
            />
          ))}
        </Box>
        <TextField
          fullWidth
          size="small"
          placeholder="Add category"
          value={categoryInput}
          onChange={(e) => onCategoryInputChange(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddCategory();
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Button size="small" onClick={onAddCategory}>
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
            <Chip key={tag} label={tag} onDelete={() => onRemoveTag(tag)} size="small" variant="outlined" />
          ))}
        </Box>
        <TextField
          fullWidth
          size="small"
          placeholder="Add tag"
          value={tagInput}
          onChange={(e) => onTagInputChange(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddTag();
            }
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Button size="small" onClick={onAddTag}>
                  Add
                </Button>
              </InputAdornment>
            ),
          }}
        />
      </Box>
      <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
        <FormControlLabel
          control={<Switch checked={featured} onChange={(e) => onFeaturedChange(e.target.checked)} />}
          label="Featured (appears first in blog listings)"
        />
        <FormControlLabel
          control={<Switch checked={published} onChange={(e) => onPublishedChange(e.target.checked)} />}
          label="Published"
        />
      </Box>
    </Stack>
  );
}


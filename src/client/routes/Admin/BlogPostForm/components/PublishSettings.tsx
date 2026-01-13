import { Box, Stack, Typography, FormControlLabel, Switch } from "@mui/material";
import { BlogAssetWithMetadata } from "../../../../types/BlogAssetWithMetadata";

interface PublishSettingsProps {
  featured: boolean;
  published: boolean;
  onFeaturedChange: (value: boolean) => void;
  onPublishedChange: (value: boolean) => void;
}

export default function PublishSettings({
  featured,
  published,
  onFeaturedChange,
  onPublishedChange,
}: PublishSettingsProps) {
  return (
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
  );
}


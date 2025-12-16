import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Button,
  Stack,
  Card,
  IconButton,
  Avatar,
  FormControlLabel,
  Switch,
} from "@mui/material";
import { CloudUpload as CloudUploadIcon, Close as CloseIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { BlogAssetWithMetadata } from "../../../../types";
import { useSnackbar } from "notistack";

interface AssetManagerProps {
  open: boolean;
  onClose: () => void;
  assets: BlogAssetWithMetadata[];
  isUploading: boolean;
  title: string;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (assetId: string) => void;
  onToggleFeatured: (assetId: string) => void;
}

export default function AssetManager({
  open,
  onClose,
  assets,
  isUploading,
  title,
  onUpload,
  onRemove,
  onToggleFeatured,
}: AssetManagerProps) {
  const { enqueueSnackbar } = useSnackbar();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6">Assets</Typography>
          <IconButton onClick={onClose}>
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
              onChange={onUpload}
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

                          <Box
                            sx={{
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                              justifyContent: "space-between",
                              minHeight: 256,
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                {filename}
                              </Typography>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => onRemove(asset.id)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>

                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={asset.isFeatured}
                                    onChange={() => onToggleFeatured(asset.id)}
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
  );
}


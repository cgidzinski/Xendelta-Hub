import { Box, Card, CardContent, Typography, Button, Avatar } from "@mui/material";
import { Notifications } from "@mui/icons-material";

interface AvatarUploadSectionProps {
  selectedFile: File | null;
  filePreviewUrl: string | null;
  isUploading: boolean;
  isUploadingAvatar: boolean;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
}

export default function AvatarUploadSection({
  selectedFile,
  filePreviewUrl,
  isUploading,
  isUploadingAvatar,
  onFileSelect,
  onUpload,
}: AvatarUploadSectionProps) {
  return (
    <Card elevation={2}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
          <Notifications color="primary" sx={{ mr: 1 }} />
          <Typography variant="h6">Avatar</Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <Button variant="outlined" component="label" disabled={isUploading || isUploadingAvatar}>
              Choose File
              <input
                type="file"
                hidden
                accept="image/jpeg,image/jpg,image/png,image/gif"
                onChange={onFileSelect}
              />
            </Button>
            <Button
              variant="contained"
              onClick={onUpload}
              disabled={!selectedFile || isUploading || isUploadingAvatar}
              sx={{ minWidth: 100 }}
            >
              {isUploading || isUploadingAvatar ? "Uploading..." : "Upload"}
            </Button>
          </Box>
          {selectedFile && (
            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              {filePreviewUrl && (
                <Avatar src={filePreviewUrl} sx={{ width: 128, height: 128, borderRadius: 2 }} />
              )}
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Selected: {selectedFile.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {(selectedFile.size / 1024).toFixed(2)} KB - Click "Upload" to apply
                </Typography>
              </Box>
            </Box>
          )}
          <Typography variant="caption" color="text.secondary">
            Supported formats: JPG, PNG, GIF, WEBP (Max 5MB)
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
}


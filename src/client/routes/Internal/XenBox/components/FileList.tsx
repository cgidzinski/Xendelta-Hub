import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Stack,
  Card,
  CardContent,
  CardActionArea,
  IconButton,
} from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import ScheduleIcon from "@mui/icons-material/Schedule";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import { XenBoxFile } from "../../../../types/XenBoxFile";
import { formatFileSize } from "../../../../utils/fileUtils";
import { format, formatDistanceToNow } from "date-fns";

interface FileListProps {
  files: XenBoxFile[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
}

export default function FileList({ files, isLoading, isError, error }: FileListProps) {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const handleFileClick = (fileId: string) => {
    navigate(`/internal/xenbox/${fileId}`);
  };

  const handleCopyUrl = (e: React.MouseEvent, file: XenBoxFile) => {
    e.stopPropagation(); // Prevent card click
    if (file.shareToken) {
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/xenbox/${file.shareToken}`;
      navigator.clipboard.writeText(shareUrl);
      enqueueSnackbar("URL copied to clipboard", { variant: "success" });
    }
  };

  const getMimeTypeLabel = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "Image";
    if (mimeType.startsWith("video/")) return "Video";
    if (mimeType.startsWith("audio/")) return "Audio";
    if (mimeType === "application/pdf") return "PDF";
    if (mimeType.includes("zip") || mimeType.includes("archive")) return "Archive";
    if (mimeType.includes("text")) return "Text";
    return "File";
  };

  const isExpired = (file: XenBoxFile) => {
    if (!file.expiry) return false;
    return new Date(file.expiry) <= new Date();
  };

  const getExpiryText = (file: XenBoxFile) => {
    if (!file.expiry) return "Timed";
    if (isExpired(file)) return "Expired";
    return `Expires in ${formatDistanceToNow(new Date(file.expiry), { addSuffix: false })}`;
  };

  const getExpiryColor = (file: XenBoxFile): "info" | "error" | "default" => {
    if (!file.expiry) return "default"; // Untimed = grey
    if (isExpired(file)) return "error"; // Expired = red
    return "info"; // Timed but not expired = blue
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return (
      <Alert severity="error">
        {error?.message || "Failed to load files"}
      </Alert>
    );
  }

  if (!files || files.length === 0) {
    return (
      <Alert severity="info">No files found. Upload your first file to get started.</Alert>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {files.map((file) => (
        <Card key={file._id} sx={{ width: "100%", position: "relative" }}>
          {file.shareToken && (
            <IconButton
              size="small"
              onClick={(e) => handleCopyUrl(e, file)}
              sx={{ 
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 1,
                bgcolor: "rgba(255,255,255,0.1)",
                "&:hover": { bgcolor: "rgba(255,255,255,0.2)" },
              }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          )}
          <CardActionArea onClick={() => handleFileClick(file._id)}>
            <CardContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 500, flexGrow: 1, wordBreak: "break-word", pr: file.shareToken ? 4 : 0 }}>
                    {file.filename}
                  </Typography>
                </Box>
                
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 1 }}>
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      Type: {getMimeTypeLabel(file.mimeType)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Size: {formatFileSize(file.size)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Uploaded: {format(new Date(file.createdAt), "MMM d, yyyy")}
                    </Typography>
                  </Box>
                  
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                    <Chip
                      icon={<LockIcon sx={{ fontSize: 14 }} />}
                      label="Password"
                      size="small"
                      color={file.hasPassword ? "success" : "default"}
                      variant="outlined"
                      sx={{ 
                        opacity: file.hasPassword ? 1 : 0.5,
                        borderColor: file.hasPassword ? undefined : "grey.400"
                      }}
                    />
                    <Chip
                      icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
                      label={getExpiryText(file)}
                      size="small"
                      color={getExpiryColor(file)}
                      variant="outlined"
                      sx={{ 
                        opacity: !file.expiry ? 0.5 : 1,
                        borderColor: !file.expiry ? "grey.400" : undefined
                      }}
                    />
                  </Stack>
                </Box>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}
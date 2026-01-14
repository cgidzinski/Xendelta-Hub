import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Box,
  Button,
  Paper,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Chip,
  InputAdornment,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import ClearIcon from "@mui/icons-material/Clear";
import { useTitle } from "../../../hooks/useTitle";
import { useSnackbar } from "notistack";
import { useXenbox, useXenboxFileSettings, useXenboxFiles } from "../../../hooks/useXenbox";
import { formatFileSize } from "../../../utils/fileUtils";
import { format } from "date-fns";

const EXPIRY_OPTIONS = [
  { label: "+1 Min", amount: 1, unit: "minute" as const },
  { label: "+1 Hour", amount: 1, unit: "hour" as const },
  { label: "+1 Day", amount: 1, unit: "day" as const },
  { label: "+1 Week", amount: 1, unit: "week" as const },
  { label: "+1 Month", amount: 1, unit: "month" as const },
];

const getMimeTypeLabel = (mimeType: string) => {
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("zip") || mimeType.includes("archive")) return "Archive";
  if (mimeType.includes("text")) return "Text";
  return "File";
};

export default function FileDetail() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { data: files, refetch } = useXenboxFiles();
  const { deleteFile, isDeleting } = useXenbox();
  const { mutateAsync: updateSettings, isPending: isUpdating } = useXenboxFileSettings();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  const file = files?.find((f) => f._id === fileId);

  useTitle(file ? `XenBox - ${file.filename}` : "XenBox - File Detail");

  useEffect(() => {
    if (!file && files && files.length > 0) {
      // File not found, redirect to list
      navigate("/internal/xenbox");
    }
  }, [file, files, navigate]);

  const shareUrl = useMemo(() => {
    if (file?.shareToken) {
      return `${window.location.origin}/xenbox/${file.shareToken}`;
    }
    return null;
  }, [file?.shareToken]);

  useEffect(() => {
    setExpiryDate(file?.expiry ? new Date(file.expiry) : null);
    setPassword(file?.password || "");
  }, [file?.expiry, file?.password]);

  const handleDelete = () => {
    if (!fileId) return;

    deleteFile(fileId, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        enqueueSnackbar("File deleted successfully", { variant: "success" });
        navigate("/internal/xenbox");
      },
      onError: (error: Error) => {
        enqueueSnackbar(error.message || "Failed to delete file", { variant: "error" });
      },
    });
  };

  const handleSaveSettings = async () => {
    if (!fileId) return;

    await updateSettings({
      fileId,
      settings: {
        password: password || null,
        expiry: expiryDate?.toISOString() || null,
      },
    });
    refetch();
    enqueueSnackbar("Settings saved successfully", { variant: "success" });
  };

  const handleAddTime = (amount: number, unit: "minute" | "hour" | "day" | "week" | "month") => {
    const baseDate = expiryDate && expiryDate > new Date() ? expiryDate : new Date();
    const newDate = new Date(baseDate);
    const multipliers = { minute: 60 * 1000, hour: 3600 * 1000, day: 86400 * 1000, week: 604800 * 1000, month: 2592000000 };
    newDate.setTime(newDate.getTime() + amount * (unit === "month" ? 0 : multipliers[unit]));
    if (unit === "month") newDate.setMonth(newDate.getMonth() + amount);
    setExpiryDate(newDate);
  };

  const handleClearExpiry = () => {
    setExpiryDate(null);
  };

  const handleCopyUrl = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setUrlCopied(true);
      enqueueSnackbar("URL copied to clipboard", { variant: "success" });
      setTimeout(() => setUrlCopied(false), 2000);
    }
  };

  const fileInfo = useMemo(
    () =>
      file
        ? [
            { label: "File Size", value: formatFileSize(file.size) },
            { label: "MIME Type", value: file.mimeType },
            { label: "Uploaded", value: format(new Date(file.createdAt), "PPpp") },
          ]
        : [],
    [file]
  );

  if (!file) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}>
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        <IconButton onClick={() => navigate("/internal/xenbox")} sx={{ flexShrink: 0 }}>
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexGrow: 1, minWidth: 0 }}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            File Details
          </Typography>
          {shareUrl && (
            <IconButton
              onClick={handleCopyUrl}
              color={urlCopied ? "success" : "default"}
              sx={{ flexShrink: 0 }}
              size="small"
              title="Copy share link"
            >
              <ContentCopyIcon />
            </IconButton>
          )}
        </Box>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", flexShrink: 0 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setDeleteDialogOpen(true)}
            disabled={isDeleting}
            size="small"
          >
            Delete
          </Button>
          <Button variant="contained" onClick={handleSaveSettings} disabled={isUpdating} size="small">
            {isUpdating ? "Saving..." : "Save Settings"}
          </Button>
        </Box>
      </Box>

      {file?.hasPassword && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This file requires a password to download
        </Alert>
      )}
      {file?.expiry && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This link expires on {format(new Date(file.expiry), "PPpp")}
        </Alert>
      )}

      <Paper sx={{ p: { xs: 1.5, sm: 2 }, overflow: "hidden", mb: 3 }}>
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="h6" sx={{ mb: 0.5, wordBreak: "break-word" }}>
            {file.filename}
          </Typography>
          <Chip label={getMimeTypeLabel(file.mimeType)} size="small" />
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {fileInfo.map(({ label, value }) => (
            <Box key={label}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
                {label}
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 3 }, overflow: "hidden" }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Share Settings
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 3 }}>
          <TextField
            label="Password (leave empty to remove)"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={file?.hasPassword ? "Enter new password or leave empty" : "Set a password"}
            helperText="Optional: Protect file with a password"
            fullWidth
            InputProps={{
              startAdornment: file?.hasPassword ? (
                <LockIcon sx={{ mr: 1, color: "text.secondary" }} />
              ) : (
                <LockOpenIcon sx={{ mr: 1, color: "text.secondary" }} />
              ),
              endAdornment: password ? (
                <InputAdornment position="end">
                  <IconButton edge="end" onClick={() => setPassword("")} size="small" sx={{ mr: -1 }}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Expiry Time
            </Typography>
            <Box sx={{ mb: 2, p: 2, bgcolor: "background.default", borderRadius: 1 }}>
              <Typography variant="body1" sx={{ fontWeight: 500, mb: 0.5 }}>
                {expiryDate ? format(expiryDate, "PPpp") : "No expiry set"}
              </Typography>
              {expiryDate && expiryDate <= new Date() && (
                <Typography variant="body2" color="error">
                  Expired
                </Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 2 }}>
              <Button
                variant={expiryDate === null ? "contained" : "outlined"}
                size="small"
                onClick={handleClearExpiry}
              >
                None
              </Button>
              {EXPIRY_OPTIONS.map(({ label, amount, unit }) => (
                <Button
                  key={label}
                  variant="outlined"
                  size="small"
                  onClick={() => handleAddTime(amount, unit)}
                >
                  {label}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete File</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to delete "{file.filename}"? This action cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Paper,
  CircularProgress,
  Alert,
  TextField,
  IconButton,
  Chip,
  InputAdornment,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import ClearIcon from "@mui/icons-material/Clear";
import { useSnackbar } from "notistack";
import { format } from "date-fns";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTitle } from "../../../hooks/useTitle";
import { fileShareUrl, useXendriveActions, useXendriveFile } from "../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../utils/fileUtils";
import DriveBreadcrumbs from "./components/DriveBreadcrumbs";
import { XENDRIVE_ROOT, folderPath } from "./paths";

const EXPIRY_OPTIONS = [
  { label: "+1 Min", amount: 1, unit: "minute" as const },
  { label: "+1 Hour", amount: 1, unit: "hour" as const },
  { label: "+1 Day", amount: 1, unit: "day" as const },
  { label: "+1 Week", amount: 1, unit: "week" as const },
  { label: "+1 Month", amount: 1, unit: "month" as const },
];

const MS = { minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 };

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
  const confirm = useConfirm();
  const { data, isLoading, isError, error, refetch } = useXendriveFile(fileId);
  const { deleteFile, updateFileSettings } = useXendriveActions();

  const file = data?.file;
  const breadcrumb = data?.breadcrumb ?? [];
  const backTo = file?.folder_id ? folderPath(file.folder_id) : XENDRIVE_ROOT;

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  useTitle(file ? `XenDrive - ${file.name}` : "XenDrive - File");

  useEffect(() => {
    setName(file?.name ?? "");
    setExpiryDate(file?.expiry ? new Date(file.expiry) : null);
    setPassword(file?.password || "");
  }, [file?.name, file?.expiry, file?.password]);

  const shareUrl = useMemo(() => (file?.shareToken ? fileShareUrl(file.shareToken) : null), [file?.shareToken]);

  const handleDelete = async () => {
    if (!file) return;
    const ok = await confirm({
      title: "Delete this file?",
      message: `"${file.name}" will be deleted for good, and its link stops working.`,
      confirmLabel: "Delete file",
    });
    if (!ok) return;
    deleteFile.mutate(file._id, {
      onSuccess: () => {
        enqueueSnackbar("File deleted", { variant: "success" });
        navigate(backTo);
      },
      onError: (e: Error) => enqueueSnackbar(e.message || "Failed to delete file", { variant: "error" }),
    });
  };

  const handleSave = async () => {
    if (!file) return;
    try {
      await updateFileSettings.mutateAsync({
        fileId: file._id,
        settings: {
          name: name.trim() || file.name,
          password: password || null,
          expiry: expiryDate?.toISOString() || null,
        },
      });
      refetch();
      enqueueSnackbar("Saved", { variant: "success" });
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't save", { variant: "error" });
    }
  };

  const addTime = (amount: number, unit: "minute" | "hour" | "day" | "week" | "month") => {
    const base = expiryDate && expiryDate > new Date() ? expiryDate : new Date();
    const next = new Date(base);
    if (unit === "month") next.setMonth(next.getMonth() + amount);
    else next.setTime(next.getTime() + amount * MS[unit]);
    setExpiryDate(next);
  };

  const copyUrl = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setUrlCopied(true);
    enqueueSnackbar("Link copied", { variant: "success" });
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const info = file
    ? [
        { label: "File size", value: formatFileSize(file.size) },
        { label: "Type", value: file.mimeType },
        { label: "Uploaded", value: format(new Date(file.createdAt), "PPpp") },
      ]
    : [];

  if (isError) {
    return (
      <PageContainer>
        <ErrorDisplay error={error ?? null} title="Couldn't load this file" onRetry={() => refetch()} />
      </PageContainer>
    );
  }

  if (isLoading || !file) {
    return (
      <PageContainer>
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="File"
        onBack={() => navigate(backTo)}
        actions={
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {shareUrl && (
              <IconButton
                onClick={copyUrl}
                color={urlCopied ? "success" : "default"}
                aria-label="Copy link"
                size="small"
              >
                <ContentCopyIcon />
              </IconButton>
            )}
            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDelete} size="small">
              Delete
            </Button>
            <Button variant="contained" onClick={handleSave} disabled={updateFileSettings.isPending} size="small">
              {updateFileSettings.isPending ? "Saving..." : "Save"}
            </Button>
          </Box>
        }
      />

      <DriveBreadcrumbs crumbs={breadcrumb} folderTo={folderPath} rootTo={XENDRIVE_ROOT} />

      {file.hasPassword && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This file's link asks for a password
        </Alert>
      )}
      {file.expiry && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This file's link expires on {format(new Date(file.expiry), "PPpp")}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 3 }}>
        <Box sx={{ mb: 1.5 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            slotProps={{ htmlInput: { maxLength: 255 } }}
            sx={{ mb: 1 }}
          />
          <Chip label={getMimeTypeLabel(file.mimeType)} size="small" />
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {info.map(({ label, value }) => (
            <Box key={label}>
              <Typography variant="body2" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Share settings
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Password (leave empty to remove)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={file.hasPassword ? "Enter new password or leave empty" : "Set a password"}
            helperText="Optional: protect this file's link with a password"
            fullWidth
            slotProps={{
              input: {
                startAdornment: file.hasPassword ? (
                  <LockIcon sx={{ mr: 1, color: "text.secondary" }} />
                ) : (
                  <LockOpenIcon sx={{ mr: 1, color: "text.secondary" }} />
                ),
                endAdornment: password ? (
                  <InputAdornment position="end">
                    <IconButton edge="end" onClick={() => setPassword("")} size="small" aria-label="Clear password">
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              },
            }}
          />
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Expiry time
            </Typography>
            <Box sx={{ mb: 2, p: 2, bgcolor: "background.default", borderRadius: 1 }}>
              <Typography sx={{ fontWeight: 500 }}>
                {expiryDate ? format(expiryDate, "PPpp") : "No expiry set"}
              </Typography>
              {expiryDate && expiryDate <= new Date() && (
                <Typography variant="body2" color="error">
                  Expired
                </Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button
                variant={expiryDate === null ? "contained" : "outlined"}
                size="small"
                onClick={() => setExpiryDate(null)}
              >
                None
              </Button>
              {EXPIRY_OPTIONS.map(({ label, amount, unit }) => (
                <Button key={label} variant="outlined" size="small" onClick={() => addTime(amount, unit)}>
                  {label}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>
      </Paper>
    </PageContainer>
  );
}

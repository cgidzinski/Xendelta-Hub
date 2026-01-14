import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  TextField,
  InputAdornment,
  Box,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  LinearProgress,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { useTitle } from "../../../hooks/useTitle";
import { useSnackbar } from "notistack";
import FileList from "./components/FileList";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import { useXenboxUpload, useXenboxFiles } from "../../../hooks/useXenbox";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { formatFileSize } from "../../../utils/fileUtils";



export default function XenBox() {
  useTitle("XenBox");
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { profile } = useUserProfile();
  const [search, setSearch] = useState("");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { data: files, isLoading, isError, error } = useXenboxFiles(search || undefined);
  const { uploadFile, isUploading } = useXenboxUpload();

  const handleOpenUploadDialog = () => {
    setUploadDialogOpen(true);
    setSelectedFile(null);
    setUploadProgress(0);
  };

  const handleCloseUploadDialog = () => {
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    // Check quota
    const spaceUsed = profile?.xenbox?.spaceUsed || 0;
    const spaceAllowed = profile?.xenbox?.spaceAllowed || 0;
    if (spaceUsed + selectedFile.size > spaceAllowed) {
      enqueueSnackbar("Quota exceeded. Please delete some files or upgrade your plan.", { variant: "error" });
      return;
    }

    await uploadFile(
      {
        file: selectedFile,
        onProgress: (progress) => {
          setUploadProgress(progress);
        },
      }
    )
      .then((newFile) => {
        handleCloseUploadDialog();
        enqueueSnackbar("File uploaded successfully", { variant: "success" });
        navigate(`/internal/xenbox/${newFile._id}`);
      })
      .catch((error: Error) => {
        enqueueSnackbar(error.message || "Failed to upload file", { variant: "error" });
        setUploadProgress(0);
      });
  };

  const quotaPercentage = profile?.xenbox
    ? (profile.xenbox.spaceUsed / profile.xenbox.spaceAllowed) * 100
    : 0;
  const canUpload = selectedFile && profile?.xenbox
    ? profile.xenbox.spaceUsed + selectedFile.size <= profile.xenbox.spaceAllowed
    : true;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          XenBox
        </Typography>
        <Button variant="contained" startIcon={<CloudUploadIcon />} onClick={handleOpenUploadDialog}>
          Upload
        </Button>
      </Box>

      {/* Quota Display */}
      {profile?.xenbox && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Storage: {formatFileSize(profile.xenbox.spaceUsed)} / {formatFileSize(profile.xenbox.spaceAllowed)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {profile.xenbox.fileCount} {profile.xenbox.fileCount === 1 ? "file" : "files"}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={quotaPercentage}
            color={quotaPercentage > 90 ? "error" : quotaPercentage > 75 ? "warning" : "primary"}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>
      )}

      <Dialog open={uploadDialogOpen} onClose={handleCloseUploadDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6">Upload File</Typography>
            <IconButton onClick={handleCloseUploadDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              style={{ display: "none" }}
              id="file-upload-input"
            />
            <label htmlFor="file-upload-input">
              <Button variant="outlined" component="span" fullWidth sx={{ mb: 2 }}>
                Browse Files
              </Button>
            </label>
            {selectedFile && (
              <Box>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Selected: {selectedFile.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Size: {formatFileSize(selectedFile.size)}
                </Typography>
                {!canUpload && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    File size exceeds available quota. Available:{" "}
                    {formatFileSize((profile?.xenbox?.spaceAllowed || 0) - (profile?.xenbox?.spaceUsed || 0))}
                  </Alert>
                )}
              </Box>
            )}
            {isUploading && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress variant="determinate" value={uploadProgress} sx={{ mb: 1 }} />
                <Typography variant="body2" color="text.secondary" align="center">
                  {Math.round(uploadProgress)}% uploaded
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseUploadDialog} disabled={isUploading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading || !canUpload}
          >
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogActions>
      </Dialog>

      <TextField
        fullWidth
        placeholder="Search files..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 4 }}
      />

      {isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error?.message || "Failed to load files"}
        </Alert>
      )}

      <FileList files={files} isLoading={isLoading} isError={isError} error={error} />
    </Container>
  );
}

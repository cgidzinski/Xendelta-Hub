import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Container,
  Typography,
  Box,
  Button,
  CircularProgress,
  Alert,
  TextField,
  Card,
  CardContent,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import LockIcon from "@mui/icons-material/Lock";
import { startPublicDownload } from "../../../utils/publicDownload";
import { useTitle } from "../../../hooks/useTitle";
import { formatDistanceToNow } from "date-fns";
import { formatFileSize } from "../../../utils/fileUtils";
import PublicJoinCard from "../components/PublicJoinCard";

interface FileInfo {
  filename: string;
  size: number;
  mimeType: string;
  requiresPassword: boolean;
  isExpired: boolean;
  expiry: string | null;
}

export default function XenDriveDownload() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useTitle("Download File - XenDrive");

  useEffect(() => {
    if (!shareToken) {
      setError("Invalid share link");
      setIsLoading(false);
      return;
    }

    // Check file status
    checkFileStatus();
  }, [shareToken]);

  const checkFileStatus = async () => {
    if (!shareToken) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/xendrive/info/${shareToken}`);
      const data = await response.json();

      if (response.ok && data.status) {
        setFileInfo({
          filename: data.data.name || "File",
          size: data.data.size || 0,
          mimeType: data.data.mimeType || "application/octet-stream",
          requiresPassword: data.data.requiresPassword || false,
          isExpired: false,
          expiry: data.data.expiry || null,
        });
      } else if (response.status === 403) {
        setFileInfo({
          filename: "File",
          size: 0,
          mimeType: "application/octet-stream",
          requiresPassword: false,
          isExpired: true,
          expiry: null,
        });
        setError(data.message || "Link expired");
      } else {
        setError(data.message || "Failed to access file");
      }
    } catch (e) {
      setError("Failed to access file");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!shareToken) return;
    setIsDownloading(true);
    setError(null);
    try {
      await startPublicDownload(
        `/api/xendrive/download/${shareToken}/ticket`,
        `/api/xendrive/download/${shareToken}`,
        password || undefined,
      );
    } catch (e) {
      setError((e as Error).message || "Failed to download file");
    } finally {
      // The browser takes over from here (or there is an error to show); the page itself never left.
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error && !fileInfo?.requiresPassword) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Card>
          <CardContent>
            <Alert severity="error">{error}</Alert>
          </CardContent>
        </Card>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Card>
        <CardContent>
          <Box sx={{ textAlign: "center", mb: 3 }}>
            <LockIcon sx={{ fontSize: 48, color: "primary.main", mb: 2 }} />
            <Typography variant="h5" component="h1" gutterBottom>
              {fileInfo?.isExpired ? "Link Expired" : fileInfo?.filename || "Download File"}
            </Typography>
            {!fileInfo?.isExpired && fileInfo && fileInfo.size > 0 && (
              <Typography variant="body2" color="text.secondary">
                {formatFileSize(fileInfo.size)}
              </Typography>
            )}
            {fileInfo?.isExpired && (
              <Alert severity="error" sx={{ mt: 2 }}>
                This download link has expired.
              </Alert>
            )}
          </Box>

          {!fileInfo?.isExpired && (
            <Box
              component="form"
              onSubmit={(e: React.FormEvent) => {
                e.preventDefault();
                if (!isDownloading && !(fileInfo?.requiresPassword && !password)) handleDownload();
              }}
            >
              {fileInfo?.expiry && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  This file expires in {formatDistanceToNow(new Date(fileInfo.expiry), { addSuffix: true })}.
                </Alert>
              )}
              {fileInfo?.requiresPassword && (
                <>
                  <TextField
                    fullWidth
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    sx={{ mb: 2 }}
                    autoFocus
                  />
                  {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {error}
                    </Alert>
                  )}
                </>
              )}
              <Button
                type="submit"
                variant="contained"
                fullWidth
                startIcon={<DownloadIcon />}
                disabled={isDownloading || (fileInfo?.requiresPassword && !password)}
                size="large"
              >
                {isDownloading ? "Downloading..." : "Download File"}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
      <PublicJoinCard app="xendrive" />
    </Container>
  );
}

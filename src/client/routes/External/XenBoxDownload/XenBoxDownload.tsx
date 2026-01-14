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
import { useTitle } from "../../../hooks/useTitle";
import { formatDistanceToNow } from "date-fns";

interface FileInfo {
  filename: string;
  size: number;
  mimeType: string;
  requiresPassword: boolean;
  isExpired: boolean;
  expiry: string | null;
}

export default function XenBoxDownload() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useTitle("Download File - XenBox");

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
      const response = await fetch(`/api/xenbox/info/${shareToken}`);
      const data = await response.json();

      if (response.ok && data.status) {
        setFileInfo({
          filename: data.data.filename || "File",
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

  const handleDownload = async (skipCheck = false) => {
    if (!shareToken) return;

    if (!skipCheck) {
      setIsDownloading(true);
    }
    setError(null);

    const url = `/api/xenbox/download/${shareToken}${password ? `?password=${encodeURIComponent(password)}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
    });

    // Check if response is JSON (error) or file stream
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      // It's an error response
      const data = await response.json();

      if (response.status === 401) {
        setError(data.message || "Incorrect password");
        setIsDownloading(false);
        setIsLoading(false);
        return;
      }

      if (response.status === 403) {
        setError(data.message || "Link expired");
        setIsDownloading(false);
        setIsLoading(false);
        return;
      }

      setError(data.message || "Failed to download file");
      setIsDownloading(false);
      setIsLoading(false);
      return;
    }

    // It's a file stream
    if (!response.ok) {
      setError("Failed to download file");
      setIsDownloading(false);
      setIsLoading(false);
      return;
    }

    // Get filename from Content-Disposition header or use default
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = "download";
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="?(.+?)"?$/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    // Create blob and download
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);

    setIsDownloading(false);
    setIsLoading(false);
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
              {fileInfo?.isExpired ? "Link Expired" : "Download File"}
            </Typography>
            {fileInfo?.isExpired && (
              <Alert severity="error" sx={{ mt: 2 }}>
                This download link has expired.
              </Alert>
            )}
          </Box>

          {!fileInfo?.isExpired && (
            <Box>
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
                variant="contained"
                fullWidth
                startIcon={<DownloadIcon />}
                onClick={() => handleDownload()}
                disabled={isDownloading || (fileInfo?.requiresPassword && !password)}
                size="large"
              >
                {isDownloading ? "Downloading..." : "Download File"}
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}

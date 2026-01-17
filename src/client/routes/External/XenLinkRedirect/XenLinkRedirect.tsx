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
import { XenLink } from "../../../hooks/useXenlink";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LinkIcon from "@mui/icons-material/Link";

interface FileInfo {
  filename: string;
  size: number;
  mimeType: string;
  requiresPassword: boolean;
  isExpired: boolean;
  expiry: string | null;
}

export default function XenLinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [link, setLink] = useState<XenLink | null>(null);

  useTitle("Tiny URL - XenLink");

  useEffect(() => {
    if (!slug) {
      setError("Invalid link");
      setIsLoading(false);
      return;
    }

    // Check file status
    checkUrlStatus();
  }, [slug]);

  const checkUrlStatus = async () => {
    if (!slug) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/xenlink/redirect/${slug}`);
      const data = await response.json();
      if (response.ok && data.status) {
        setLink(data.data.link);
      } else {
        setError(data.message || "Failed to access link");
      }
    } catch (e) {
      setError("Failed to access link");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRedirect = async (skipCheck = false) => {
    if (!slug) return;

    setError(null);
    console.log(link);
    // window.location.href = link?.url || "";

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
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Card>
        <CardContent>
          <Box sx={{ textAlign: "center", mb: 3 }}>
            <LinkIcon sx={{ fontSize: 48, color: "primary.main", mb: 2 }} />
            <Typography variant="h5" component="h1" gutterBottom>
              XenLink
            </Typography>
            <Typography variant="body2" component="h1" gutterBottom>
              Tiny URL
            </Typography>
            {error && (
              <Card>
                <CardContent>
                  <Alert severity="error">{error}</Alert>
                </CardContent>
              </Card>
            )}
          </Box>

          <Box>
            <Button
              variant="contained"
              fullWidth
              startIcon={<ArrowForwardIcon />}
              onClick={() => handleRedirect()}
              disabled={isLoading || !!error}
              size="large"
            >
              {isLoading ? "Loading..." : "Go!"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

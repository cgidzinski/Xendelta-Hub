import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Container, Typography, Box, Button, CircularProgress, Alert, Card, CardContent } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import { XenLink } from "../../../hooks/xenlink/useXenlink";
import { normalizeDestination } from "@shared/xenlink";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import LinkIcon from "@mui/icons-material/Link";

export default function XenLinkRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [going, setGoing] = useState(false);
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

  // Pressing Go counts the click, then opens the address the server answers with. The address is checked here too: this
  // page is part of the app, so a link must never be able to run anything but open a web page.
  const handleRedirect = async () => {
    if (!slug || going) return;
    setError(null);
    setGoing(true);
    try {
      const response = await fetch(`/api/xenlink/click/${encodeURIComponent(slug)}`, { method: "POST" });
      const data = await response.json();
      const destination = response.ok && data.status ? normalizeDestination(String(data.data?.url ?? "")) : null;
      if (!destination) {
        setError(data.message || "This link can't be opened");
        setGoing(false);
        return;
      }
      window.location.assign(destination);
    } catch {
      setError("Failed to open the link");
      setGoing(false);
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
            {link?.name && !error && (
              <Typography variant="subtitle1" sx={{ fontWeight: 600, wordBreak: "break-word", mb: 1 }}>
                {link.name}
              </Typography>
            )}
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
              onClick={handleRedirect}
              disabled={isLoading || going || !!error}
              size="large"
            >
              {isLoading ? "Loading..." : going ? "Opening..." : "Go!"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

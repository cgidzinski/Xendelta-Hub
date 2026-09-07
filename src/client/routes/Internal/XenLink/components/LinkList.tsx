import { Box, Typography, CircularProgress, Card, CardContent, CardActionArea, IconButton } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import { format } from "date-fns";
import { XenLink } from "../../../../hooks/xenlink/useXenlink";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import EmptyState from "../../../../components/ui/EmptyState";
import LinkIcon from "@mui/icons-material/Link";

interface LinkListProps {
  links: XenLink[] | undefined;
  handleLinkClick: (linkId: string) => void;
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export default function LinkList({ links, handleLinkClick, isLoading, isError, error, onRetry }: LinkListProps) {
  const { enqueueSnackbar } = useSnackbar();

  const handleCopyUrl = (e: React.MouseEvent, link: XenLink) => {
    e.stopPropagation(); // Prevent card click
    if (link.url) {
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/x/${link.slug}`;
      navigator.clipboard.writeText(shareUrl);
      enqueueSnackbar("URL copied to clipboard", { variant: "success" });
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    return <ErrorDisplay error={error ?? null} title="Couldn't load your links" onRetry={onRetry} />;
  }

  if (!links || links.length === 0) {
    return (
      <EmptyState
        icon={<LinkIcon />}
        title="No links yet"
        description="Create your first link to get started."
      />
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {links.map((link) => (
        <Card key={link._id} sx={{ width: "100%", position: "relative" }}>
          {link.url && (
            <IconButton
              size="small"
              onClick={(e) => handleCopyUrl(e, link)}
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
          <CardActionArea onClick={() => handleLinkClick(link._id || "")}>
            <CardContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 500, flexGrow: 1, wordBreak: "break-word", pr: link.url ? 4 : 0 }}
                  >
                    {link.name}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: "flex", gap: 2, flexDirection: "column" }}>
                    <Typography variant="body2" color="text.secondary">
                      URL: {link.url}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <Typography variant="body2" color="text.secondary">
                      Created: {format(new Date(link.createdAt), "MMM d, yyyy")}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </CardActionArea>
        </Card>
      ))}
    </Box>
  );
}

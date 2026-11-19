import { Box, Typography, Card, CardContent, CardActionArea, Checkbox, Chip, IconButton } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import { format } from "date-fns";
import { XenLink } from "../../../../hooks/xenlink/useXenlink";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import EmptyState from "../../../../components/ui/EmptyState";
import LinkIcon from "@mui/icons-material/Link";
import AdsClickIcon from "@mui/icons-material/AdsClick";
import ScheduleIcon from "@mui/icons-material/Schedule";

interface LinkListProps {
  links: XenLink[] | undefined;
  handleLinkClick: (linkId: string) => void;
  isLoading: boolean;
  isError?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  /** The current search; when it finds nothing the empty state says so instead of inviting a first link. */
  search?: string;
  /** Set while choosing links to delete: the ids ticked so far. A tap ticks instead of opening the link. */
  selectedIds?: string[];
}

export default function LinkList({
  links,
  handleLinkClick,
  isLoading,
  isError,
  error,
  onRetry,
  search,
  selectedIds,
}: LinkListProps) {
  const { enqueueSnackbar } = useSnackbar();

  const handleCopyUrl = (e: React.MouseEvent, link: XenLink) => {
    e.stopPropagation(); // Prevent card click
    if (link.url) {
      const baseUrl = window.location.origin;
      const shareUrl = `${baseUrl}/x/${link.slug}`;
      navigator.clipboard.writeText(shareUrl);
      enqueueSnackbar("Link copied to clipboard", { variant: "success" });
    }
  };

  if (isLoading) {
    return <ListSkeleton rows={5} height={92} gap={2} />;
  }

  if (isError) {
    return <ErrorDisplay error={error ?? null} title="Couldn't load your links" onRetry={onRetry} />;
  }

  if (!links || links.length === 0) {
    if (search) {
      return <EmptyState icon={<LinkIcon />} title="No links match" description={`Nothing found for "${search}".`} />;
    }
    return <EmptyState icon={<LinkIcon />} title="No links yet" description="Create your first link to get started." />;
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {links.map((link) => (
        <Card key={link._id} sx={{ width: "100%", position: "relative" }}>
          {link.url && !selectedIds && (
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
          {selectedIds && (
            <Checkbox
              checked={selectedIds.includes(link._id || "")}
              tabIndex={-1}
              inputProps={{ "aria-label": `Select ${link.name}` }}
              sx={{ position: "absolute", top: 4, right: 4, zIndex: 1 }}
              onChange={() => handleLinkClick(link._id || "")}
            />
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
                    sx={{ fontWeight: 500, flexGrow: 1, wordBreak: "break-word", pr: link.url || selectedIds ? 4 : 0 }}
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
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                    <Chip
                      size="small"
                      variant="outlined"
                      icon={<AdsClickIcon sx={{ fontSize: 14 }} />}
                      label={`${link.clicks ?? 0} ${link.clicks === 1 ? "click" : "clicks"}`}
                    />
                    {link.paused && <Chip size="small" variant="outlined" color="warning" label="Paused" />}
                    {link.expires_at && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={new Date(link.expires_at) <= new Date() ? "error" : "warning"}
                        icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
                        label={
                          new Date(link.expires_at) <= new Date()
                            ? "Expired"
                            : `Expires ${format(new Date(link.expires_at), "MMM d")}`
                        }
                      />
                    )}
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

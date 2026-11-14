import { Box, IconButton, Link, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { LinkEmbed } from "@shared/chat";
import { RADIUS } from "../../theme";

interface Props {
  embed: LinkEmbed;
  /** Shown to the sender (and anyone who can delete the message): takes every preview off the message. */
  onRemove?: () => void;
}

/**
 * A preview of a page a message links to: its site, title and a few words. Text only, drawn as text: the page's own
 * picture is not loaded, because that would tell the page's site who is reading.
 */
export default function LinkEmbedCard({ embed, onRemove }: Props) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 0.5,
        maxWidth: 420,
        mt: 0.75,
        pl: 1.5,
        pr: 0.5,
        py: 0.75,
        borderLeft: 3,
        borderColor: "primary.main",
        borderRadius: RADIUS.md,
        bgcolor: "action.hover",
        color: "text.primary",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
          {embed.siteName}
        </Typography>
        <Link
          href={embed.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          underline="hover"
          onClick={(e) => e.stopPropagation()}
          sx={{ display: "block", fontWeight: 600, fontSize: 14, wordBreak: "break-word", color: "primary.main" }}
        >
          {embed.title}
        </Link>
        {embed.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mt: 0.25,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {embed.description}
          </Typography>
        )}
      </Box>
      {onRemove && (
        <IconButton size="small" aria-label="Remove link preview" onClick={onRemove} sx={{ mt: -0.25 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

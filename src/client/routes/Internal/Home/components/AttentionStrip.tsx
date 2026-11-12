import { useState } from "react";
import { Box, Button, Card, CardActionArea, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useNavigate } from "react-router-dom";
import type { AttentionCard, AttentionSeverity } from "@shared/feed";
import { APPS_REGISTRY } from "../../../../constants/apps";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import SectionLabel from "../../../../components/ui/SectionLabel";

/** Cards shown before "+N more". */
export const ATTENTION_VISIBLE = 4;

const SEVERITY_COLOR: Record<AttentionSeverity, "error" | "warning" | "primary"> = {
  critical: "error",
  warning: "warning",
  info: "primary",
};

function AttentionCardView({ card }: { card: AttentionCard }) {
  const navigate = useNavigate();
  const app = APPS_REGISTRY.find((a) => a.key === card.app);
  const Icon = app?.icon ?? MailOutlineIcon;
  const tone = SEVERITY_COLOR[card.severity];
  return (
    <Card variant="outlined" sx={{ ...cardSx, minWidth: 0 }}>
      <CardActionArea
        onClick={() => navigate(card.link)}
        sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5 }}
      >
        <Box
          sx={(theme) => ({
            flexShrink: 0,
            width: 36,
            height: 36,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            color: `${tone}.main`,
            bgcolor: alpha(theme.palette[tone].main, 0.14),
          })}
        >
          <Icon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
            {card.title}
          </Typography>
          {card.subtitle && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
              {card.subtitle}
            </Typography>
          )}
        </Box>
        <ChevronRightIcon fontSize="small" sx={{ color: "text.disabled" }} />
      </CardActionArea>
    </Card>
  );
}

/** "Needs attention": what is waiting on the person, worst first. Renders nothing when nothing is. */
export default function AttentionStrip({ cards }: { cards: AttentionCard[] }) {
  const [expanded, setExpanded] = useState(false);
  if (cards.length === 0) return null;
  const shown = expanded ? cards : cards.slice(0, ATTENTION_VISIBLE);
  const hidden = cards.length - ATTENTION_VISIBLE;

  return (
    <Box component="section" aria-label="Needs attention">
      <SectionLabel>Needs attention</SectionLabel>
      <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {shown.map((card) => (
          <AttentionCardView key={card.key} card={card} />
        ))}
      </Box>
      {hidden > 0 && (
        <Button size="small" onClick={() => setExpanded((v) => !v)} sx={{ mt: 0.5 }}>
          {expanded ? "Show fewer" : `+${hidden} more`}
        </Button>
      )}
    </Box>
  );
}

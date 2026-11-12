import { Box } from "@mui/material";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { wornBadge, type Cosmetics } from "@shared/cosmetics";

interface UserNameProps {
  /** Anything with a username and, optionally, what they wear: a member, a participant, a profile. */
  user?: { username?: string; cosmetics?: Cosmetics } | null;
  /** Shown when there is no username (a former member, a missing record). */
  fallback?: string;
}

/**
 * A person's name, with the badge they wear next to it. Use this wherever a name is drawn for people to read, so a
 * cosmetic shows up everywhere at once. Without a badge it renders the bare text, so it is safe to drop in anywhere
 * a name was inline. Plain-string spots (tooltips, aria-labels, joined lists) cannot hold an icon and stay text.
 */
export default function UserName({ user, fallback = "" }: UserNameProps) {
  const name = user?.username || fallback;
  const badge = wornBadge(user?.cosmetics);
  if (!badge) return <>{name}</>;

  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, maxWidth: "100%" }}>
      <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
        {name}
      </Box>
      <StarRoundedIcon titleAccess={badge.label} sx={{ fontSize: "1.15em", color: "warning.main", flexShrink: 0 }} />
    </Box>
  );
}

import type { SvgIconComponent } from "@mui/icons-material";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import SpaRoundedIcon from "@mui/icons-material/SpaRounded";
import type { BadgeIcon } from "@shared/cosmetics";

/** The icon each badge shape is drawn with. */
export const BADGE_ICONS: Record<BadgeIcon, SvgIconComponent> = {
  star: StarRoundedIcon,
  heart: FavoriteRoundedIcon,
  bolt: BoltRoundedIcon,
  leaf: SpaRoundedIcon,
};

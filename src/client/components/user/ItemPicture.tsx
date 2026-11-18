import { Box, Typography, type SxProps, type Theme } from "@mui/material";
import { FRAMES, NAME_COLOURS } from "@shared/cosmetics";
import { useUserProfile } from "../../hooks/user/useUserProfile";
import UserAvatar from "./UserAvatar";
import UserName from "./UserName";

interface ItemPictureProps {
  itemKey: string;
  /** The item's own picture, for everything that isn't a frame or a name colour. */
  image: string;
  alt?: string;
  /** Sizing for the picture. */
  sx?: SxProps<Theme>;
}

/**
 * What an item looks like in the Shop and Inventory. A frame or a name colour is shown on you (your picture in the
 * frame, your name in the colour), because it has no picture of its own; everything else is its image.
 */
export default function ItemPicture({ itemKey, image, alt = "", sx }: ItemPictureProps) {
  const { profile } = useUserProfile();
  if (itemKey in FRAMES) {
    return (
      <UserAvatar
        user={{ username: profile?.username, avatar: profile?.avatar, cosmetics: { frame: itemKey } }}
        sx={{ width: 64, height: 64, m: 0.5 }}
      >
        {profile?.username?.[0]?.toUpperCase()}
      </UserAvatar>
    );
  }
  if (itemKey in NAME_COLOURS) {
    return (
      <Typography variant="h6" component="span" noWrap sx={{ maxWidth: "100%", fontWeight: 600 }}>
        <UserName user={{ username: profile?.username, cosmetics: { nameColour: itemKey } }} fallback="Your name" />
      </Typography>
    );
  }
  return <Box component="img" src={image} alt={alt} sx={sx} />;
}

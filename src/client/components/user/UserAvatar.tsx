import { Avatar, type AvatarProps, type SxProps, type Theme } from "@mui/material";
import { wornFrame, type Cosmetics } from "@shared/cosmetics";

interface UserAvatarProps extends Omit<AvatarProps, "src"> {
  /** Anything with an avatar and, optionally, what they wear: a member, a participant, a profile. */
  user?: { username?: string; avatar?: string | null; cosmetics?: Cosmetics } | null;
  /** A picture to show instead of `user.avatar` (an upload preview). */
  src?: string;
}

/** A theme palette path such as "info.main" as a colour. */
const paletteColour = (theme: Theme, token: string): string => {
  const [group, shade] = token.split(".");
  const entry = (theme.palette as unknown as Record<string, Record<string, string> | undefined>)[group];
  return entry?.[shade] ?? theme.palette.primary.main;
};

/**
 * A person's picture, with the frame they wear drawn around it. Use this wherever a person's avatar is drawn, so a
 * cosmetic shows up everywhere at once (`designLint.test.ts` fails on a raw `<Avatar>` showing a user's picture). The
 * frame is an outline on the avatar itself, not a wrapper, so it also works inside an `AvatarGroup`.
 */
export default function UserAvatar({ user, src, alt, sx, children, ...rest }: UserAvatarProps) {
  const frame = wornFrame(user?.cosmetics);
  const frameSx: SxProps<Theme> | undefined = frame
    ? (theme) => ({ outline: `2px solid ${paletteColour(theme, frame.token)}`, outlineOffset: 1 })
    : undefined;
  const own = sx === undefined ? [] : Array.isArray(sx) ? sx : [sx];
  return (
    <Avatar
      src={src ?? (user?.avatar || undefined)}
      alt={alt ?? user?.username}
      sx={[...(frameSx ? [frameSx] : []), ...own] as SxProps<Theme>}
      {...rest}
    >
      {children}
    </Avatar>
  );
}

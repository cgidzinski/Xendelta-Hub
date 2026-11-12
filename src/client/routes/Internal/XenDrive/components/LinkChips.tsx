import { Chip, Stack } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ScheduleIcon from "@mui/icons-material/Schedule";
import type { XenDriveFile } from "../../../../types/XenDriveFile";
import { expiryShort } from "../lib/driveFormat";

/** What a file's link is doing: on, password-protected, expiring. Nothing at all when it's private. */
export default function LinkChips({ file }: { file: XenDriveFile }) {
  const expired = !!file.expiry && new Date(file.expiry) <= new Date();
  if (!file.shared && !file.hasPassword && !file.expiry) return null;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
      {file.shared && (
        <Chip
          size="small"
          variant="outlined"
          color="primary"
          icon={<LinkIcon sx={{ fontSize: 14 }} />}
          label="Link on"
        />
      )}
      {file.hasPassword && (
        <Chip
          size="small"
          variant="outlined"
          color="success"
          icon={<LockOutlinedIcon sx={{ fontSize: 14 }} />}
          label="Password"
        />
      )}
      {file.expiry && (
        <Chip
          size="small"
          variant="outlined"
          color={expired ? "error" : "warning"}
          icon={<ScheduleIcon sx={{ fontSize: 14 }} />}
          label={expired ? "Expired" : `Expires in ${expiryShort(file.expiry)}`}
        />
      )}
    </Stack>
  );
}

import { Chip, Stack } from "@mui/material";
import AppsOutlinedIcon from "@mui/icons-material/AppsOutlined";
import type { XenDriveFile } from "../../../../types/XenDriveFile";

/**
 * Where a file an app stored for the person came from, and whether it uses their storage. Nothing for an ordinary file.
 * `showSource` is off under XenDrive > From apps, where the list is already grouped by app.
 */
export default function SourceChips({ file, showSource = true }: { file: XenDriveFile; showSource?: boolean }) {
  if (!file.source) return null;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
      {showSource && (
        <Chip
          size="small"
          variant="outlined"
          icon={<AppsOutlinedIcon sx={{ fontSize: 14 }} />}
          label={`From ${file.source.label}`}
        />
      )}
      {file.counted === false && <Chip size="small" variant="outlined" label="Doesn't count toward storage" />}
    </Stack>
  );
}

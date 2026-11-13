import { Typography } from "@mui/material";
import { formatDistanceToNow } from "date-fns";

/** "Downloaded 3 times, last 2 hours ago" for a public link (a file's or a folder's). Nothing until it has happened. */
export default function DownloadTally({ downloads, last }: { downloads?: number; last?: string | null }) {
  if (!downloads) return null;
  return (
    <Typography variant="body2" color="text.secondary">
      Downloaded {downloads} {downloads === 1 ? "time" : "times"}
      {last ? `, last ${formatDistanceToNow(new Date(last), { addSuffix: true })}` : ""}
    </Typography>
  );
}

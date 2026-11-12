import EmptyState from "../../../../components/ui/EmptyState";
import { Box, Typography, Skeleton } from "@mui/material";
import { useXendriveRecent } from "../../../../hooks/xendrive/useXendrive";
import { formatFileSize } from "../../../../utils/fileUtils";

export default function XenDriveCardBody() {
  const { data, isLoading } = useXendriveRecent();

  if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />;

  const recent = data?.files ?? [];

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 2, mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
            {data?.fileCount ?? 0}
          </Box>{" "}
          files
        </Typography>
        <Typography variant="body2" color="text.secondary">
          <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>
            {formatFileSize(data?.spaceUsed ?? 0)}
          </Box>{" "}
          used
        </Typography>
      </Box>
      {recent.length === 0 ? (
        <EmptyState description="No files yet." sx={{ py: 1 }} />
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          {recent.map((f) => (
            <Box key={f._id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                {f.name}
              </Typography>
              <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>
                {formatFileSize(f.size)}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

import { Box, Typography, Skeleton } from "@mui/material";
import { useXenboxFiles } from "../../../../hooks/xenbox/useXenbox";

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export default function XenBoxCardBody() {
    const { data: files, isLoading } = useXenboxFiles();

    if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 1 }} />;

    const fileList = files || [];
    const totalSize = fileList.reduce((sum, f) => sum + (f.size || 0), 0);
    const recent = [...fileList]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3);

    return (
        <Box>
            <Box sx={{ display: "flex", gap: 2, mb: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                    <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{fileList.length}</Box> files
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{formatBytes(totalSize)}</Box> used
                </Typography>
            </Box>
            {recent.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No files yet.</Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                    {recent.map((f) => (
                        <Box key={f._id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                            <Typography variant="body2" noWrap sx={{ flex: 1 }}>{f.filename}</Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0 }}>{formatBytes(f.size)}</Typography>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}

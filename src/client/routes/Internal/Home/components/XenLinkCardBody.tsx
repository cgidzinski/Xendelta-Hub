import { Box, Typography, Skeleton } from "@mui/material";
import { useXenLink } from "../../../../hooks/xenlink/useXenlink";

export default function XenLinkCardBody() {
    const { links, isLoading } = useXenLink();

    if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 1 }} />;

    const recent = [...links]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3);

    return (
        <Box>
            <Box sx={{ mb: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                    <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{links.length}</Box> links
                </Typography>
            </Box>
            {recent.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No links yet.</Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                    {recent.map((l) => (
                        <Box key={l._id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                            <Typography variant="body2" noWrap sx={{ flex: 1 }}>{l.name}</Typography>
                            <Typography variant="caption" color="primary.main" sx={{ flexShrink: 0, fontFamily: "monospace" }}>
                                /x/{l.slug}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}

import { Box, Typography, Chip, Skeleton } from "@mui/material";
import { useRecipaint } from "../../../../hooks/recipaint/useRecipaint";

export default function RecipaintCardBody() {
    const { recipes, isLoading } = useRecipaint();

    if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 1 }} />;

    const recent = [...recipes]
        .sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime())
        .slice(0, 3);
    const publicCount = recipes.filter((r) => r.isPublic).length;

    return (
        <Box>
            <Box sx={{ display: "flex", gap: 2, mb: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                    <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{recipes.length}</Box> recipes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    <Box component="span" sx={{ fontWeight: 700, color: "success.main" }}>{publicCount}</Box> public
                </Typography>
            </Box>
            {recent.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No recipes yet.</Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                    {recent.map((r) => (
                        <Box key={r._id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                            <Typography variant="body2" noWrap sx={{ flex: 1 }}>{r.title}</Typography>
                            <Chip
                                label={r.isPublic ? "public" : "private"}
                                size="small"
                                color={r.isPublic ? "success" : "default"}
                                variant="outlined"
                                sx={{ fontSize: "0.65rem", height: 18, flexShrink: 0 }}
                            />
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}

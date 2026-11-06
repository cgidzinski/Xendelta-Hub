import { Box, Skeleton, Typography } from "@mui/material";
import { EMPTY_FILTERS } from "../../../../../shared/xenkitchen/kitchen";
import { useKitchenItems } from "../../../../hooks/xenkitchen/useKitchen";

export default function XenKitchenCardBody() {
  const { items, isLoading } = useKitchenItems(EMPTY_FILTERS);

  if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 2 }} />;

  const recent = items.slice(0, 3);
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{items.length}</Box> saved
        {" · "}
        <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{items.filter((i) => i.favorite).length}</Box> favorites
      </Typography>
      {recent.length === 0 ? (
        <Typography variant="body2" color="text.secondary">Nothing saved yet.</Typography>
      ) : (
        <Box sx={{ display: "flex", gap: 1 }}>
          {recent.map((i) => (
            <Box key={i._id} sx={{ flex: "1 1 0", minWidth: 0 }}>
              {i.images[0] ? (
                <Box component="img" src={i.images[0].url} alt="" sx={{ width: "100%", height: 56, objectFit: "cover", borderRadius: 1.5, display: "block" }} />
              ) : (
                <Box sx={{ height: 56, borderRadius: 1.5, bgcolor: i.category?.color ?? "action.hover", opacity: 0.35 }} />
              )}
              <Typography variant="caption" noWrap sx={{ display: "block", mt: 0.5 }}>{i.title || "Untitled"}</Typography>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

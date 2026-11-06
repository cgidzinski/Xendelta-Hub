import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Chip, Container, InputAdornment, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import SearchIcon from "@mui/icons-material/Search";
import { useTitle } from "../../../hooks/useTitle";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import EmptyState from "../../../components/ui/EmptyState";
import { usePublicKitchenBook } from "../../../hooks/xenkitchen/useKitchen";
import type { KitchenLayout } from "../../../../shared/xenkitchen/kitchen";
import ItemCard from "../../Internal/XenKitchen/components/ItemCard";
import { CategoryIconView } from "../../Internal/XenKitchen/components/kitchenIcons";

/** Read-only browse of a whole book behind /k/b/:token. Works signed out. */
export default function XenKitchenPublicBook() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, error, refetch } = usePublicKitchenBook(token);
  const [layout, setLayout] = useState<KitchenLayout | "">("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  useTitle(data?.book.name || "XenKitchen");

  const items = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (data?.items ?? []).filter((i) =>
      (!layout || i.layout === layout)
      && (!category || i.category?._id === category)
      && words.every((w) => [i.title, i.brand, ...i.tags, ...i.ingredients.map((x) => x.name)].join(" ").toLowerCase().includes(w)));
  }, [data, layout, category, q]);

  const cats = (data?.categories ?? []).filter((c) => !layout || c.layout === layout);
  const countOf = (l: KitchenLayout) => (data?.items ?? []).filter((i) => i.layout === l).length;

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box component="header" sx={{
        position: "sticky", top: 0, zIndex: 1000, borderBottom: "1px solid", borderColor: "divider",
        backdropFilter: "blur(10px)", backgroundColor: alpha(theme.palette.background.paper, 0.8),
      }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, sm: 3 }, py: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} onClick={() => navigate("/")} sx={{ cursor: "pointer" }}>
            <RestaurantMenuIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>XenKitchen</Typography>
          </Stack>
          <Button size="small" onClick={() => navigate(isAuthenticated ? "/internal/xenkitchen" : "/")}>
            {isAuthenticated ? "My kitchen" : "Xendelta Hub"}
          </Button>
        </Stack>
      </Box>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {isLoading && <LoadingSpinner message="Loading…" />}
        {!isLoading && (isError || !data) && <ErrorDisplay error={error} title="This link isn't available" onRetry={() => refetch()} />}
        {data && (
          <>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 0.5 }}>
              <CategoryIconView icon={data.book.icon} sx={{ color: data.book.color, fontSize: 32 }} />
              <Typography variant="h4" sx={{ fontWeight: 800 }}>{data.book.name}</Typography>
            </Stack>
            {data.book.description && <Typography color="text.secondary" sx={{ mb: 2 }}>{data.book.description}</Typography>}

            <Tabs value={layout} onChange={(_, v) => { setLayout(v); setCategory(""); }} sx={{ mb: 1.5, "& .MuiTab-root": { textTransform: "none", fontWeight: 600 } }}>
              <Tab value="" label={`All ${data.items.length}`} />
              <Tab value="recipe" label={`Recipes ${countOf("recipe")}`} />
              <Tab value="instructions" label={`Instructions ${countOf("instructions")}`} />
            </Tabs>
            <Box sx={{ display: "flex", gap: 1, overflowX: "auto", mb: 2, pb: 0.5 }}>
              <Chip label="All categories" onClick={() => setCategory("")} variant={category ? "outlined" : "filled"} />
              {cats.map((c) => (
                <Chip key={c._id} icon={<CategoryIconView icon={c.icon} sx={{ fontSize: 18 }} />} label={c.name}
                  onClick={() => setCategory(category === c._id ? "" : c._id)} variant={category === c._id ? "filled" : "outlined"}
                  sx={{ flexShrink: 0, "& .MuiChip-icon": { color: c.color } }} />
              ))}
            </Box>
            <TextField fullWidth size="small" placeholder="Search this book" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 2 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }} />

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" } }}>
              {items.map((item) => (
                <ItemCard key={item._id} item={item} onOpen={() => navigate(`/k/b/${token}/${item._id}`)} />
              ))}
            </Box>
            {items.length === 0 && <EmptyState icon={<SearchIcon />} title="Nothing here" description={q ? "Try another search." : "This book is empty."} />}
          </>
        )}
      </Container>
    </Box>
  );
}

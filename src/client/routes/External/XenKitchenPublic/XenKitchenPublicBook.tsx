import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Box, Button, Chip, Container, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import SearchIcon from "@mui/icons-material/Search";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { useTitle } from "../../../hooks/useTitle";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import EmptyState from "../../../components/ui/EmptyState";
import { usePublicKitchenBook } from "../../../hooks/xenkitchen/useKitchen";
import ItemCard from "../../Internal/XenKitchen/components/ItemCard";
import { CategoryIconView } from "../../Internal/XenKitchen/components/kitchenIcons";
import BookCover from "../../Internal/XenKitchen/components/BookCover";
import { ExportBookDialog } from "../../Internal/XenKitchen/components/ExportBookDialog";
import { cookbookParams } from "../../Internal/XenKitchen/components/cookbook";
import { BRAND_NAME } from "@shared/brand";

/** Read-only browse of a whole book behind /k/b/:token. Works signed out. */
export default function XenKitchenPublicBook() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, error, refetch } = usePublicKitchenBook(token);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  useTitle(data?.book.name || "XenKitchen");

  const items = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (data?.items ?? []).filter(
      (i) =>
        (!category || i.category?._id === category) &&
        words.every((w) => [i.title, i.brand, ...i.ingredients.map((x) => x.name)].join(" ").toLowerCase().includes(w)),
    );
  }, [data, category, q]);

  const cats = data?.categories ?? [];

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1000,
          borderBottom: "1px solid",
          borderColor: "divider",
          backdropFilter: "blur(10px)",
          backgroundColor: alpha(theme.palette.background.paper, 0.8),
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, sm: 3 }, py: 1.5 }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            onClick={() => navigate("/")}
            sx={{ cursor: "pointer" }}
          >
            <RestaurantMenuIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              XenKitchen
            </Typography>
          </Stack>
          <Button size="small" onClick={() => navigate(isAuthenticated ? "/internal/xenkitchen" : "/")}>
            {isAuthenticated ? "My kitchen" : BRAND_NAME}
          </Button>
        </Stack>
      </Box>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {isLoading && <LoadingSpinner message="Loading…" />}
        {!isLoading && (isError || !data) && (
          <ErrorDisplay error={error} title="This link isn't available" onRetry={() => refetch()} />
        )}
        {data && (
          <>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <BookCover book={data.book} size={{ xs: 72, sm: 96 }} />
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  {!data.book.cover_url && (
                    <CategoryIconView icon={data.book.icon} sx={{ color: data.book.color, fontSize: 28 }} />
                  )}
                  <Typography variant="h4" component="h1" sx={{ fontWeight: 800 }}>
                    {data.book.name}
                  </Typography>
                </Stack>
                {data.book.description && (
                  <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                    {data.book.description}
                  </Typography>
                )}
                <Button
                  size="small"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={() => setExporting(true)}
                  sx={{ mt: 1, ml: -1 }}
                >
                  Save as PDF
                </Button>
              </Box>
            </Stack>

            <Box sx={{ display: "flex", gap: 1, overflowX: "auto", mb: 2, pb: 0.5 }}>
              <Chip label="All categories" onClick={() => setCategory("")} variant={category ? "outlined" : "filled"} />
              {cats.map((c) => (
                <Chip
                  key={c._id}
                  icon={<CategoryIconView icon={c.icon} sx={{ fontSize: 18 }} />}
                  label={c.name}
                  onClick={() => setCategory(category === c._id ? "" : c._id)}
                  variant={category === c._id ? "filled" : "outlined"}
                  sx={{ flexShrink: 0, "& .MuiChip-icon": { color: c.color } }}
                />
              ))}
            </Box>
            <TextField
              fullWidth
              size="small"
              placeholder="Search this book"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" },
              }}
            >
              {items.map((item) => (
                <ItemCard key={item._id} item={item} onOpen={() => navigate(`/k/b/${token}/${item._id}`)} />
              ))}
            </Box>
            {items.length === 0 && (
              <EmptyState
                icon={<SearchIcon />}
                title="Nothing here"
                description={q ? "Try another search." : "This book is empty."}
              />
            )}
          </>
        )}
      </Container>
      {exporting && data && (
        <ExportBookDialog
          bookName={data.book.name}
          categories={data.categories}
          items={data.items}
          onClose={() => setExporting(false)}
          onExport={(options) => navigate(`/k/b/${token}/print?${cookbookParams(options)}`)}
        />
      )}
    </Box>
  );
}

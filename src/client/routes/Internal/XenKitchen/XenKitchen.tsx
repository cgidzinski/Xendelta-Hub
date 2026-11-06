import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge, Box, Button, Chip, Container, Fab, IconButton, InputAdornment, Menu, MenuItem, Paper, Skeleton, Slide, Stack,
  TextField, Tooltip, Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import TuneIcon from "@mui/icons-material/Tune";
import CloseIcon from "@mui/icons-material/Close";
import SettingsIcon from "@mui/icons-material/Settings";
import RestaurantMenuIcon from "@mui/icons-material/RestaurantMenu";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import DeleteIcon from "@mui/icons-material/Delete";
import StarIcon from "@mui/icons-material/Star";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { useLocalStorageState } from "../../../hooks/useLocalStorageState";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import EmptyState from "../../../components/ui/EmptyState";
import {
  COOK_METHOD_LABELS, KITCHEN_SORTS, activeFilterCount, filtersFromParams, filtersToParams,
  type KitchenFilters, type KitchenSort,
} from "../../../../shared/xenkitchen/kitchen";
import {
  useBulkDeleteKitchenItems, useBulkMoveKitchenItems, useKitchenCategories, useKitchenItems, useUpdateKitchenItem,
  type KitchenItem,
} from "../../../hooks/xenkitchen/useKitchen";
import ItemCard from "./components/ItemCard";
import FilterPanel, { SORT_LABELS } from "./components/FilterPanel";
import CategoryDialog from "./components/CategoryDialog";
import ItemEditor from "./components/ItemEditor";
import { CategoryIconView } from "./components/kitchenIcons";

const isSort = (v: unknown): v is KitchenSort => KITCHEN_SORTS.includes(v as KitchenSort);

export default function XenKitchen() {
  useTitle("XenKitchen");
  const theme = useTheme();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();

  // Filters live in the URL so a filtered view can be bookmarked or shared between tabs;
  // the sort falls back to whatever you picked last.
  const [params, setParams] = useSearchParams();
  const [savedSort, setSavedSort] = useLocalStorageState<KitchenSort>("xenkitchen.sort", "updated", isSort);
  const filters = useMemo(() => filtersFromParams(params, savedSort), [params, savedSort]);
  const setFilters = (f: KitchenFilters) => {
    if (f.sort !== savedSort) setSavedSort(f.sort);
    setParams(filtersToParams(f, f.sort), { replace: true });
  };

  // The search box is local so typing stays snappy; it reaches the URL after a pause.
  const [search, setSearch] = useState(filters.q);
  useEffect(() => setSearch(filters.q), [filters.q]);
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => setFilters({ ...filters, q: search }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { categories, total, uncategorised, isLoading: catsLoading } = useKitchenCategories();
  const { items, isLoading, isFetching } = useKitchenItems(filters);
  const update = useUpdateKitchenItem();
  const bulkMove = useBulkMoveKitchenItems();
  const bulkDelete = useBulkDeleteKitchenItems();

  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const filterBtn = useRef<HTMLButtonElement>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveAnchor, setMoveAnchor] = useState<HTMLElement | null>(null);
  const selecting = selected.size > 0;

  const toggleSelect = (id: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const toggleFavorite = (item: KitchenItem) =>
    update.mutate({ id: item._id, patch: { favorite: !item.favorite } });

  const moveSelected = async (categoryId: string | null) => {
    setMoveAnchor(null);
    try {
      await bulkMove.mutateAsync({ ids: [...selected], category_id: categoryId });
      enqueueSnackbar(`Moved ${selected.size}`, { variant: "success" });
      setSelected(new Set());
    } catch {
      enqueueSnackbar("Couldn't move those", { variant: "error" });
    }
  };

  const deleteSelected = async () => {
    const ok = await confirm({ title: `Delete ${selected.size} item${selected.size > 1 ? "s" : ""}?`, message: "Their photos are deleted too. This can't be undone." });
    if (!ok) return;
    await bulkDelete.mutateAsync([...selected]);
    enqueueSnackbar("Deleted", { variant: "success" });
    setSelected(new Set());
  };

  const activeCategory = categories.find((c) => c._id === filters.category);
  const filterCount = activeFilterCount(filters);
  const anyFilter = filterCount > 0 || !!filters.q || !!filters.category;

  const chip = (key: string, label: React.ReactNode, onDelete: () => void) => (
    <Chip key={key} label={label} size="small" onDelete={onDelete} />
  );
  const activeChips = [
    filters.favorite && chip("fav", <Stack direction="row" alignItems="center" spacing={0.5}><StarIcon sx={{ fontSize: 14 }} /><span>Favorites</span></Stack>, () => setFilters({ ...filters, favorite: false })),
    filters.maxMinutes && chip("time", `≤ ${filters.maxMinutes} min`, () => setFilters({ ...filters, maxMinutes: null })),
    filters.method && chip("method", COOK_METHOD_LABELS[filters.method], () => setFilters({ ...filters, method: "" })),
    ...filters.tags.map((t) => chip(`t-${t}`, `#${t}`, () => setFilters({ ...filters, tags: filters.tags.filter((x) => x !== t) }))),
    ...filters.ingredients.map((i) => chip(`i-${i}`, `with ${i}`, () => setFilters({ ...filters, ingredients: filters.ingredients.filter((x) => x !== i) }))),
  ].filter(Boolean);

  const categoryChip = (id: string, label: string, count: number, color?: string, icon?: string) => {
    const active = filters.category === id;
    const c = color ?? theme.palette.text.primary;
    return (
      <Chip
        key={id || "all"}
        onClick={() => setFilters({ ...filters, category: active && id ? "" : id })}
        icon={icon ? <CategoryIconView icon={icon} sx={{ fontSize: 18 }} /> : undefined}
        label={<span>{label} <Box component="span" sx={{ opacity: 0.6, ml: 0.25 }}>{count}</Box></span>}
        sx={{
          flexShrink: 0, height: 36, borderRadius: 5, px: 0.5, fontWeight: 600,
          border: "1px solid", borderColor: active ? c : "divider",
          bgcolor: active ? alpha(c, 0.18) : "transparent",
          "& .MuiChip-icon": { color: c },
          "&:hover": { bgcolor: alpha(c, 0.12) },
        }}
      />
    );
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 12 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>XenKitchen</Typography>
          <Typography variant="body2" color="text.secondary">Recipes, and the instructions off the box.</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditorOpen(true)} sx={{ display: { xs: "none", sm: "inline-flex" } }}>
          New
        </Button>
      </Stack>

      {/* Category strip */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ display: "flex", gap: 1, overflowX: "auto", flex: 1, pb: 0.5, scrollbarWidth: "thin" }}>
          {catsLoading
            ? Array.from({ length: 5 }, (_, i) => <Skeleton key={i} variant="rounded" width={100} height={36} sx={{ borderRadius: 5, flexShrink: 0 }} />)
            : (
              <>
                {categoryChip("", "All", total)}
                {categories.map((c) => categoryChip(c._id, c.name, c.count, c.color, c.icon))}
                {uncategorised > 0 && categoryChip("none", "Uncategorised", uncategorised)}
              </>
            )}
        </Box>
        <Tooltip title="Manage categories">
          <IconButton onClick={() => setManageOpen(true)} aria-label="Manage categories"><SettingsIcon /></IconButton>
        </Tooltip>
      </Stack>

      {/* Search + filters */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <TextField
          fullWidth
          size="small"
          placeholder={activeCategory ? `Search ${activeCategory.name}` : "Search titles, ingredients, tags…"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setSearch("")}><CloseIcon fontSize="small" /></IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        <Badge badgeContent={filterCount} color="primary">
          <Button ref={filterBtn} variant="outlined" startIcon={<TuneIcon />} onClick={() => setFilterAnchor(filterBtn.current)} sx={{ whiteSpace: "nowrap", height: 40 }}>
            Filters
          </Button>
        </Badge>
      </Stack>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 2, minHeight: 24 }}>
        <Typography variant="body2" color="text.secondary">
          {isLoading ? " " : `${items.length} ${items.length === 1 ? "item" : "items"}`} · {SORT_LABELS[filters.sort]}
        </Typography>
        {activeChips}
        {activeChips.length > 0 && (
          <Button size="small" color="inherit" onClick={() => setFilters({ ...filters, favorite: false, maxMinutes: null, method: "", tags: [], ingredients: [] })}>
            Clear all
          </Button>
        )}
      </Stack>

      {/* Grid */}
      <Box sx={{
        display: "grid", gap: 2,
        gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(4, 1fr)" },
        opacity: isFetching && !isLoading ? 0.7 : 1, transition: "opacity .2s",
      }}>
        {isLoading
          ? Array.from({ length: 8 }, (_, i) => <Skeleton key={i} variant="rounded" sx={{ borderRadius: 3, aspectRatio: "4 / 4.2", height: "auto" }} />)
          : items.map((item) => (
            <ItemCard
              key={item._id}
              item={item}
              onOpen={() => navigate(`/internal/xenkitchen/${item._id}`)}
              onToggleFavorite={() => toggleFavorite(item)}
              selecting={selecting}
              selected={selected.has(item._id)}
              onToggleSelect={() => toggleSelect(item._id)}
            />
          ))}
      </Box>

      {!isLoading && items.length === 0 && (
        anyFilter ? (
          <EmptyState
            icon={<SearchIcon />}
            title="Nothing matches"
            description="Try another search or clear some filters."
            action={<Button onClick={() => setFilters({ ...filters, q: "", category: "", favorite: false, maxMinutes: null, method: "", tags: [], ingredients: [] })}>Show everything</Button>}
          />
        ) : (
          <EmptyState
            icon={<RestaurantMenuIcon />}
            title="Your kitchen is empty"
            description="Save a recipe, or snap the back of a frozen-food box so you can throw the box out."
            action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditorOpen(true)}>Add your first</Button>}
          />
        )
      )}

      {/* Bulk action bar */}
      <Slide direction="up" in={selecting} mountOnEnter unmountOnExit>
        <Paper elevation={8} sx={{
          position: "fixed", left: "50%", transform: "translateX(-50%) !important", bottom: 24, zIndex: 1200,
          px: 2, py: 1, borderRadius: 5, display: "flex", alignItems: "center", gap: 1,
        }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>{selected.size} selected</Typography>
          <Button size="small" startIcon={<DriveFileMoveIcon />} onClick={(e) => setMoveAnchor(e.currentTarget)}>Move</Button>
          <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={deleteSelected}>Delete</Button>
          <IconButton size="small" aria-label="Cancel selection" onClick={() => setSelected(new Set())}><CloseIcon fontSize="small" /></IconButton>
        </Paper>
      </Slide>
      <Menu anchorEl={moveAnchor} open={!!moveAnchor} onClose={() => setMoveAnchor(null)}>
        {categories.map((c) => (
          <MenuItem key={c._id} onClick={() => moveSelected(c._id)}>
            <CategoryIconView icon={c.icon} sx={{ fontSize: 18, color: c.color, mr: 1.5 }} />{c.name}
          </MenuItem>
        ))}
        <MenuItem onClick={() => moveSelected(null)}>Uncategorised</MenuItem>
      </Menu>

      <Fab color="primary" aria-label="New" onClick={() => setEditorOpen(true)}
        sx={{ position: "fixed", right: 20, bottom: 24, display: { xs: selecting ? "none" : "flex", sm: "none" } }}>
        <AddIcon />
      </Fab>

      <FilterPanel anchor={filterAnchor} open={!!filterAnchor} onClose={() => setFilterAnchor(null)} filters={filters} onChange={setFilters} />
      <CategoryDialog open={manageOpen} onClose={() => setManageOpen(false)} />
      <ItemEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        defaultCategoryId={activeCategory?._id ?? null}
        onSaved={(item, created) => { if (created) navigate(`/internal/xenkitchen/${item._id}`); }}
      />
    </Container>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ClearIcon from "@mui/icons-material/Clear";
import RemoveIcon from "@mui/icons-material/Remove";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import PaletteIcon from "@mui/icons-material/Palette";
import SearchIcon from "@mui/icons-material/Search";
import { useSnackbar } from "notistack";
import { useTitle } from "../../../hooks/useTitle";
import { CollectionPaint, usePaintMutations, usePaints } from "../../../hooks/recipaint/usePaints";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { cardSx, emptyStateSx, emptyStateIconCircleSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";
import { describePaintDetail, formatPaint } from "../../../../shared/recipaint/paints";
import PaintFormDialog from "./components/PaintFormDialog";

export default function Paints() {
  useTitle("My paints");
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { paints, isLoading, isError, error, refetch } = usePaints();
  const { updatePaint, deletePaint, isDeleting } = usePaintMutations();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CollectionPaint | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CollectionPaint | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search]);

  // Filtering is over the already-fetched collection - it is small and entirely local.
  const visible = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    if (!needle) return paints;
    return paints.filter((p) => `${p.brand} ${p.name} ${p.range} ${p.type}`.toLowerCase().includes(needle));
  }, [paints, debouncedSearch]);

  // Grouped by brand, since that is how a paint rack is actually organised.
  const byBrand = useMemo(() => {
    const groups = new Map<string, CollectionPaint[]>();
    for (const paint of visible) {
      const brand = paint.brand.trim() || "No brand";
      if (!groups.has(brand)) groups.set(brand, []);
      groups.get(brand)!.push(paint);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (paint: CollectionPaint) => {
    setEditing(paint);
    setFormOpen(true);
  };

  const changeQuantity = async (paint: CollectionPaint, delta: number) => {
    const quantity = Math.max(0, paint.quantity + delta);
    if (quantity === paint.quantity) return;
    try {
      await updatePaint({ id: paint._id, data: { quantity } });
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || "Couldn't update the quantity", { variant: "error" });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deletePaint(pendingDelete._id);
      enqueueSnackbar("Paint removed", { variant: "success" });
      setPendingDelete(null);
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || "Couldn't remove the paint", { variant: "error" });
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          <IconButton onClick={() => navigate("/internal/recipaint")} aria-label="Back" edge="start">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6">My paints</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ flexShrink: 0 }}>
          Add paint
        </Button>
      </Stack>

      <TextField
        fullWidth
        size="small"
        placeholder="Search by name, brand or type..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 3 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Clear search" onClick={() => setSearch("")}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />

      {isLoading && <LoadingSpinner message="Loading your paints..." />}

      {isError && <ErrorDisplay error={error} title="Couldn't load your paints" onRetry={() => refetch()} />}

      {!isLoading && !isError && visible.length === 0 && (
        <Box sx={emptyStateSx}>
          <Box sx={emptyStateIconCircleSx}>
            <PaletteIcon color="disabled" />
          </Box>
          <Typography variant="subtitle1">{paints.length === 0 ? "No paints yet" : "Nothing matches"}</Typography>
          <Typography variant="body2" color="text.secondary">
            {paints.length === 0
              ? "Add the pots on your shelf and recipes can pick from them."
              : "Try a different search."}
          </Typography>
        </Box>
      )}

      {!isLoading &&
        !isError &&
        byBrand.map(([brand, brandPaints]) => (
          <Box key={brand} sx={{ mb: 3 }}>
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="caption" sx={sectionLabelSx}>
                {brand}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {brandPaints.length} paint{brandPaints.length === 1 ? "" : "s"}
              </Typography>
            </Stack>

            <Stack spacing={1}>
              {brandPaints.map((paint) => (
                <Box
                  key={paint._id}
                  sx={{ ...cardSx, px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1.5 }}
                >
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      flexShrink: 0,
                      border: "1px solid",
                      borderColor: "divider",
                      backgroundColor: paint.hex || "transparent",
                    }}
                  />
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {paint.name}
                    </Typography>
                    {(paint.range || paint.type) && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {describePaintDetail({ range: paint.range, type: paint.type })}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <IconButton
                      size="small"
                      aria-label={`Fewer ${paint.name}`}
                      disabled={paint.quantity === 0}
                      onClick={() => changeQuantity(paint, -1)}
                    >
                      <RemoveIcon fontSize="small" />
                    </IconButton>
                    <Chip
                      size="small"
                      label={paint.quantity}
                      color={paint.quantity === 0 ? "default" : "primary"}
                      variant={paint.quantity === 0 ? "outlined" : "filled"}
                      sx={{ minWidth: 40 }}
                    />
                    <IconButton size="small" aria-label={`More ${paint.name}`} onClick={() => changeQuantity(paint, 1)}>
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </Stack>

                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                    <Tooltip title="Edit">
                      <IconButton size="small" aria-label={`Edit ${paint.name}`} onClick={() => openEdit(paint)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remove">
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Remove ${paint.name}`}
                        onClick={() => setPendingDelete(paint)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        ))}

      <PaintFormDialog open={formOpen} onClose={() => setFormOpen(false)} paint={editing} />

      <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Remove paint</DialogTitle>
        <DialogContent>
          <Typography>
            Remove {pendingDelete ? formatPaint(pendingDelete) : "this paint"} from your collection? Recipes that use
            it keep their own copy, so none of them change.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={isDeleting}>
            {isDeleting ? "Removing..." : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

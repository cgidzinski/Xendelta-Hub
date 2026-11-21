import { TimersButton } from "./timers/TimerButtons";
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CloseIcon from "@mui/icons-material/Close";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns";
import { closeSnackbar, useSnackbar } from "notistack";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import EmptyState from "../../../components/ui/EmptyState";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { useTitle } from "../../../hooks/useTitle";
import { useLocalStorageState } from "../../../hooks/useLocalStorageState";
import { canEditBook, useKitchenBooks } from "../../../hooks/xenkitchen/useKitchen";
import { useKitchenSocket } from "../../../hooks/xenkitchen/useKitchenSocket";
import {
  useAddPlanEntry,
  useCopyPlanWeek,
  usePlan,
  useRemovePlanEntry,
  useUpdatePlanEntry,
  type PlanEntry,
} from "../../../hooks/xenkitchen/usePlan";
import AddMealDialog from "./components/AddMealDialog";
import ShoppingListDialog from "./components/ShoppingListDialog";

const DAY = "yyyy-MM-dd";
const weekOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });

/** A meal on a day: its recipe (a link), how many it's for, and a way to take it off. */
function MealRow({
  entry,
  canEdit,
  bookId,
  days,
}: {
  entry: PlanEntry;
  canEdit: boolean;
  bookId: string;
  days: Date[];
}) {
  const { enqueueSnackbar } = useSnackbar();
  const update = useUpdatePlanEntry();
  const remove = useRemovePlanEntry();
  const add = useAddPlanEntry();
  const [repeatAnchor, setRepeatAnchor] = useState<HTMLElement | null>(null);
  const [servings, setServings] = useState(entry.servings === null ? "" : String(entry.servings));

  const saveServings = () => {
    const n = servings.trim() === "" ? null : Number(servings);
    if (n !== null && (!Number.isFinite(n) || n < 0.25 || n > 1000)) {
      setServings(entry.servings === null ? "" : String(entry.servings));
      enqueueSnackbar("Servings must be between 0.25 and 1000", { variant: "warning" });
      return;
    }
    if (n === entry.servings) return;
    update.mutate(
      { id: entry._id, servings: n },
      { onError: () => enqueueSnackbar("Couldn't save", { variant: "error" }) },
    );
  };

  // Takes the meal off the day, and offers to put it back (the row is gone by then, so the undo is a promise, not state).
  const removeMeal = () =>
    remove.mutateAsync(entry._id).then(
      () =>
        enqueueSnackbar(`Removed ${entry.title}`, {
          action: (key) => (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                closeSnackbar(key);
                add
                  .mutateAsync({ bookId, date: entry.date, item_id: entry.item_id, servings: entry.servings })
                  .catch((e: Error) => enqueueSnackbar(e.message || "Couldn't put it back", { variant: "error" }));
              }}
            >
              Undo
            </Button>
          ),
        }),
      () => enqueueSnackbar("Couldn't remove it", { variant: "error" }),
    );

  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ py: 0.25 }}>
      <Link
        component={RouterLink}
        to={`/internal/xenkitchen/${entry.item_id}`}
        underline="hover"
        sx={{ flex: 1, minWidth: 0 }}
      >
        <Typography variant="body2" noWrap>
          {entry.title}
        </Typography>
      </Link>
      {canEdit ? (
        <TextField
          size="small"
          type="number"
          value={servings}
          onChange={(e) => setServings(e.target.value)}
          onBlur={saveServings}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder={entry.recipe_servings ? String(entry.recipe_servings) : "–"}
          sx={{ width: 76 }}
          slotProps={{
            htmlInput: { min: 0.25, max: 1000, step: "any", "aria-label": `Servings for ${entry.title}` },
            input: { sx: { fontSize: 13, "& input": { py: 0.5 } } },
          }}
        />
      ) : (
        <Typography variant="caption" color="text.secondary">
          {entry.servings ?? entry.recipe_servings ?? ""}
        </Typography>
      )}
      {canEdit && (
        <>
          <IconButton
            size="small"
            aria-label={`Repeat ${entry.title} on another day`}
            onClick={(e) => setRepeatAnchor(e.currentTarget)}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
          <Menu open={!!repeatAnchor} anchorEl={repeatAnchor} onClose={() => setRepeatAnchor(null)}>
            {days
              .filter((d) => format(d, DAY) !== entry.date)
              .map((d) => (
                <MenuItem
                  key={d.toISOString()}
                  onClick={() => {
                    setRepeatAnchor(null);
                    add.mutate(
                      { bookId, date: format(d, DAY), item_id: entry.item_id, servings: entry.servings },
                      {
                        onSuccess: () => enqueueSnackbar(`Added to ${format(d, "EEEE")}`, { variant: "success" }),
                        onError: (e) =>
                          enqueueSnackbar((e as Error).message || "Couldn't add it", { variant: "error" }),
                      },
                    );
                  }}
                >
                  {format(d, "EEEE, MMM d")}
                </MenuItem>
              ))}
          </Menu>
        </>
      )}
      {canEdit && (
        <IconButton size="small" aria-label={`Remove ${entry.title}`} disabled={remove.isPending} onClick={removeMeal}>
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Stack>
  );
}

/** Plan the week's meals from a recipe book, then make the shopping list for them. */
export default function MealPlan() {
  useTitle("Meal plan");
  // Plans are shared per book: a meal someone else adds shows up here.
  useKitchenSocket();
  const { enqueueSnackbar } = useSnackbar();
  const { books, isLoading: booksLoading } = useKitchenBooks();
  const [savedBook, setSavedBook] = useLocalStorageState<string>(
    "xenkitchen:plan:book",
    "",
    (v): v is string => typeof v === "string",
  );
  const book = books.find((b) => b._id === savedBook) ?? books[0];
  const canEdit = canEditBook(book?.my_role);

  const [weekStart, setWeekStart] = useState(() => weekOf(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = format(days[0], DAY);
  const to = format(days[6], DAY);
  const rangeLabel = `${format(days[0], "MMM d")} – ${format(days[6], "MMM d")}`;

  const { data: entries = [], isLoading, isError, error, refetch } = usePlan(book?._id, from, to);
  const add = useAddPlanEntry();
  const copyWeek = useCopyPlanWeek();
  const [adding, setAdding] = useState<Date | null>(null);
  const [shopping, setShopping] = useState(false);

  if (booksLoading) return <ListSkeleton rows={4} height={96} />;
  if (!book) {
    return (
      <PageContainer>
        <PageHeader title="Meal plan" actions={<TimersButton compact />} />
        <EmptyState
          title="No recipe book yet"
          description="Open XenKitchen first to make your recipe book, then plan meals from it."
        />
      </PageContainer>
    );
  }

  const copyLastWeek = () => {
    copyWeek.mutate(
      { bookId: book._id, from: format(addWeeks(weekStart, -1), DAY), to: from },
      {
        onSuccess: ({ copied }) =>
          enqueueSnackbar(
            copied === 0
              ? "Nothing to copy from last week"
              : `Copied ${copied} ${copied === 1 ? "meal" : "meals"} from last week`,
            { variant: copied === 0 ? "info" : "success" },
          ),
        onError: (e) => enqueueSnackbar((e as Error).message || "Couldn't copy the week", { variant: "error" }),
      },
    );
  };

  const pick = (itemId: string) => {
    if (!adding) return;
    const date = format(adding, DAY);
    add.mutate(
      { bookId: book._id, date, item_id: itemId },
      { onError: (e) => enqueueSnackbar((e as Error).message || "Couldn't add it", { variant: "error" }) },
    );
    setAdding(null);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Meal plan"
        actions={
          <Stack direction="row" spacing={1}>
            <TimersButton compact />
            <Button variant="contained" startIcon={<ShoppingCartOutlinedIcon />} onClick={() => setShopping(true)}>
              Shopping list
            </Button>
          </Stack>
        }
      />

      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {books.length > 1 && (
          <TextField
            select
            size="small"
            value={book._id}
            onChange={(e) => setSavedBook(e.target.value)}
            sx={{ minWidth: 160 }}
            slotProps={{ htmlInput: { "aria-label": "Recipe book" } }}
          >
            {books.map((b) => (
              <MenuItem key={b._id} value={b._id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Previous week">
          <IconButton aria-label="Previous week" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
            <ChevronLeftIcon />
          </IconButton>
        </Tooltip>
        <Typography sx={{ fontWeight: 600, minWidth: 120, textAlign: "center" }}>{rangeLabel}</Typography>
        <Tooltip title="Next week">
          <IconButton aria-label="Next week" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
            <ChevronRightIcon />
          </IconButton>
        </Tooltip>
        <Button size="small" onClick={() => setWeekStart(weekOf(new Date()))}>
          This week
        </Button>
        {canEdit && (
          <Button size="small" startIcon={<ContentCopyIcon />} onClick={copyLastWeek} disabled={copyWeek.isPending}>
            Copy last week
          </Button>
        )}
      </Stack>

      {!canEdit && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          You can see this plan and make a shopping list, but only editors of “{book.name}” can change it.
        </Typography>
      )}

      {isLoading ? (
        <ListSkeleton rows={4} height={96} />
      ) : isError ? (
        <ErrorDisplay error={error as Error} onRetry={() => refetch()} />
      ) : (
        <Stack spacing={1.25}>
          {days.map((day) => {
            const meals = entries.filter((e) => e.date === format(day, DAY));
            const today = isSameDay(day, new Date());
            return (
              <Card
                key={day.toISOString()}
                variant="outlined"
                sx={{ p: 1.5, borderColor: today ? "primary.main" : undefined }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography sx={{ fontWeight: 600, flex: 1 }}>
                    {format(day, "EEEE")}{" "}
                    <Typography component="span" variant="body2" color="text.secondary">
                      {format(day, "MMM d")}
                      {today ? " · today" : ""}
                    </Typography>
                  </Typography>
                  {canEdit && (
                    <Button
                      size="small"
                      startIcon={<AddIcon />}
                      onClick={() => setAdding(day)}
                      aria-label={`Add a meal on ${format(day, "EEEE")}`}
                    >
                      Add
                    </Button>
                  )}
                </Stack>
                {meals.length === 0 ? (
                  <Typography variant="body2" color="text.disabled">
                    Nothing planned
                  </Typography>
                ) : (
                  meals.map((m) => <MealRow key={m._id} entry={m} canEdit={canEdit} bookId={book._id} days={days} />)
                )}
              </Card>
            );
          })}
        </Stack>
      )}

      <AddMealDialog
        open={!!adding}
        bookId={book._id}
        dayLabel={adding ? format(adding, "EEEE, MMM d") : ""}
        onClose={() => setAdding(null)}
        onPick={pick}
      />
      <ShoppingListDialog
        open={shopping}
        bookId={book._id}
        from={from}
        to={to}
        rangeLabel={rangeLabel}
        onClose={() => setShopping(false)}
      />
    </PageContainer>
  );
}

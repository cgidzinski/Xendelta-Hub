import { useEffect, useMemo, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import { useSnackbar } from "notistack";
import {
    Alert, Box, Button, Chip, Divider, IconButton, InputAdornment,
    MenuItem, Stack, TextField, Tooltip, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import DownloadIcon from "@mui/icons-material/Download";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import { startOfMonth } from "date-fns";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetItems, exportItemsCsv, type ItemFilters } from "../../../hooks/xenbudget/useItems";
import ItemListItem from "./components/ItemListItem";
import ItemFilterSelect from "./components/ItemFilterSelect";
import {
    CATEGORY_PREFIX, PERSON_PREFIX, TYPE_EXPENSE, TYPE_INCOME, NEED_FILTER, WANT_FILTER,
    FLAG_NEEDS_REVIEW, FLAG_UNCATEGORISED, buildFilterOptions,
} from "./components/itemFilterOptions";
import TimePeriodFilter, { itemQuickPicks } from "./components/TimePeriodFilter";
import { resolvePeriod } from "./components/periodMode";
import ReviewModal from "./components/ReviewModal";
import ItemsTotalsBar from "./components/ItemsTotalsBar";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { groupByDay, dateOnlyToLocal } from "../../../utils/dateGrouping";
import { emptyStateSx, emptyStateIconCircleSx, sectionLabelSx } from "../../../components/ui/surfaceStyles";
import { FLAG_OFF_BUDGET } from "../../../constants/xenbudget";

/** What a budget hands over when its "View items" action navigates here. */
interface BudgetFilterSeed {
    categories: string[];
    from: string;
    to: string;
    period: string;
}

/**
 * What the Recurring card and the merchant report hand over. Unlike a budget seed it
 * carries no window — the point of opening a merchant is to see its whole history, so it
 * widens the shared period to "all" rather than inheriting whatever was last set.
 */
interface MerchantSeed {
    merchant: string;
}

export default function BookItems() {
    const {
        book, onPreviewItem, period, onPeriodChange,
    } = useOutletContext<BookDetailContext>();
    // "View items" on a budget hands over that budget's scope and window, so the tab opens
    // showing the items the bar was measuring rather than everything in the book. It moves
    // the shared window rather than shadowing it, so the Overview you came from and the
    // Report agree with what's on screen here.
    const navigationState = useLocation().state as {
        budgetFilter?: BudgetFilterSeed;
        merchantSeed?: MerchantSeed;
    } | null;
    const seed = navigationState?.budgetFilter;
    const merchantSeed = navigationState?.merchantSeed;
    const [search, setSearch] = useState("");
    // Held as its own filter rather than dropped into the search box: the merchant name is
    // normalised ("NETFLIX.COM 8829472" -> "NETFLIX COM"), so as literal search text it
    // would match nothing at all.
    const [merchant, setMerchant] = useState<string | null>(merchantSeed?.merchant ?? null);
    // A merchant is opened to see its whole history, so it widens the shared window. Same
    // shape as the budget seed's effect below: it moves the shared period rather than
    // shadowing it, so the card you came from and this list agree.
    useEffect(() => {
        if (!merchantSeed) return;
        setMerchant(merchantSeed.merchant);
        onPeriodChange({ kind: "all" });
        // Only when a fresh seed arrives — otherwise this would fight the period button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [merchantSeed?.merchant]);
    useEffect(() => {
        if (!seed) return;
        // A monthly budget's window is one whole calendar month, so carry it as that month
        // — an anchor that stays named "August 2026" rather than a frozen day range.
        // Every other period keeps its exact window as a custom range.
        onPeriodChange(seed.period === "monthly"
            ? { kind: "month", anchor: startOfMonth(dateOnlyToLocal(seed.from)) }
            : {
                kind: "custom",
                from: dateOnlyToLocal(seed.from),
                // The budget's window ends exclusively; a period's end is inclusive of that
                // whole day, so it steps back an instant to name the last covered day.
                to: dateOnlyToLocal(new Date(new Date(seed.to).getTime() - 1)),
            });
        // Only when a fresh seed arrives — otherwise this would fight the period button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seed?.from, seed?.to, seed?.period]);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const { enqueueSnackbar } = useSnackbar();
    // Which source/card the list is narrowed to: "all", "manual", "csv", or "card:<id>".
    const [sourceFilter, setSourceFilter] = useState("all");
    // Seeded categories (from a budget's "View items") start pre-selected in the dropdown.
    const [selectedFilters, setSelectedFilters] = useState<string[]>(
        (seed?.categories ?? []).map((name) => CATEGORY_PREFIX + name),
    );

    const filterOptions = useMemo(() => buildFilterOptions(book), [book]);

    // Filtering happens server-side (the list is paginated), so the filter object is part
    // of the query key rather than a useMemo over an already-loaded array.
    const filters: ItemFilters = useMemo(() => {
        const realFlags = selectedFilters.filter(
            (f) => ![
                FLAG_UNCATEGORISED, TYPE_EXPENSE, TYPE_INCOME,
                NEED_FILTER, WANT_FILTER,
            ].includes(f) && !f.startsWith(CATEGORY_PREFIX) && !f.startsWith(PERSON_PREFIX),
        );
        const selectedCategories = selectedFilters
            .filter((f) => f.startsWith(CATEGORY_PREFIX))
            .map((f) => f.slice(CATEGORY_PREFIX.length));
        const selectedPeople = selectedFilters
            .filter((f) => f.startsWith(PERSON_PREFIX))
            .map((f) => f.slice(PERSON_PREFIX.length));
        const wantsExpense = selectedFilters.includes(TYPE_EXPENSE);
        const wantsIncome = selectedFilters.includes(TYPE_INCOME);
        const wantsNeed = selectedFilters.includes(NEED_FILTER);
        const wantsWant = selectedFilters.includes(WANT_FILTER);
        const source = sourceFilter === "all" || sourceFilter.startsWith("card:")
            ? undefined
            : (sourceFilter as ItemFilters["source"] || undefined);
        const card = sourceFilter.startsWith("card:") ? sourceFilter.slice(5) : undefined;
        // "All time" drops the date bounds entirely rather than widening them — cheaper,
        // and the same query the list ran before every tab shared one window.
        const { from, to, bounded } = resolvePeriod(period);
        return {
            ...(bounded ? { from: from.toISOString(), to: to.toISOString() } : {}),
            q: search.trim() || undefined,
            categories: selectedCategories.length ? selectedCategories : undefined,
            people: selectedPeople.length ? selectedPeople : undefined,
            flags: realFlags.length ? realFlags : undefined,
            // Selecting both (or neither) means "all types" — no filter to apply.
            type: wantsExpense !== wantsIncome ? (wantsExpense ? "expense" : "income") : undefined,
            need_want: wantsNeed !== wantsWant ? (wantsNeed ? "need" : "want") : undefined,
            // The *state* of having no category, not just the flag — so a hand-entered
            // item with no category is caught too, not only ones an import flagged.
            uncategorised: selectedFilters.includes(FLAG_UNCATEGORISED) || undefined,
            excluded: selectedFilters.includes(FLAG_OFF_BUDGET) ? "all" : "hidden",
            source,
            card,
            merchant: merchant ?? undefined,
        };
    }, [period, search, selectedFilters, sourceFilter, merchant]);

    const {
        items, totals, isLoading, isError, error, hasMore, loadMore, isLoadingMore,
    } = useXenBudgetItems(book._id, filters);

    const dayGroups = useMemo(() => groupByDay(items, (i) => i.date, "UTC"), [items]);

    const reviewCount = book.review_count ?? 0;
    const needsReviewCount = book.needs_review_count ?? 0;
    const needsReviewFilterActive = selectedFilters.includes(FLAG_NEEDS_REVIEW);

    const toggleNeedsReviewFilter = () =>
        setSelectedFilters((prev) =>
            prev.includes(FLAG_NEEDS_REVIEW)
                ? prev.filter((f) => f !== FLAG_NEEDS_REVIEW)
                : [...prev, FLAG_NEEDS_REVIEW],
        );

    const exportView = async () => {
        setIsExporting(true);
        try {
            await exportItemsCsv(book._id, filters, book.name);
        } catch {
            enqueueSnackbar("Could not export these items", { variant: "error" });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box sx={{ pl: 2, pr: { xs: 2, sm: 3.5 }, pt: 2, flexShrink: 0 }}>
                <Stack spacing={1.5} sx={{ mb: 2 }}>
                    {needsReviewCount > 0 && (
                        <Alert
                            severity="error"
                            variant="outlined"
                            sx={{ alignItems: "center" }}
                            action={
                                <Button
                                    size="small"
                                    variant="contained"
                                    color="error"
                                    startIcon={<FactCheckIcon />}
                                    onClick={toggleNeedsReviewFilter}
                                >
                                    {needsReviewFilterActive ? "Clear" : "Show"}
                                </Button>
                            }
                        >
                            {needsReviewCount} Flagged
                        </Alert>
                    )}
                    {reviewCount > 0 && (
                        <Alert
                            severity="warning"
                            variant="outlined"
                            sx={{ alignItems: "center" }}
                            action={
                                <Button
                                    size="small" variant="contained" color="warning"
                                    startIcon={<FactCheckIcon />}
                                    onClick={() => setReviewOpen(true)}
                                >
                                    Review
                                </Button>
                            }
                        >
                            {reviewCount} Missing Category
                        </Alert>
                    )}
                    {merchant && (
                        <Chip
                            size="small"
                            variant="outlined"
                            icon={<AutorenewIcon sx={{ fontSize: 14 }} />}
                            label={`Merchant: ${merchant}`}
                            onDelete={() => setMerchant(null)}
                            sx={{ alignSelf: "flex-start" }}
                        />
                    )}
                    {/* Search and export share a line: export acts on the view rather
                    than describing it, and the filter row below needs its whole width for
                    the three filters. */}
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TextField
                            size="small" placeholder="Search descriptions"
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            sx={{ flexGrow: 1, minWidth: 0 }}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                                    ),
                                },
                            }}
                        />
                        <Tooltip title="Export this view as CSV">
                            {/* A span, because a disabled button fires no events and the
                            tooltip would have nothing to listen to. */}
                            <span>
                                <IconButton
                                    size="small"
                                    sx={{ height: 40, width: 40, flexShrink: 0 }}
                                    disabled={isExporting || items.length === 0}
                                    onClick={exportView}
                                >
                                    <DownloadIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                    {/* One row at every width, phones included - which is what #128 was
                    after and #129 had to give up on.

                    Neither of those fixes is being reverted here; what they were working
                    around is gone. #128 collapsed the Autocomplete input's min-width and
                    padding with !important so a lone chip would not wrap the field onto a
                    second line, and #129 gave Filters the whole first mobile line once the
                    shared window made the period button read "August 2026" (135-152px)
                    instead of "All". The filter is a trigger button now: it renders a
                    summary ("All", "3", "Groceries +2"), never chips, so it cannot grow -
                    and the period pill shortens to "Aug 26" under sm. Measured at 360px
                    the three come to ~270 of the 312px the row has. */}
                    <Stack
                        useFlexGap direction="row" spacing={1}
                        alignItems="center" sx={{ flexWrap: "nowrap", minWidth: 0 }}
                    >
                        <TextField
                            select size="small" label="Source" value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                            sx={{
                                /* Sizes to its value rather than the default 180px, but
                                capped on a phone: a saved card can be named anything, and
                                the row never wraps, so an unbounded Source would push the
                                page sideways instead. It ellipsises past the cap. */
                                flexShrink: 1, minWidth: 0, maxWidth: { xs: 124, sm: "none" },
                                "& .MuiInputBase-root": { width: "auto", maxWidth: "100%" },
                            }}
                        >
                            <MenuItem value="all">All</MenuItem>
                            <MenuItem value="manual">Manual</MenuItem>
                            <MenuItem value="csv">Imported</MenuItem>
                            {book.import_presets.length > 0 && <Divider />}
                            {book.import_presets.map((p) => (
                                <MenuItem key={p._id} value={`card:${p._id}`}>{p.name}</MenuItem>
                            ))}
                        </TextField>
                        <ItemFilterSelect
                            options={filterOptions}
                            value={selectedFilters}
                            onChange={setSelectedFilters}
                            members={book.members}
                            categories={book.categories}
                            flags={book.flags}
                            /* Takes whatever the two fixed-width neighbours leave, so the
                            row has no ragged gap in the middle. It still never shrinks
                            below its summary (flexShrink stays 0 in the component), which
                            is what keeps the three on one line on a phone. */
                            sx={{ flexGrow: 1 }}
                        />
                        <TimePeriodFilter
                            mode={period} onModeChange={onPeriodChange}
                            quickPicks={itemQuickPicks()}
                            /* A small Button is 30px and a small TextField is 40, so
                            without this the pill sits two thirds the height of Source
                            beside it. Pinned to the fields' height, same as the filter
                            button. */
                            sx={{ height: 40 }}
                        />
                    </Stack>
                    {!isLoading && <ItemsTotalsBar totals={totals} />}
                </Stack>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pl: 2, pr: { xs: 2, sm: 3.5 }, pb: 2 }}>
                {isError ? (
                    <ErrorDisplay error={error} />
                ) : isLoading ? (
                    <LoadingSpinner message="Loading items..." />
                ) : items.length === 0 ? (
                    <Box sx={emptyStateSx}>
                        <Box sx={emptyStateIconCircleSx}>
                            <ReceiptLongIcon color="disabled" />
                        </Box>
                        <Typography variant="subtitle1">Nothing here</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {search || period.kind !== "all" || merchant
                                || selectedFilters.length > 0 || sourceFilter !== "all"
                                ? "No items match those filters."
                                : "Add your first item, or import a CSV from your bank."}
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        {dayGroups.map((group) => (
                            <Box key={group.key}>
                                <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.75 }}>
                                    {group.label}
                                </Typography>
                                <Stack spacing={0.75}>
                                    {group.items.map((item) => (
                                        <ItemListItem
                                            key={item._id}
                                            item={item}
                                            members={book.members}
                                            categoryRegistry={book.categories}
                                            flagRegistry={book.flags}
                                            onClick={onPreviewItem}
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        ))}
                        {hasMore && (
                            <Button onClick={() => loadMore()} disabled={isLoadingMore} sx={{ alignSelf: "center" }}>
                                {isLoadingMore ? "Loading..." : "Load more"}
                            </Button>
                        )}
                    </Stack>
                )}
            </Box>

            <ReviewModal
                open={reviewOpen} onClose={() => setReviewOpen(false)}
                book={book}
            />
        </Box>
    );
}

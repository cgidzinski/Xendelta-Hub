import { useEffect, useMemo, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import {
    Alert, Autocomplete, Avatar, Box, Button, Chip, Divider, InputAdornment, MenuItem, Stack, TextField, Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import { startOfMonth } from "date-fns";
import type { BookDetailContext } from "./BookDetail";
import { useXenBudgetItems, type ItemFilters } from "../../../hooks/xenbudget/useItems";
import ItemListItem from "./components/ItemListItem";
import { CategoryChip, FlagChip } from "./components/LabelChip";
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

// Synthetic options in the filters dropdown below — not real flags or fields on the item.
const TYPE_EXPENSE = "__type_expense__";
const TYPE_INCOME = "__type_income__";
const NEED_FILTER = "__need__";
const WANT_FILTER = "__want__";
// Categories are prefixed so a category name can never collide with a flag name in the
// shared dropdown (both registries allow the same string).
const CATEGORY_PREFIX = "__category__";
// People are prefixed so a member's name can never collide with a category/flag name.
const PERSON_PREFIX = "__person__";
// The built-in flag the importer uses to say "nothing matched" — special-cased below so
// selecting it also catches items with no category that were never run through an import.
const FLAG_UNCATEGORISED = "Uncategorised";
const FLAG_NEEDS_REVIEW = "Needs review";

export default function BookItems() {
    const {
        book, onPreviewItem, period, onPeriodChange,
    } = useOutletContext<BookDetailContext>();
    // "View items" on a budget hands over that budget's scope and window, so the tab opens
    // showing the items the bar was measuring rather than everything in the book. It moves
    // the shared window rather than shadowing it, so the Overview you came from and the
    // Report agree with what's on screen here.
    const seed = (useLocation().state as { budgetFilter?: BudgetFilterSeed } | null)?.budgetFilter;
    const [search, setSearch] = useState("");
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
    // Which source/card the list is narrowed to: "all", "manual", "csv", or "card:<id>".
    const [sourceFilter, setSourceFilter] = useState("all");
    // Seeded categories (from a budget's "View items") start pre-selected in the dropdown.
    const [selectedFilters, setSelectedFilters] = useState<string[]>(
        (seed?.categories ?? []).map((name) => CATEGORY_PREFIX + name),
    );

    const filterOptions = useMemo(
        () => [
            TYPE_EXPENSE, TYPE_INCOME, NEED_FILTER, WANT_FILTER,
            ...book.categories.map((c) => CATEGORY_PREFIX + c.name),
            ...book.members.map((m) => PERSON_PREFIX + m.user_id),
            ...book.flags.map((f) => f.name),
        ],
        [book.categories, book.members, book.flags],
    );

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
        };
    }, [period, search, selectedFilters, sourceFilter]);

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

    // Label for a filter option value. People show their username; categories drop the
    // prefix; everything else is a fixed label or the raw value.
    const optionLabel = (o: string) => (
        o === TYPE_EXPENSE ? "Expenses"
            : o === TYPE_INCOME ? "Income"
                : o === NEED_FILTER ? "Need"
                    : o === WANT_FILTER ? "Want"
                        : o.startsWith(CATEGORY_PREFIX) ? o.slice(CATEGORY_PREFIX.length)
                            : o.startsWith(PERSON_PREFIX)
                                ? (book.members.find((m) => m.user_id === o.slice(PERSON_PREFIX.length))?.username ?? o.slice(PERSON_PREFIX.length))
                                : o
    );

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
                    <TextField
                        size="small" fullWidth placeholder="Search descriptions"
                        value={search} onChange={(e) => setSearch(e.target.value)}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                                ),
                            },
                        }}
                    />
                    {/* One row from sm up; on a phone Filters takes the whole first line
                    and Source and the period pill share the one below.

                    #128 deliberately went the other way and put this back on a single
                    row, so this is not that decision being undone by accident. What
                    changed under it is the period button's label: it used to read "All"
                    by default, and now the window is shared across the tabs it reads
                    "August 2026", or "Last 3 months". Measured at 360px, the row needs
                    the button at ~99px to fit and those labels take 135-152, so a single
                    row now scrolls the page sideways. #128's real fix - collapsing the
                    input's min-width and padding, just below - is untouched and still
                    what keeps a lone chip on one 40px line at every width. */}
                    <Stack
                        useFlexGap direction="row" spacing={1}
                        alignItems="flex-start" sx={{ flexWrap: "wrap" }}
                    >
                        <TextField
                            select size="small" label="Source" value={sourceFilter}
                            onChange={(e) => setSourceFilter(e.target.value)}
                            sx={{
                                flexShrink: 0, order: { xs: 2, sm: 0 },
                                "& .MuiInputBase-root": { width: "auto" },
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
                        <Autocomplete
                            multiple disableCloseOnSelect size="small" options={filterOptions}
                            value={selectedFilters} onChange={(_, v) => setSelectedFilters(v)}
                            sx={{
                                flexGrow: 1, minWidth: 0,
                                flexBasis: { xs: "100%", sm: 0 },
                                order: { xs: 1, sm: 0 },
                                /* The text input MUI puts inside the field is flex-grow
                                with a 30px min-width and 12px of horizontal padding, so on
                                a phone it couldn't fit in what a chip left over and wrapped
                                onto a line of its own - a blank strip under a single chip,
                                which is what this collapses. Both have to go: the padding
                                is on a content-box, so it sets a floor of its own even at
                                zero width. The chips still wrap when THEY need the room,
                                which is the only time the field should grow.

                                Only while chips are present - an empty field is all input,
                                and wants its padding to sit the placeholder off the edge.
                                Focus restores both, so there is somewhere to type once you
                                are actually typing.

                                `!important` rather than a longer selector: MUI sets these
                                two from different places at three and four classes deep,
                                and a plain override silently loses to whichever is deeper
                                instead of failing loudly. */
                                ...(selectedFilters.length > 0 && {
                                    "& .MuiAutocomplete-input": {
                                        minWidth: "0 !important",
                                        paddingLeft: "0 !important",
                                        paddingRight: "0 !important",
                                    },
                                    "&:focus-within .MuiAutocomplete-input": {
                                        minWidth: "60px !important",
                                        paddingLeft: "8px !important",
                                    },
                                }),
                            }}
                            groupBy={(o) => (
                                o === TYPE_EXPENSE || o === TYPE_INCOME ? "Type"
                                    : o === NEED_FILTER || o === WANT_FILTER ? "Need / Want"
                                        : o.startsWith(CATEGORY_PREFIX) ? "Categories"
                                            : o.startsWith(PERSON_PREFIX) ? "People"
                                                : "Flags"
                            )}
                            getOptionLabel={optionLabel}
                            renderOption={(props, option) => {
                                const { key, ...optionProps } = props;
                                if (option.startsWith(PERSON_PREFIX)) {
                                    const member = book.members.find(
                                        (m) => m.user_id === option.slice(PERSON_PREFIX.length),
                                    );
                                    return (
                                        <Box component="li" key={key} {...optionProps} sx={{ gap: 1 }}>
                                            <Avatar
                                                src={member?.avatar || undefined}
                                                alt={member?.username}
                                                sx={{ width: 20, height: 20, fontSize: 10 }}
                                            >
                                                {member?.username[0]?.toUpperCase()}
                                            </Avatar>
                                            {member?.username ?? option.slice(PERSON_PREFIX.length)}
                                        </Box>
                                    );
                                }
                                return (
                                    <Box component="li" key={key} {...optionProps}>
                                        {optionLabel(option)}
                                    </Box>
                                );
                            }}
                            renderTags={(value, getTagProps) => value.map((option, index) => {
                                const { key, ...tagProps } = getTagProps({ index });
                                if (option === TYPE_EXPENSE) {
                                    return (
                                        <Chip
                                            key={key} size="small" label="Expenses"
                                            icon={<TrendingDownIcon fontSize="small" />} {...tagProps}
                                        />
                                    );
                                }
                                if (option === TYPE_INCOME) {
                                    return (
                                        <Chip
                                            key={key} size="small" label="Income" color="success"
                                            icon={<TrendingUpIcon fontSize="small" />} {...tagProps}
                                        />
                                    );
                                }
                                if (option === NEED_FILTER) {
                                    return <Chip key={key} size="small" label="Need" {...tagProps} />;
                                }
                                if (option === WANT_FILTER) {
                                    return <Chip key={key} size="small" label="Want" {...tagProps} />;
                                }
                                if (option.startsWith(CATEGORY_PREFIX)) {
                                    return (
                                        <CategoryChip
                                            key={key}
                                            name={option.slice(CATEGORY_PREFIX.length)}
                                            registry={book.categories}
                                            {...tagProps}
                                        />
                                    );
                                }
                                if (option.startsWith(PERSON_PREFIX)) {
                                    const member = book.members.find(
                                        (m) => m.user_id === option.slice(PERSON_PREFIX.length),
                                    );
                                    return (
                                        <Chip
                                            key={key}
                                            size="small"
                                            label={member?.username ?? option.slice(PERSON_PREFIX.length)}
                                            avatar={member?.avatar
                                                ? <Avatar src={member.avatar} sx={{ width: 16, height: 16, fontSize: 10 }} />
                                                : undefined}
                                            {...tagProps}
                                        />
                                    );
                                }
                                return <FlagChip key={key} name={option} registry={book.flags} {...tagProps} />;
                            })}
                            renderInput={(params) => (
                                <TextField
                                    {...params} label="Filters"
                                    placeholder={selectedFilters.length ? undefined : "Filter items"}
                                />
                            )}
                        />
<TimePeriodFilter
                            mode={period} onModeChange={onPeriodChange}
                            quickPicks={itemQuickPicks()}
                            /* A small Button is 30px and a small TextField is 40, so the
                            row's default stretch was quietly sizing this to match - and
                            stretching it to two lines tall whenever the filters wrapped.
                            Pinned to the fields' height instead, so it matches them and
                            stays put. */
                            sx={{ height: 40, order: { xs: 3, sm: 0 } }}
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
                            {search || period.kind !== "all"
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

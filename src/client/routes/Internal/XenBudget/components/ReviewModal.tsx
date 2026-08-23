import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
    Avatar, AvatarGroup, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Stack, Typography, alpha,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import CloseIcon from "@mui/icons-material/Close";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import { useSnackbar } from "notistack";
import { format } from "date-fns";
import type { XenBudgetBook, XenBudgetItem, XenBudgetMember, UpdateItemInput, ShareType, RuleInput } from "../../../../hooks/xenbudget/types";
import { useXenBudgetItemMutations, useXenBudgetItems } from "../../../../hooks/xenbudget/useItems";
import { useXenBudgetRules } from "../../../../hooks/xenbudget/useRules";
import { formatCurrency } from "../currency";
import { emptyStateSx, emptyStateIconCircleSx, sectionLabelSx } from "../../../../components/ui/surfaceStyles";
import LoadingSpinner from "../../../../components/LoadingSpinner";
import { CategoryChip, FlagChip } from "./LabelChip";
import WeightedSplitEditor, { type SplitDraft } from "./WeightedSplitEditor";
import RuleForm from "./RuleForm";
import { xbCardSx, xbBadgeSx } from "./rowStyles";

// The system "Needs review" flag — mirrors FLAG_NEEDS_REVIEW server-side
// (src/server/constants/xenbudget.ts). Flags travel by name, not id.
const FLAG_NEEDS_REVIEW = "Needs review";

interface ReviewModalProps {
    open: boolean;
    onClose: () => void;
    book: XenBudgetBook;
}

/**
 * Steps through uncategorised items one at a time. Picking one or more categories and
 * pressing Next saves them as an even split and advances; a "Needs review" checkbox lets
 * the reviewer flag the item for later attention.
 */
export default function ReviewModal({ open, onClose, book }: ReviewModalProps) {
    const isMobile = useMediaQuery("(max-width:600px)");
    const { enqueueSnackbar } = useSnackbar();

    // Disabled (via an empty bookId) while closed, so sitting on the Items tab doesn't keep
    // a review query warm that nobody's looking at.
    const { items, isLoading, hasMore, loadMore } = useXenBudgetItems(
        open ? book._id : "",
        { review: true },
    );
    const { updateItemAsync } = useXenBudgetItemMutations(book._id);
    const { createRuleAsync, isCreatingRule, reapplyAsync, isReapplying } = useXenBudgetRules(book._id);

    // The rule form, opened by "Setup Auto Tag" and prefilled from the item being reviewed.
    const [prefill, setPrefill] = useState<RuleInput | null>(null);
    const [ruleFormOpen, setRuleFormOpen] = useState(false);

    // Saved/dismissed items are hidden immediately rather than waiting on the mutation's
    // background refetch to land — the list just needs to *look* like it shrank right away.
    const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
    const [index, setIndex] = useState(0);
    const [saving, setSaving] = useState(false);
    // Categories chosen for the current item. Pre-seeded with any the item already has,
    // so a "Needs review" item with a custom split shows its split rather than a blank.
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    // Whether the current item is flagged "Needs review" — edited via the checkbox.
    const [needsReview, setNeedsReview] = useState(false);
    // How the chosen categories divide the item. Only shown when two or more are picked.
    const [splitType, setSplitType] = useState<ShareType>("equal");
    // Raw text per category, so a half-typed amount isn't clobbered mid-keystroke.
    const [categoryValues, setCategoryValues] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            setResolvedIds(new Set());
            setIndex(0);
        }
    }, [open]);

    const queueItems = useMemo(
        () => items.filter((i) => !resolvedIds.has(i._id)),
        [items, resolvedIds],
    );
    const currentItem: XenBudgetItem | undefined = queueItems[index];

    useEffect(() => {
        setSelectedCategories(currentItem ? currentItem.categories.map((c) => c.name) : []);
        setNeedsReview(currentItem ? currentItem.flags.includes(FLAG_NEEDS_REVIEW) : false);
        setSplitType(currentItem?.category_split_type ?? "equal");
        setCategoryValues(Object.fromEntries(
            (currentItem?.categories ?? []).map((c) => [
                c.name,
                currentItem?.category_split_type === "percent"
                    ? String(c.percentage ?? "")
                    : String(c.amount ?? ""),
            ]),
        ));
    }, [currentItem]);

    // Buffer ahead so advancing near the end of a page doesn't stall on a fetch.
    useEffect(() => {
        if (open && hasMore && index >= queueItems.length - 2) loadMore();
    }, [open, hasMore, index, queueItems.length, loadMore]);

    const resolve = async (input: UpdateItemInput) => {
        if (!currentItem || saving) return;
        setSaving(true);
        try {
            await updateItemAsync({ itemId: currentItem._id, input });
            setResolvedIds((prev) => new Set(prev).add(currentItem._id));
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Failed to save item", { variant: "error" });
        } finally {
            setSaving(false);
        }
    };

    const toggleCategory = (name: string) => {
        setSelectedCategories((prev) =>
            prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
        );
    };

    const categoryDrafts: SplitDraft[] = useMemo(
        () => selectedCategories.map((name) => ({
            key: name,
            value: categoryValues[name] ?? "",
        })),
        [selectedCategories, categoryValues],
    );

    const handleDraftsChange = (drafts: SplitDraft[]) => {
        setCategoryValues(Object.fromEntries(drafts.map((d) => [d.key, d.value])));
    };

    // Switching split type re-seeds the fields so a value in one unit never carries over
    // into another (even -> exact -> percent used to leave "$120" showing as "120%").
    const handleSplitTypeChange = (t: ShareType) => {
        setSplitType(t);
        if (!currentItem || selectedCategories.length === 0) return;
        if (t === "exact") {
            const each = Math.round((currentItem.amount / selectedCategories.length) * 100) / 100;
            setCategoryValues(Object.fromEntries(
                selectedCategories.map((name) => [name, String(each)]),
            ));
        } else if (t === "percent") {
            const each = Math.round((100 / selectedCategories.length) * 100) / 100;
            setCategoryValues(Object.fromEntries(
                selectedCategories.map((name) => [name, String(each)]),
            ));
        } else {
            setCategoryValues({});
        }
    };

    const handleNext = () => {
        if (!currentItem || saving) return;
        const hasCategories = selectedCategories.length > 0;
        if (!hasCategories && !needsReview) {
            // Nothing to save — behave like skip rather than blocking.
            setIndex((i) => i + 1);
            return;
        }
        const flags = currentItem.flags.filter((f) => f !== FLAG_NEEDS_REVIEW);
        if (needsReview) flags.push(FLAG_NEEDS_REVIEW);
        const input: UpdateItemInput = { flags };
        if (hasCategories) {
            const original = currentItem.categories.map((c) => c.name);
            const selectionChanged = selectedCategories.length !== original.length
                || selectedCategories.some((n) => !original.includes(n));
            const splitChanged = splitType !== (currentItem.category_split_type || "equal");
            const weightsChanged = selectedCategories.some((name) => {
                const existing = currentItem.categories.find((c) => c.name === name);
                if (!existing) return true;
                const stored = splitType === "percent"
                    ? String(existing.percentage ?? "")
                    : String(existing.amount ?? "");
                return (categoryValues[name] ?? "").trim() !== stored.trim();
            });
            if (selectionChanged || splitChanged || weightsChanged) {
                input.category_split_type = splitType;
                input.categories = selectedCategories.map((name) => ({
                    name,
                    ...(splitType === "exact" ? { amount: parseFloat(categoryValues[name] ?? "") || 0 } : {}),
                    ...(splitType === "percent" ? { percentage: parseFloat(categoryValues[name] ?? "") || 0 } : {}),
                }));
            }
        }
        resolve(input);
    };

    const handleSkip = () => setIndex((i) => i + 1);
    const handleBack = () => setIndex((i) => Math.max(0, i - 1));

    const openRuleForm = () => {
        const text = (currentItem?.original_description || currentItem?.description || "").trim();
        const categories = selectedCategories.length > 0 ? [...selectedCategories] : [];

        // Carry the split over from the categorise step. Rules have no fixed amount, so an
        // "exact" split is converted to percentages here; "equal" needs no weights.
        let category_split_type: "equal" | "percent" = "equal";
        let set_category_weights: { name: string; percentage?: number }[] | undefined;
        if (categories.length >= 2) {
            if (splitType === "percent") {
                category_split_type = "percent";
                set_category_weights = categories.map((name) => ({
                    name,
                    percentage: parseFloat(categoryValues[name] ?? "") || 0,
                }));
            } else if (splitType === "exact" && currentItem && currentItem.amount > 0) {
                category_split_type = "percent";
                set_category_weights = categories.map((name) => {
                    const amount = parseFloat(categoryValues[name] ?? "") || 0;
                    return { name, percentage: Math.round((amount / currentItem.amount) * 10000) / 100 };
                });
            }
        }

        setPrefill({
            name: text.slice(0, 100),
            match: { mode: "all", conditions: [{ field: "description", op: "contains", value: text }] },
            actions: {
                set_categories: categories,
                category_split_type,
                ...(set_category_weights ? { set_category_weights } : {}),
            },
        });
        setRuleFormOpen(true);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); handleBack(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); handleSkip(); }
    };

    const done = !isLoading && !currentItem && !hasMore;
    const isIncome = currentItem?.type === "income";

    const people = useMemo(() => {
        if (!currentItem) return [] as { member: XenBudgetMember; percentage: number }[];
        return currentItem.shares
            .map((share) => {
                const member = book.members.find((m) => m.user_id === share.user_id);
                if (!member) return null;
                const percentage = share.percentage ?? (currentItem.amount > 0
                    ? Math.round((share.amount / currentItem.amount) * 100)
                    : 0);
                return { member, percentage };
            })
            .filter((e): e is { member: XenBudgetMember; percentage: number } => e !== null);
    }, [currentItem, book.members]);

    const sourceLabel = useMemo(() => {
        if (!currentItem) return "";
        if (currentItem.source === "manual") return "Added manually";
        if (currentItem.source === "restore") return "Restored from backup";
        return currentItem.source_label ? `Imported via ${currentItem.source_label}` : "Imported";
    }, [currentItem]);

    return (
        <Dialog
            open={open} onClose={onClose} fullWidth maxWidth="xs" fullScreen={isMobile}
            slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : 2 } } }}
        >
            <DialogTitle sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <Stack direction="row" alignItems="baseline" spacing={1}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>Review items</Typography>
                    {currentItem && (
                        <Typography variant="caption" color="text.secondary">
                            {index + 1} of {queueItems.length}{hasMore ? "+" : ""}
                        </Typography>
                    )}
                </Stack>
                <IconButton size="small" onClick={onClose} sx={{ mt: -0.5, mr: -1 }}><CloseIcon fontSize="small" /></IconButton>
            </DialogTitle>
            <DialogContent onKeyDown={handleKeyDown} sx={{ px: isMobile ? 2 : 3 }}>
                {isLoading || (!currentItem && !done) ? (
                    <LoadingSpinner message="Loading items..." />
                ) : done ? (
                    <Box sx={emptyStateSx}>
                        <Box sx={emptyStateIconCircleSx}>
                            <CheckCircleIcon color="success" />
                        </Box>
                        <Typography variant="subtitle1">You&rsquo;re all caught up</Typography>
                        <Typography variant="body2" color="text.secondary">
                            Nothing left that&rsquo;s uncategorised or flagged for review.
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={2}>
                        <Box sx={{ ...xbCardSx, p: 2 }}>
                            <Stack spacing={1.5}>
                                <Stack direction="row" alignItems="flex-start" spacing={1.5}>
                                    <Box
                                        sx={{
                                            ...xbBadgeSx,
                                            bgcolor: (theme) => alpha(
                                                isIncome ? theme.palette.success.main : theme.palette.primary.main, 0.15,
                                            ),
                                            color: isIncome ? "success.main" : "primary.main",
                                        }}
                                    >
                                        {isIncome ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
                                    </Box>
                                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
                                            {currentItem!.description}
                                        </Typography>
                                        {currentItem!.original_description
                                            && currentItem!.original_description !== currentItem!.description && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                                    {currentItem!.original_description}
                                                </Typography>
                                            )}
                                    </Box>
                                </Stack>
                                {people.length > 0 && (
                                    <Stack direction="row" alignItems="center" spacing={0.75}>
                                        <AvatarGroup max={3} sx={{ "& .MuiAvatar-root": { width: 20, height: 20, fontSize: 10 } }}>
                                            {people.map((p) => (
                                                <Avatar key={p.member.user_id} src={p.member.avatar || undefined} alt={p.member.username}>
                                                    {p.member.username[0]?.toUpperCase()}
                                                </Avatar>
                                            ))}
                                        </AvatarGroup>
                                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }} noWrap>
                                            {people.map((p) => `${p.member.username} (${p.percentage}%)`).join(", ")}
                                        </Typography>
                                    </Stack>
                                )}
                                <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
                                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                                        {format(new Date(currentItem!.date), "MMM d, yyyy")}
                                    </Typography>
                                    <Typography
                                        variant="h6"
                                        sx={{ fontWeight: 700, color: isIncome ? "success.main" : "error.main", flexShrink: 0 }}
                                    >
                                        {isIncome ? "+" : "−"}{formatCurrency(currentItem!.amount, currentItem!.currency)}
                                    </Typography>
                                </Stack>
                            </Stack>
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: -1 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, minWidth: 0 }}>
                                {sourceLabel}
                            </Typography>
                            {currentItem!.flags.length > 0 && (
                                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                    {currentItem!.flags.map((f) => (
                                        <FlagChip key={f} name={f} registry={book.flags} />
                                    ))}
                                </Stack>
                            )}
                        </Stack>

                        <Box>
                            <Typography variant="caption" sx={sectionLabelSx}>What was it?</Typography>
                            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1, mt: 1 }}>
                                {[...book.categories]
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map((c) => {
                                        const selected = selectedCategories.includes(c.name);
                                        return (
                                            <CategoryChip
                                                key={c._id} name={c.name} registry={book.categories}
                                                onClick={() => toggleCategory(c.name)}
                                                sx={{
                                                    cursor: "pointer",
                                                    width: "100%",
                                                    height: 40,
                                                    borderRadius: 1,
                                                    fontSize: 14,
                                                    justifyContent: "center",
                                                    "& .MuiChip-label": { px: 1 },
                                                    fontWeight: selected ? 700 : 400,
                                                    outline: selected ? "2px solid" : "none",
                                                    outlineColor: "primary.main",
                                                    outlineOffset: 1,
                                                    ...(saving ? { opacity: 0.5, pointerEvents: "none" } : {}),
                                                }}
                                            />
                                        );
                                    })}
                            </Box>
                            {selectedCategories.length >= 2 && currentItem && (
                                <Box sx={{ mt: 1.5 }}>
                                    <WeightedSplitEditor
                                        mode={{ kind: "categories", registry: book.categories }}
                                        splitType={splitType}
                                        onSplitTypeChange={handleSplitTypeChange}
                                        selected={categoryDrafts}
                                        onSelectedChange={handleDraftsChange}
                                        amount={currentItem.amount}
                                        currency={currentItem.currency}
                                        hidePicker
                                    />
                                </Box>
                            )}
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        color="warning"
                                        checked={needsReview}
                                        onChange={(e) => setNeedsReview(e.target.checked)}
                                        disabled={saving}
                                    />
                                }
                                label="Needs review"
                                sx={{
                                    mt: 1.5,
                                    width: "100%",
                                    mx: 0,
                                    border: "1px solid",
                                    borderColor: "warning.main",
                                    borderRadius: 1,
                                    px: 1.5,
                                    pt: 0.5,
                                    pb: 0.25,
                                }}
                            />
                        </Box>
                    </Stack>
                )}
            </DialogContent>
            {done ? (
                <DialogActions>
                    <Button variant="contained" onClick={onClose} fullWidth>Close</Button>
                </DialogActions>
            ) : currentItem && (
                <DialogActions sx={{ px: 2, pb: 2 }}>
                    <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
                        <Button onClick={handleBack} disabled={index === 0}>Back</Button>
                        {selectedCategories.length > 0 && (
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={openRuleForm}
                                disabled={!currentItem}
                                aria-label="Setup Auto Tag"
                            >
                                <AutoFixHighIcon fontSize="small" />
                            </Button>
                        )}
                        <Button
                            variant="contained"
                            onClick={handleNext}
                            disabled={saving}
                            sx={{ flexGrow: 1 }}
                        >
                            {selectedCategories.length > 0 || needsReview ? "Next" : "Skip"}
                        </Button>
                    </Stack>
                </DialogActions>
            )}
            <RuleForm
                open={ruleFormOpen}
                onClose={() => setRuleFormOpen(false)}
                book={book}
                rule={prefill}
                isSubmitting={isCreatingRule || isReapplying}
                onSubmit={async (input) => {
                    await createRuleAsync(input);
                    // Apply the new rule to the rest of the queue now, so identical items
                    // that follow are tagged rather than left for another manual pass.
                    const exclude = currentItem ? [currentItem._id] : [];
                    try {
                        await reapplyAsync({ exclude_ids: exclude });
                        enqueueSnackbar("Rule saved — matching items updated", { variant: "success" });
                    } catch (e) {
                        enqueueSnackbar(
                            e instanceof Error ? e.message : "Rule saved, but re-applying failed",
                            { variant: "warning" },
                        );
                    }
                }}
            />
        </Dialog>
    );
}

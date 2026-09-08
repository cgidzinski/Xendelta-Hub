import { useMemo, useState, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Avatar, Box, Button, Card, Chip, IconButton, InputAdornment, Stack, Switch, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReplayIcon from "@mui/icons-material/Replay";
import SearchIcon from "@mui/icons-material/Search";
import { useSnackbar } from "notistack";
import type { BookDetailContext } from "../BookDetail";
import type { XenBudgetRule } from "../../../../hooks/xenbudget/types";
import { useXenBudgetRules } from "../../../../hooks/xenbudget/useRules";
import SectionCard from "./SectionCard";
import RuleForm from "../components/RuleForm";
import ReapplyRulesDialog from "../components/ReapplyRulesDialog";
import { CategoryChip, FlagChip } from "../components/LabelChip";
import { cardSx, emptyStateSx, emptyStateIconCircleSx } from "../../../../components/ui/surfaceStyles";

export default function TaggingSection() {
    const { book } = useOutletContext<BookDetailContext>();
    const { enqueueSnackbar } = useSnackbar();
    const {
        createRuleAsync, isCreatingRule, updateRuleAsync, isUpdatingRule, deleteRuleAsync,
        reapplyAsync, isReapplying,
    } = useXenBudgetRules(book._id);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<XenBudgetRule | null>(null);
    const [reapplyOpen, setReapplyOpen] = useState(false);
    const [search, setSearch] = useState("");

    // Displayed in the order they actually run, since that is what makes a chain of rules
    // predictable — a later rule sees what earlier ones changed. The index is captured here,
    // before filtering, so the badge always shows true execution position rather than
    // position within a filtered view.
    const numbered = useMemo(() => {
        const sorted = [...book.rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        return sorted.map((rule, index) => ({ rule, index }));
    }, [book.rules]);

    const query = search.trim().toLowerCase();
    const visible = query
        ? numbered.filter(({ rule }) => rule.name.toLowerCase().includes(query))
        : numbered;

    // Moving a rule swaps it with its neighbour, then renumbers the whole list sequentially
    // (0, 1, 2, ...) rather than swapping raw priority values — a raw swap is a silent no-op
    // when two rules share a priority, which sequential renumbering is immune to. Only rules
    // whose priority actually changed are saved.
    const handleMove = async (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= numbered.length) return;
        const reordered = numbered.map((n) => n.rule);
        [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
        const changed = reordered
            .map((rule, priority) => ({ rule, priority }))
            .filter(({ rule, priority }) => (rule.priority ?? 0) !== priority);
        try {
            await Promise.all(changed.map(({ rule, priority }) => updateRuleAsync({
                ruleId: rule._id,
                input: {
                    name: rule.name,
                    enabled: rule.enabled !== false,
                    priority,
                    match: rule.match,
                    actions: rule.actions,
                    stop_on_match: rule.stop_on_match,
                },
            })));
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Could not reorder rules", { variant: "error" });
        }
    };

    const handleDuplicate = async (rule: XenBudgetRule) => {
        try {
            await createRuleAsync({
                name: `${rule.name} (copy)`,
                enabled: rule.enabled !== false,
                match: rule.match,
                actions: rule.actions,
                stop_on_match: !!rule.stop_on_match,
            });
            enqueueSnackbar("Rule duplicated", { variant: "success" });
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Could not duplicate rule", { variant: "error" });
        }
    };

    // What a rule does, as chips: the categories it sets, flags it adds, people it assigns,
    // and a "never import" marker. The card shows the first few and a "+N" for the rest —
    // the full set is on the edit form.
    const resultChips = (rule: XenBudgetRule): ReactNode[] => {
        const chips: ReactNode[] = [];
        (rule.actions.set_categories || []).forEach((c) => {
            const weight = rule.actions.category_split_type === "percent"
                ? rule.actions.set_category_weights?.find((w) => w.name === c)?.percentage
                : undefined;
            chips.push(
                <CategoryChip
                    key={`c-${c}`} name={c} registry={book.categories}
                    weight={weight !== undefined && weight < 100 ? `${weight}%` : undefined}
                />,
            );
        });
        (rule.actions.add_flags || []).forEach((t) => {
            chips.push(<FlagChip key={`f-${t}`} name={t} registry={book.flags} />);
        });
        (rule.actions.set_people || []).forEach((id) => {
            const member = book.members.find((m) => m.user_id === id);
            chips.push(
                <Chip
                    key={`p-${id}`} size="small" variant="outlined"
                    label={member?.username ?? "member"}
                    avatar={member?.avatar
                        ? <Avatar src={member.avatar} sx={{ width: 16, height: 16, fontSize: 10 }} />
                        : undefined}
                    sx={{ height: 20, fontSize: 11 }}
                />,
            );
        });
        if (rule.actions.skip) {
            chips.push(
                <Chip
                    key="skip" size="small" color="error" variant="outlined"
                    label="never import" sx={{ height: 20, fontSize: 11 }}
                />,
            );
        }
        return chips;
    };

    return (
        <Stack spacing={2}>
            <SectionCard
                title="Rules"
                description="Auto-categorise, flag, mark off-budget and skip items as they arrive."
            >
                <Box>
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                        {book.rules.length > 0 && (
                            <Button size="small" startIcon={<ReplayIcon />} onClick={() => setReapplyOpen(true)}>
                                Re-apply
                            </Button>
                        )}
                        <Button
                            size="small" startIcon={<AddIcon />}
                            onClick={() => { setEditing(null); setFormOpen(true); }}
                        >
                            New rule
                        </Button>
                    </Stack>

                    {book.rules.length > 0 && (
                        <TextField
                            size="small" placeholder="Search rules" fullWidth
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            sx={{ mb: 2 }}
                            slotProps={{
                                input: {
                                    startAdornment: (
                                        <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
                                    ),
                                },
                            }}
                        />
                    )}

                    {book.rules.length === 0 ? (
                        <Box sx={emptyStateSx}>
                            <Box sx={emptyStateIconCircleSx}><AutoFixHighIcon color="disabled" /></Box>
                            <Typography variant="subtitle1">No rules yet</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Rules categorise, flag and filter items automatically as they arrive — by
                                hand or from a CSV import.
                            </Typography>

                        </Box>
                    ) : visible.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", py: 2 }}>
                            No rules match "{search.trim()}".
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            {visible.map(({ rule, index }) => {
                                // Three stacked zones — head, chips, action bar — the same
                                // at every width. Only the summary's line clamp changes with
                                // screen size.
                                const chips = resultChips(rule);
                                const shownChips = chips.slice(0, 3);
                                const extraChips = chips.length - shownChips.length;
                                return (
                                    <Card
                                        key={rule._id} variant="outlined"
                                        sx={{ ...cardSx, p: 1.5, opacity: rule.enabled === false ? 0.55 : 1 }}
                                    >
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                            <Typography
                                                variant="caption" color="text.disabled"
                                                sx={{ flexShrink: 0, minWidth: 14, textAlign: "center" }}
                                            >
                                                {index + 1}
                                            </Typography>
                                            <Box
                                                sx={{ flexGrow: 1, minWidth: 0, cursor: "pointer" }}
                                                onClick={() => { setEditing(rule); setFormOpen(true); }}
                                            >
                                                <Typography variant="body2" noWrap>{rule.name}</Typography>
                                                <Typography
                                                    variant="caption" color="text.secondary"
                                                    sx={{
                                                        display: "-webkit-box",
                                                        WebkitLineClamp: { xs: 2, sm: 1 },
                                                        WebkitBoxOrient: "vertical",
                                                        overflow: "hidden",
                                                    }}
                                                >
                                                    {summarise(rule)}
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                sx={{ flexShrink: 0 }}
                                                checked={rule.enabled !== false}
                                                onChange={(e) => updateRuleAsync({
                                                    ruleId: rule._id,
                                                    input: {
                                                        name: rule.name,
                                                        enabled: e.target.checked,
                                                        priority: rule.priority,
                                                        match: rule.match,
                                                        actions: rule.actions,
                                                        stop_on_match: rule.stop_on_match,
                                                    },
                                                })}
                                            />
                                        </Box>

                                        {chips.length > 0 && (
                                            <Stack
                                                direction="row"
                                                sx={{ flexWrap: "wrap", alignItems: "center", gap: 0.5, mt: 1 }}
                                            >
                                                {shownChips}
                                                {extraChips > 0 && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        +{extraChips}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        )}

                                        <Box sx={{
                                            display: "flex", alignItems: "center", gap: 0.5,
                                            mt: 1, pt: 1, borderTop: 1, borderColor: "divider",
                                        }}>
                                            <Tooltip title={query ? "Clear search to reorder" : "Move up"}>
                                                <span>
                                                    <IconButton
                                                        size="small"
                                                        disabled={!!query || index === 0}
                                                        onClick={() => handleMove(index, -1)}
                                                        aria-label="Move rule up"
                                                    >
                                                        <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            <Tooltip title={query ? "Clear search to reorder" : "Move down"}>
                                                <span>
                                                    <IconButton
                                                        size="small"
                                                        disabled={!!query || index === numbered.length - 1}
                                                        onClick={() => handleMove(index, 1)}
                                                        aria-label="Move rule down"
                                                    >
                                                        <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                                                    </IconButton>
                                                </span>
                                            </Tooltip>
                                            <Box sx={{ flexGrow: 1 }} />
                                            <Button
                                                size="small"
                                                startIcon={<ContentCopyIcon fontSize="small" />}
                                                onClick={() => handleDuplicate(rule)}
                                            >
                                                Duplicate
                                            </Button>
                                        </Box>
                                    </Card>
                                );
                            })}
                            <Typography variant="caption" color="text.secondary">
                                Rules run top to bottom, and each one sees what the ones above it changed.
                                Editing rules only affects new items until you re-apply.
                            </Typography>
                        </Stack>
                    )}
                </Box>
            </SectionCard>

            <RuleForm
                open={formOpen}
                onClose={() => setFormOpen(false)}
                book={book}
                rule={editing}
                isSubmitting={isCreatingRule || isUpdatingRule}
                onSubmit={async (input) => {
                    if (editing) await updateRuleAsync({ ruleId: editing._id, input });
                    else await createRuleAsync(input);
                }}
                onDelete={editing ? () => deleteRuleAsync(editing._id) : undefined}
            />

            <ReapplyRulesDialog
                open={reapplyOpen}
                onClose={() => setReapplyOpen(false)}
                reapply={reapplyAsync}
                isReapplying={isReapplying}
            />
        </Stack>
    );
}

function summarise(rule: XenBudgetRule): string {
    const joiner = rule.match.mode === "any" ? " or " : " and ";
    return rule.match.conditions
        .map((c) => `${c.field} ${c.op.replace(/_/g, " ")}${c.op === "is_empty" ? "" : ` "${c.value}"`}`)
        .join(joiner);
}

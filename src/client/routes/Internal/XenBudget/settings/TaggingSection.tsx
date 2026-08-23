import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box, Button, Card, Chip, IconButton, Stack, Switch, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ReplayIcon from "@mui/icons-material/Replay";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { useSnackbar } from "notistack";
import type { BookDetailContext } from "../BookDetail";
import type { XenBudgetRule } from "../../../../hooks/xenbudget/types";
import { useXenBudgetRules } from "../../../../hooks/xenbudget/useRules";
import { useXenBudgetReseedLabels } from "../../../../hooks/xenbudget/useLabels";
import SectionCard from "./SectionCard";
import LabelManager from "../components/LabelManager";
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
    const { reseedLabelsAsync, isReseeding } = useXenBudgetReseedLabels(book._id);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<XenBudgetRule | null>(null);
    const [reapplyOpen, setReapplyOpen] = useState(false);

    const handleReseed = async () => {
        try {
            await reseedLabelsAsync();
            enqueueSnackbar("Starter categories and built-in flags restored", { variant: "success" });
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Could not re-seed labels", { variant: "error" });
        }
    };

    // Displayed in the order they actually run, since that is what makes a chain of rules
    // predictable — a later rule sees what earlier ones changed.
    const rules = [...book.rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

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

    return (
        <Stack spacing={2}>
            <Stack direction="row" justifyContent="flex-end">
                <Button
                    size="small"
                    startIcon={<RestartAltIcon />}
                    onClick={handleReseed}
                    disabled={isReseeding}
                >
                    Re-seed categories &amp; flags
                </Button>
            </Stack>

            <SectionCard
                title="Categories"
                description="What a purchase was. Budgets and reports run on these, and one purchase can split across several."
            >
                <LabelManager book={book} kind="categories" />
            </SectionCard>

            <SectionCard
                title="Flags"
                description="Things needing attention. The built-in ones are used by imports and rules, so they can't be renamed, recoloured or removed — flags you add are yours to customise."
            >
                <LabelManager book={book} kind="flags" />
            </SectionCard>

            <SectionCard
                title="Rules"
                description="Auto-categorise, flag, exclude and skip items as they arrive."
            >
                <Box>
                    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                        {rules.length > 0 && (
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

                    {rules.length === 0 ? (
                        <Box sx={emptyStateSx}>
                            <Box sx={emptyStateIconCircleSx}><AutoFixHighIcon color="disabled" /></Box>
                            <Typography variant="subtitle1">No rules yet</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Rules categorise, flag and filter items automatically as they arrive — by
                                hand or from a CSV import.
                            </Typography>

                        </Box>
                    ) : (
                        <Stack spacing={1}>
                            {rules.map((rule, index) => (
                                <Card
                                    key={rule._id} variant="outlined"
                                    sx={{ ...cardSx, p: 1.5, opacity: rule.enabled === false ? 0.55 : 1 }}
                                >
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Typography variant="caption" color="text.disabled" sx={{ width: 18 }}>
                                            {index + 1}
                                        </Typography>
                                        <Box
                                            sx={{ flexGrow: 1, minWidth: 0, cursor: "pointer" }}
                                            onClick={() => { setEditing(rule); setFormOpen(true); }}
                                        >
                                            <Typography variant="body2" noWrap>{rule.name}</Typography>
                                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                                {summarise(rule)}
                                            </Typography>
                                        </Box>
                                        <Stack direction="row" spacing={0.5} alignItems="center">
                                            {(rule.actions.set_categories || []).map((c) => {
                                                const weight = rule.actions.category_split_type === "percent"
                                                    ? rule.actions.set_category_weights?.find((w) => w.name === c)?.percentage
                                                    : undefined;
                                                return (
                                                    <CategoryChip
                                                        key={c}
                                                        name={c}
                                                        registry={book.categories}
                                                        weight={weight !== undefined && weight < 100 ? `${weight}%` : undefined}
                                                    />
                                                );
                                            })}
                                            {(rule.actions.add_flags || []).map((t) => (
                                                <FlagChip key={t} name={t} registry={book.flags} />
                                            ))}
                                            {rule.actions.disposition === "exclude" && <Chip size="small" variant="outlined" label="exclude" sx={{ height: 20, fontSize: 11 }} />}
                                            {rule.actions.disposition === "skip" && <Chip size="small" color="error" variant="outlined" label="never import" sx={{ height: 20, fontSize: 11 }} />}
                                        </Stack>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleDuplicate(rule)}
                                            aria-label="Duplicate rule"
                                        >
                                            <ContentCopyIcon fontSize="small" />
                                        </IconButton>
                                        <Switch
                                            size="small"
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
                                    </Stack>
                                </Card>
                            ))}
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

import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
    Box, Button, Card, Chip, Stack, Switch, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ReplayIcon from "@mui/icons-material/Replay";
import type { BookDetailContext } from "../BookDetail";
import type { XenBudgetRule } from "../../../../hooks/xenbudget/types";
import { useXenBudgetRules } from "../../../../hooks/xenbudget/useRules";
import RuleForm from "../components/RuleForm";
import ReapplyRulesDialog from "../components/ReapplyRulesDialog";
import { CategoryChip, TagChip } from "../components/LabelChip";
import { cardSx, emptyStateSx, emptyStateIconCircleSx } from "../../../../components/ui/surfaceStyles";

export default function BookRules() {
    const { book } = useOutletContext<BookDetailContext>();
    const {
        createRuleAsync, isCreatingRule, updateRuleAsync, isUpdatingRule, deleteRuleAsync,
        reapplyAsync, isReapplying,
    } = useXenBudgetRules(book._id);

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<XenBudgetRule | null>(null);
    const [reapplyOpen, setReapplyOpen] = useState(false);

    // Displayed in the order they actually run, since that is what makes a chain of rules
    // predictable — a later rule sees what earlier ones changed.
    const rules = [...book.rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    return (
        <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                <Typography variant="subtitle1">Rules</Typography>
                <Stack direction="row" spacing={1}>
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
            </Stack>

            {rules.length === 0 ? (
                <Box sx={emptyStateSx}>
                    <Box sx={emptyStateIconCircleSx}><AutoFixHighIcon color="disabled" /></Box>
                    <Typography variant="subtitle1">No rules yet</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Rules tag, flag and filter items automatically as they arrive — by hand or
                        from a CSV import.
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
                                    {(rule.actions.set_categories || []).map((c) => (
                                        <CategoryChip key={c} name={c} registry={book.categories} />
                                    ))}
                                    {(rule.actions.add_tags || []).map((t) => (
                                        <TagChip key={t} name={t} registry={book.tags} />
                                    ))}
                                    {rule.actions.disposition === "exclude" && <Chip size="small" variant="outlined" label="exclude" sx={{ height: 20, fontSize: 11 }} />}
                                    {rule.actions.disposition === "skip" && <Chip size="small" color="error" variant="outlined" label="never import" sx={{ height: 20, fontSize: 11 }} />}
                                </Stack>
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
        </Box>
    );
}

function summarise(rule: XenBudgetRule): string {
    const joiner = rule.match.mode === "any" ? " or " : " and ";
    return rule.match.conditions
        .map((c) => `${c.field} ${c.op.replace(/_/g, " ")}${c.op === "is_empty" ? "" : ` "${c.value}"`}`)
        .join(joiner);
}

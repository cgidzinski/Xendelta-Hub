import { IconButton, Tooltip } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import type { RuleCoverage, XenBudgetRule } from "../../../../../hooks/xenbudget/types";
import { coverageState, coverageRules, coverageLabel } from "./ruleCoverage";

interface RuleCoverageActionProps {
    merchant: string;
    coverage?: RuleCoverage;
    /** The book's rules, for resolving ids to names. */
    rules: XenBudgetRule[];
    /** Open a new rule prefilled for this merchant. */
    onMakeRule: () => void;
    /** Open an existing rule. Returns false when the id no longer resolves. */
    onOpenRule: (ruleId: string) => boolean;
}

/**
 * The rule control on a merchant or recurring row: make one, or open the one that already
 * handles this.
 *
 * Offering "make a rule" unconditionally is what this exists to stop. A merchant an
 * existing auto tag already covers looked exactly like one nothing touches, so the obvious
 * action was to create a second rule duplicating the first.
 */
export default function RuleCoverageAction({
    merchant, coverage, rules, onMakeRule, onOpenRule,
}: RuleCoverageActionProps) {
    const state = coverageState(coverage);
    const named = coverageRules(coverage, rules);
    const label = coverageLabel(state, coverage, named, merchant);

    // Covered, but by a rule that has since been deleted — there is nothing to open, so
    // fall back to offering a new one rather than a control that does nothing.
    const covered = state === "covered" && named.length > 0;

    return (
        <Tooltip title={label}>
            <IconButton
                size="small"
                aria-label={label}
                sx={{ flexShrink: 0 }}
                onClick={(e) => {
                    // These rows are themselves clickable (they open the items list); the
                    // control must not trigger that too.
                    e.stopPropagation();
                    if (covered && onOpenRule(named[0]._id)) return;
                    onMakeRule();
                }}
            >
                {covered
                    // The same tag icon and treatment the items list uses for an
                    // auto-tagged row, so the two read as the same fact.
                    ? <LocalOfferIcon sx={{ fontSize: 15, color: "text.secondary" }} />
                    : <AutoFixHighIcon
                        sx={{ fontSize: 15, ...(state === "partial" ? { color: "warning.main" } : {}) }}
                    />}
            </IconButton>
        </Tooltip>
    );
}

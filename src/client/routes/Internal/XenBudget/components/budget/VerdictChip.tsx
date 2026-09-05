import { Chip, alpha } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import RemoveIcon from "@mui/icons-material/Remove";
import type { Theme } from "@mui/material";
import type { BudgetVerdict } from "./budgetKind";
import { INCOME_COLOR } from "../../../../../components/ui/chartColors";

/**
 * How a budget's window ended, as a word.
 *
 * The word is the point. Colour alone cannot separate a pass from a miss for anyone who
 * can't tell the two hues apart, and the card is otherwise carrying the same state as an
 * edge colour - so this is the layer that says WHICH, and the rail is the layer that says
 * where to look. An icon rides along so the chip survives being read at a glance too.
 *
 * Nothing is drawn while a window is still open: `limitState` and the pace tick are
 * already answering "how is this going", and a third opinion on the same row would only
 * compete with them.
 */

/** Resolved against the theme, since `error.main` is a token and INCOME_COLOR is a hex. */
function hueOf(verdict: BudgetVerdict, theme: Theme): string {
    if (verdict.key === "pass") return INCOME_COLOR;
    if (verdict.key === "miss") return theme.palette.error.main;
    return theme.palette.text.secondary;
}

function iconFor(key: BudgetVerdict["key"]) {
    if (key === "pass") return <CheckIcon sx={{ fontSize: 14 }} />;
    if (key === "miss") return <CloseIcon sx={{ fontSize: 14 }} />;
    return <RemoveIcon sx={{ fontSize: 14 }} />;
}

export default function VerdictChip({ verdict }: { verdict: BudgetVerdict }) {
    if (verdict.key === "open") return null;

    return (
        <Chip
            size="small"
            icon={iconFor(verdict.key)}
            label={verdict.word}
            // Matches CategoryChip's filled treatment, so the verdict sits in the heading
            // row as a peer of the chips already there rather than as a foreign badge.
            sx={{
                height: 20,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: (theme) => alpha(hueOf(verdict, theme), 0.18),
                color: (theme) => hueOf(verdict, theme),
                border: "1px solid",
                borderColor: (theme) => alpha(hueOf(verdict, theme), 0.55),
                "& .MuiChip-icon": {
                    color: (theme) => hueOf(verdict, theme),
                    marginLeft: "6px",
                },
            }}
        />
    );
}

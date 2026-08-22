import { Chip, alpha } from "@mui/material";
import type { ChipProps } from "@mui/material";
import FlagIcon from "@mui/icons-material/Flag";
import type { XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { CHART_COLORS, colorForLabel } from "../../../../components/ui/chartColors";

/**
 * Default colours for every flag in a registry that hasn't had one explicitly set —
 * walked in registry order so two default flags never land on the same colour as long as
 * eight or fewer are uncoloured, instead of each hashing independently and occasionally
 * colliding (a book rarely has more than a couple of flags, where a name-hash's random
 * spread is the opposite of distinct).
 */
function defaultFlagColors(registry: XenBudgetLabel[]): Map<string, string> {
    const used = new Set(registry.filter((l) => l.color).map((l) => l.color as string));
    const map = new Map<string, string>();
    for (const l of registry) {
        if (l.color) continue;
        const free = CHART_COLORS.find((c) => !used.has(c));
        const color = free ?? colorForLabel(l.name);
        used.add(color);
        map.set(l.name.toLowerCase(), color);
    }
    return map;
}

/**
 * Resolves a label's colour: the registry's if one was set, otherwise a default. Flags get
 * the collision-avoiding assignment above; categories (and anything not found in the
 * registry at all — named by a CSV import or a rule before anyone configured it) keep the
 * name hash, which stays stable as the list is edited around them.
 */
export function resolveLabelColor(name: string, registry: XenBudgetLabel[], kind?: "category" | "flag"): string {
    const registered = registry.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (registered?.color) return registered.color;
    if (kind === "flag") {
        const assigned = defaultFlagColors(registry).get(name.toLowerCase());
        if (assigned) return assigned;
    }
    return colorForLabel(name);
}

interface LabelChipProps extends Omit<ChipProps, "label" | "color"> {
    name: string;
    registry: XenBudgetLabel[];
    /**
     * Categories are filled, flags outlined with a pennant icon. The two must not read
     * alike at a glance — one says what a purchase was, the other says look at this.
     */
    variant2: "category" | "flag";
    /** Shown on a category that carries less than the whole item, e.g. "70%". */
    weight?: string;
}

export default function LabelChip({ name, registry, variant2, weight, sx, ...rest }: LabelChipProps) {
    const color = resolveLabelColor(name, registry, variant2);
    const isCategory = variant2 === "category";
    return (
        <Chip
            size="small"
            icon={isCategory ? undefined : <FlagIcon sx={{ fontSize: 12 }} />}
            label={weight ? `${name} ${weight}` : name}
            sx={{
                height: 20,
                fontSize: 11,
                bgcolor: isCategory ? alpha(color, 0.18) : "transparent",
                color,
                border: isCategory ? "1px solid" : "1px dashed",
                borderColor: alpha(color, isCategory ? 0.4 : 0.7),
                "& .MuiChip-icon": { color, marginLeft: "6px" },
                ...sx,
            }}
            {...rest}
        />
    );
}

/** What a purchase was. */
export function CategoryChip({ name, registry, weight, ...rest }: Omit<LabelChipProps, "variant2">) {
    return <LabelChip name={name} registry={registry} weight={weight} variant2="category" {...rest} />;
}

/** What needs attention. */
export function FlagChip({ name, registry, ...rest }: Omit<LabelChipProps, "variant2" | "weight">) {
    return <LabelChip name={name} registry={registry} variant2="flag" {...rest} />;
}

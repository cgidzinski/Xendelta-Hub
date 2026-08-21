import { Chip, alpha } from "@mui/material";
import type { ChipProps } from "@mui/material";
import type { XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { colorForLabel } from "../../../../components/ui/chartColors";

/**
 * Resolves a label's colour: the registry's if one was set, otherwise a stable colour
 * derived from the name. Hashing the name rather than using list position keeps a label
 * the same colour as others are added and removed around it, and keeps an unregistered
 * one — named by a CSV import or a rule before anyone configured it — rendering
 * consistently instead of falling back to grey.
 */
export function resolveLabelColor(name: string, registry: XenBudgetLabel[]): string {
    const registered = registry.find((l) => l.name.toLowerCase() === name.toLowerCase());
    return registered?.color || colorForLabel(name);
}

interface LabelChipProps extends Omit<ChipProps, "label" | "color"> {
    name: string;
    registry: XenBudgetLabel[];
    /**
     * Categories are filled, tags outlined. The two must not read alike at a glance —
     * one says what a purchase was, the other says look at this.
     */
    variant2: "category" | "tag";
    /** Shown on a category that carries less than the whole item, e.g. "70%". */
    weight?: string;
}

export default function LabelChip({ name, registry, variant2, weight, sx, ...rest }: LabelChipProps) {
    const color = resolveLabelColor(name, registry);
    const isCategory = variant2 === "category";
    return (
        <Chip
            size="small"
            label={weight ? `${name} ${weight}` : name}
            sx={{
                height: 20,
                fontSize: 11,
                bgcolor: isCategory ? alpha(color, 0.18) : "transparent",
                color,
                border: isCategory ? "1px solid" : "1px dashed",
                borderColor: alpha(color, isCategory ? 0.4 : 0.7),
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
export function TagChip({ name, registry, ...rest }: Omit<LabelChipProps, "variant2" | "weight">) {
    return <LabelChip name={name} registry={registry} variant2="tag" {...rest} />;
}

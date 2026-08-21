import { Chip, alpha } from "@mui/material";
import type { ChipProps } from "@mui/material";
import type { XenBudgetTag } from "../../../../hooks/xenbudget/types";
import { colorForLabel } from "../../../../components/ui/chartColors";

/**
 * Resolves a tag's colour: the registry's if one was set, otherwise a stable colour
 * derived from the name. Hashing the name rather than using list position keeps a tag
 * the same colour as other tags are added and removed around it, and keeps an
 * unregistered tag (one a CSV import named but nobody has configured) rendering
 * consistently instead of falling back to grey.
 */
export function resolveTagColor(tag: string, registry: XenBudgetTag[]): string {
    const registered = registry.find((t) => t.name.toLowerCase() === tag.toLowerCase());
    return registered?.color || colorForLabel(tag);
}

interface TagChipProps extends Omit<ChipProps, "label" | "color"> {
    tag: string;
    registry: XenBudgetTag[];
}

export default function TagChip({ tag, registry, sx, ...rest }: TagChipProps) {
    const color = resolveTagColor(tag, registry);
    return (
        <Chip
            size="small"
            label={tag}
            sx={{
                height: 20,
                fontSize: 11,
                bgcolor: alpha(color, 0.18),
                color,
                border: "1px solid",
                borderColor: alpha(color, 0.4),
                ...sx,
            }}
            {...rest}
        />
    );
}

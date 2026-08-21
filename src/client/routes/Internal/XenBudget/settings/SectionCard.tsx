import { Card, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { cardSx, sectionLabelSx } from "../../../../components/ui/surfaceStyles";

interface SectionCardProps {
    title: string;
    /** One line on what this section is for. Worth keeping — a deep link lands here cold. */
    description?: string;
    children: ReactNode;
    danger?: boolean;
}

/** The shell every settings section shares, so they stay visually identical. */
export default function SectionCard({ title, description, children, danger }: SectionCardProps) {
    return (
        <Card
            variant="outlined"
            sx={{ ...cardSx, p: 1.75, ...(danger ? { borderColor: "error.dark" } : {}) }}
        >
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: description ? 0.5 : 1.5 }}>
                {title}
            </Typography>
            {description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {description}
                </Typography>
            )}
            <Stack spacing={2}>{children}</Stack>
        </Card>
    );
}

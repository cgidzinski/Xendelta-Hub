import { useOutletContext } from "react-router-dom";
import { Box, Stack, Typography } from "@mui/material";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import LabelManager from "../components/LabelManager";
import { FlagChip } from "../components/LabelChip";

/**
 * The built-in flags and what each means. Mirrors SYSTEM_FLAGS in
 * src/server/constants/xenbudget.ts — flags travel by name, so these strings must match.
 * Custom flags are yours to name, so there is nothing here to explain about them.
 */
const BUILT_IN_FLAG_MEANINGS = [
    { name: "Needs review", meaning: "A human should look at this one." },
    { name: "Uncategorised", meaning: "Imported, but nothing managed to categorise it." },
    { name: "Possible duplicate", meaning: "Looks like a row you already have — imported anyway." },
    { name: "Ignored", meaning: "Deliberately set aside; review mode skips these." },
    { name: "Off budget", meaning: "Kept on the book, but never counted in any total." },
] as const;

export default function FlagsSection() {
    const { book } = useOutletContext<BookDetailContext>();

    return (
        <Stack spacing={2}>
            <SectionCard
                title="Flags"
                description="Things needing attention. The built-in ones are used by imports and rules, so they can't be renamed, recoloured or removed — flags you add are yours to customise."
            >
                <LabelManager book={book} kind="flags" />
            </SectionCard>

            <SectionCard
                title="What each built-in flag means"
                description="The ones the importer and rules engine rely on, and what they signal. Flags you add yourself mean whatever their name says."
            >
                <Stack spacing={1}>
                    {BUILT_IN_FLAG_MEANINGS.map(({ name, meaning }) => (
                        <Stack key={name} direction="row" alignItems="center" spacing={1}>
                            <Box sx={{ flexShrink: 0 }}>
                                <FlagChip name={name} registry={book.flags} />
                            </Box>
                            <Typography variant="body2" color="text.secondary">{meaning}</Typography>
                        </Stack>
                    ))}
                </Stack>
            </SectionCard>
        </Stack>
    );
}

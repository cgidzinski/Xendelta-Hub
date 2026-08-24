import { Stack } from "@mui/material";
import { useOutletContext } from "react-router-dom";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import ImportHistory from "../components/ImportHistory";
import SavedMappings from "../components/SavedMappings";

export default function ImportsSection() {
    const { book } = useOutletContext<BookDetailContext>();
    return (
        <Stack spacing={2}>
            <SectionCard
                title="Imports"
                description="Every CSV you've brought in. Delete one to remove everything it added."
            >
                <ImportHistory bookId={book._id} />
            </SectionCard>
            <SectionCard
                title="Saved mappings"
                description="Reusable column mappings for your cards. Rename or delete one here."
            >
                <SavedMappings />
            </SectionCard>
        </Stack>
    );
}

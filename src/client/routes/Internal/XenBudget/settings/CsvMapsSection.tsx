import { Stack } from "@mui/material";
import SectionCard from "./SectionCard";
import SavedMappings from "../components/SavedMappings";

/**
 * Saved column mappings, pulled out of the Imports section into their own tab so the
 * import history list stays focused on what has already been brought in.
 */
export default function CsvMapsSection() {
    return (
        <Stack spacing={2}>
            <SectionCard
                title="Saved mappings"
                description="Reusable column mappings for your cards. Rename or delete one here."
            >
                <SavedMappings />
            </SectionCard>
        </Stack>
    );
}

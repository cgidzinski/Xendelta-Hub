import { useOutletContext } from "react-router-dom";
import { Stack } from "@mui/material";
import type { BookDetailContext } from "../BookDetail";
import { useXenBudgetCategoryItemCounts } from "../../../../hooks/xenbudget/useLabels";
import SectionCard from "./SectionCard";
import LabelManager from "../components/LabelManager";

export default function CategoriesSection() {
    const { book } = useOutletContext<BookDetailContext>();
    const { counts } = useXenBudgetCategoryItemCounts(book._id);

    return (
        <Stack spacing={2}>
            <SectionCard
                title="Categories"
                description="What a purchase was. Budgets and reports run on these, and one purchase can split across several."
            >
                <LabelManager book={book} kind="categories" itemCounts={counts} />
            </SectionCard>
        </Stack>
    );
}

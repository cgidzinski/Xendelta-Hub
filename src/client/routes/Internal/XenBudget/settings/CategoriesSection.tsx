import { useOutletContext } from "react-router-dom";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import LabelManager from "../components/LabelManager";

export default function CategoriesSection() {
    const { book } = useOutletContext<BookDetailContext>();
    return (
        <SectionCard
            title="Categories"
            description="What a purchase was. Budgets and reports run on these, and one purchase can split across several."
        >
            <LabelManager book={book} kind="categories" />
        </SectionCard>
    );
}

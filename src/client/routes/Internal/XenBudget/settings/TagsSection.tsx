import { useOutletContext } from "react-router-dom";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import LabelManager from "../components/LabelManager";

export default function TagsSection() {
    const { book } = useOutletContext<BookDetailContext>();
    return (
        <SectionCard
            title="Tags"
            description="Things needing attention. The built-in ones are used by imports and rules, so they can't be renamed or removed — but their colours are yours."
        >
            <LabelManager book={book} kind="tags" />
        </SectionCard>
    );
}

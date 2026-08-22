import { useOutletContext } from "react-router-dom";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import ImportHistory from "../components/ImportHistory";

export default function ImportsSection() {
    const { book } = useOutletContext<BookDetailContext>();
    return (
        <SectionCard
            title="Imports"
            description="Every CSV you've brought in. Delete one to remove everything it added."
        >
            <ImportHistory bookId={book._id} />
        </SectionCard>
    );
}

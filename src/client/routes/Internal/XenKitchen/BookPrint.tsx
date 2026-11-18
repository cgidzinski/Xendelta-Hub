import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { EMPTY_FILTERS } from "@shared/xenkitchen/kitchen";
import ErrorDisplay from "../../../components/ErrorDisplay";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useKitchenBooks, useKitchenCategories, useKitchenItems } from "../../../hooks/xenkitchen/useKitchen";
import { useTitle } from "../../../hooks/useTitle";
import CookbookPrint from "./components/CookbookPrint";
import { buildCookbook, cookbookOptionsFromParams } from "./components/cookbook";

/** One of your own books laid out as a cookbook, ready to print or save as a PDF (/internal/xenkitchen/books/:bookId/print). */
export default function BookPrint() {
  const { bookId = "" } = useParams<{ bookId: string }>();
  const [params] = useSearchParams();
  const options = useMemo(() => cookbookOptionsFromParams(params), [params]);
  const { books, isLoading: booksLoading } = useKitchenBooks();
  const { categories, isLoading: catsLoading } = useKitchenCategories(bookId);
  const { items, isLoading: itemsLoading, isError, error, refetch } = useKitchenItems(EMPTY_FILTERS, bookId);
  const book = books.find((b) => b._id === bookId);
  useTitle(book ? `${book.name} cookbook` : "Cookbook");

  const sections = useMemo(() => buildCookbook(items, categories, options), [items, categories, options]);
  const owner = book?.members.find((m) => m.role === "owner")?.username ?? null;
  const backTo = `/internal/xenkitchen?book=${bookId}`;

  if (booksLoading || catsLoading || itemsLoading) return <LoadingSpinner message="Building your cookbook…" />;
  if (isError || !book) {
    return <ErrorDisplay error={error ?? null} title="Couldn't load this book" onRetry={() => refetch()} />;
  }
  return (
    <CookbookPrint
      book={book}
      owner={book.members.length > 1 ? owner : null}
      sections={sections}
      photos={options.photos}
      backTo={backTo}
    />
  );
}

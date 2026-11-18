import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import ErrorDisplay from "../../../components/ErrorDisplay";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { usePublicKitchenBook } from "../../../hooks/xenkitchen/useKitchen";
import { useTitle } from "../../../hooks/useTitle";
import CookbookPrint from "../../Internal/XenKitchen/components/CookbookPrint";
import { buildCookbook, cookbookOptionsFromParams } from "../../Internal/XenKitchen/components/cookbook";

/** A shared book as a cookbook to print or save as a PDF (/k/b/:token/print). Works signed out. */
export default function XenKitchenPublicBookPrint() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const options = useMemo(() => cookbookOptionsFromParams(params), [params]);
  const { data, isLoading, isError, error, refetch } = usePublicKitchenBook(token);
  useTitle(data ? `${data.book.name} cookbook` : "Cookbook");
  const sections = useMemo(() => (data ? buildCookbook(data.items, data.categories, options) : []), [data, options]);

  if (isLoading) return <LoadingSpinner message="Building the cookbook…" />;
  if (isError || !data) {
    return <ErrorDisplay error={error} title="This link isn't available" onRetry={() => refetch()} />;
  }
  return <CookbookPrint book={data.book} sections={sections} photos={options.photos} backTo={`/k/b/${token}`} />;
}

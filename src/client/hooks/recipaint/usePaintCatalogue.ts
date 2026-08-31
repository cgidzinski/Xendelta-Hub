import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { PaintType } from "../../../shared/recipaint/paints";

/** An entry in the shared catalogue. Read-only: it comes from a committed JSON, not the DB. */
export interface CataloguePaint {
  key: string;
  brand: string;
  name: string;
  range: string;
  hex: string;
  type: PaintType | "";
}

/** A brand and the ranges it publishes, for the filter's second dropdown. */
export interface CatalogueBrand {
  name: string;
  ranges: string[];
}

export const paintCatalogueKeys = {
  all: ["paint-catalogue"] as const,
  search: (q: string, brand: string, range: string) =>
    [...paintCatalogueKeys.all, "search", { q, brand, range }] as const,
  brands: () => [...paintCatalogueKeys.all, "brands"] as const,
};

const searchCatalogue = async (q: string, brand: string, range: string): Promise<CataloguePaint[]> => {
  const response = await apiClient.get<ApiResponse<{ paints: CataloguePaint[] }>>("/api/paint-catalogue", {
    params: {
      ...(q ? { q } : {}),
      ...(brand ? { brand } : {}),
      ...(range ? { range } : {}),
      // Browsing a whole range with no query needs more than a default page.
      limit: 50,
    },
  });
  return response.data.data!.paints;
};

/**
 * Search the shared catalogue as the user types.
 *
 * Debounced for the same reason as the recipe search: without it this fires a request per
 * keystroke. Search runs on the server, so the 2,164-entry catalogue never reaches the bundle.
 */
export function usePaintCatalogueSearch(query: string, brand = "", range = "", enabled = true) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: paintCatalogueKeys.search(debounced, brand, range),
    queryFn: () => searchCatalogue(debounced, brand, range),
    enabled,
    // The catalogue is a static file; a given query always returns the same rows.
    staleTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
    retry: false,
  });

  return { paints: data || [], isSearching: isFetching };
}

export function usePaintCatalogueBrands(enabled = true) {
  const { data } = useQuery({
    queryKey: paintCatalogueKeys.brands(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<{ brands: CatalogueBrand[] }>>("/api/paint-catalogue/brands");
      return response.data.data!.brands;
    },
    enabled,
    // Generated from a committed file - it only changes when the app is redeployed.
    staleTime: Infinity,
    retry: false,
  });

  return { brands: data || [] };
}

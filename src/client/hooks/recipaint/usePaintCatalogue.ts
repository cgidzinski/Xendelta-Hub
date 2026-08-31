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

export const paintCatalogueKeys = {
  all: ["paint-catalogue"] as const,
  search: (q: string, brand: string) => [...paintCatalogueKeys.all, "search", { q, brand }] as const,
  brands: () => [...paintCatalogueKeys.all, "brands"] as const,
};

const searchCatalogue = async (q: string, brand: string): Promise<CataloguePaint[]> => {
  const response = await apiClient.get<ApiResponse<{ paints: CataloguePaint[] }>>("/api/paint-catalogue", {
    params: { ...(q ? { q } : {}), ...(brand ? { brand } : {}) },
  });
  return response.data.data!.paints;
};

/**
 * Search the shared catalogue as the user types.
 *
 * Debounced for the same reason as the recipe search: without it this fires a request per
 * keystroke. Search runs on the server, so the 2,164-entry catalogue never reaches the bundle.
 */
export function usePaintCatalogueSearch(query: string, brand = "", enabled = true) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: paintCatalogueKeys.search(debounced, brand),
    queryFn: () => searchCatalogue(debounced, brand),
    enabled,
    // The catalogue is a static file; a given query always returns the same rows.
    staleTime: 30 * 60 * 1000,
    placeholderData: (previous) => previous,
    retry: false,
  });

  return { paints: data || [], isSearching: isFetching };
}

export function usePaintCatalogueBrands() {
  const { data } = useQuery({
    queryKey: paintCatalogueKeys.brands(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<{ brands: string[] }>>("/api/paint-catalogue/brands");
      return response.data.data!.brands;
    },
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  return { brands: data || [] };
}

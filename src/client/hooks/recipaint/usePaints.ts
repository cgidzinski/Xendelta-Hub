import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, api } from "../../config/api";
import { PaintType } from "@shared/recipaint/paints";

/** A paint the user owns. The recipe-step shape (RecipePaint) is a snapshot of these fields. */
export interface CollectionPaint {
  _id: string;
  brand: string;
  name: string;
  /** The commercial range, e.g. "Warpaints Air". Empty for a custom colour. */
  range: string;
  hex: string;
  type: PaintType | "";
  quantity: number;
  /** Set when the paint came from the shared catalogue. */
  catalogueKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaintDraft {
  brand: string;
  name: string;
  range: string;
  hex: string;
  type: PaintType | "";
  quantity: number;
  catalogueKey: string;
}

export const paintKeys = {
  all: ["paints"] as const,
  list: () => [...paintKeys.all, "list"] as const,
};

const fetchPaints = async (): Promise<CollectionPaint[]> => {
  return (await api.get<{ paints: CollectionPaint[] }>("/api/paints")).paints;
};

const createPaint = async (draft: PaintDraft): Promise<CollectionPaint> => {
  return (await api.post<{ paint: CollectionPaint }>("/api/paints", draft)).paint;
};

const updatePaint = async ({ id, data }: { id: string; data: Partial<PaintDraft> }): Promise<CollectionPaint> => {
  return (await api.put<{ paint: CollectionPaint }>(`/api/paints/${id}`, data)).paint;
};

const deletePaint = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/paints/${id}`);
};

export const usePaints = () => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: paintKeys.list(),
    queryFn: fetchPaints,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, err) => (err.message.includes("Unauthorized") ? false : failureCount < 3),
  });

  return {
    paints: data || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};

export const usePaintMutations = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: paintKeys.all });

  const create = useMutation({ mutationFn: createPaint, onSuccess: invalidate });
  const update = useMutation({ mutationFn: updatePaint, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deletePaint, onSuccess: invalidate });

  return {
    createPaint: create.mutateAsync,
    isCreating: create.isPending,
    updatePaint: update.mutateAsync,
    isUpdating: update.isPending,
    deletePaint: remove.mutateAsync,
    isDeleting: remove.isPending,
  };
};

export const xenstartKeys = {
  all: ["xenstart"] as const,
  config: (userId: string) => [...xenstartKeys.all, userId] as const,
  background: (userId: string, imageId?: string | null) =>
    [...xenstartKeys.all, "background", userId, imageId] as const,
};

export const xenstartKeys = {
  all: ["xenstart"] as const,
  config: (userId: string) => [...xenstartKeys.all, userId] as const,
};

export const storageKeys = {
  all: ["storage"] as const,
  /** Everything apps stored for the person (the storage viewer). */
  appFiles: () => [...storageKeys.all, "app-files"] as const,
  file: (fileId: string | undefined) => [...storageKeys.all, "file", fileId] as const,
};

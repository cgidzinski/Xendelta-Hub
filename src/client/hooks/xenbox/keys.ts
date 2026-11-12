export const xenboxKeys = {
  files: (search?: string) => (search === undefined ? (["xenboxFiles"] as const) : (["xenboxFiles", search] as const)),
};

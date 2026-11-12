export const xendriveKeys = {
  files: (search?: string) => (search === undefined ? (["xendriveFiles"] as const) : (["xendriveFiles", search] as const)),
};

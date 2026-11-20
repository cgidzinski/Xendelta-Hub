import { apiClient } from "../../config/api";

export async function downloadMarkdown(kind: "pages" | "notebooks", id: string, title: string) {
  const { data } = await apiClient.get<Blob>(`/api/xennote/${kind}/${id}/export`, { responseType: "blob", timeout: 0 });
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  const name = title.trim().replace(/[<>:"/\\|?*]+/g, "-") || "Untitled";
  link.download = `${name}.${kind === "pages" ? "md" : "zip"}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

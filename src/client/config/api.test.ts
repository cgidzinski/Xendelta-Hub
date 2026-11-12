import { describe, it, expect, vi, afterEach } from "vitest";
import { api, apiClient } from "./api";

afterEach(() => vi.restoreAllMocks());

const envelope = <T>(data: T) => ({ data: { status: true, message: "ok", data } });

describe("api helper", () => {
  it("unwraps the standard envelope for every method", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue(envelope([1, 2]));
    vi.spyOn(apiClient, "post").mockResolvedValue(envelope({ id: "a" }));
    vi.spyOn(apiClient, "put").mockResolvedValue(envelope("put"));
    vi.spyOn(apiClient, "patch").mockResolvedValue(envelope("patch"));
    vi.spyOn(apiClient, "delete").mockResolvedValue(envelope(null));

    expect(await api.get<number[]>("/x")).toEqual([1, 2]);
    expect(await api.post<{ id: string }>("/x", { a: 1 })).toEqual({ id: "a" });
    expect(await api.put<string>("/x", {})).toBe("put");
    expect(await api.patch<string>("/x", {})).toBe("patch");
    expect(await api.delete("/x")).toBeNull();
  });

  it("passes the url, body and config straight through", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue(envelope(1));
    await api.post("/upload", { f: 1 }, { timeout: 5 });
    expect(post).toHaveBeenCalledWith("/upload", { f: 1 }, { timeout: 5 });
  });

  it("lets a failed request's error reach the caller", async () => {
    vi.spyOn(apiClient, "get").mockRejectedValue(new Error("Network error"));
    await expect(api.get("/x")).rejects.toThrow("Network error");
  });
});

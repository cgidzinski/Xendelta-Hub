import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("../../config/api", () => ({
  api: { post: (...args: unknown[]) => post(...args), get: vi.fn() },
  apiClient: {},
}));

const { peekPage } = await import("./usePages");

beforeEach(() => post.mockReset());

describe("peekPage", () => {
  it("sends the links asked about within a moment of each other as one request", async () => {
    post.mockResolvedValue({
      pages: [
        { id: "a", locked: false, title: "A" },
        { id: "b", locked: true },
      ],
    });
    const [a, b] = await Promise.all([peekPage("a"), peekPage("b")]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/api/xennote/pages/peek", { ids: ["a", "b"] });
    expect(a).toMatchObject({ title: "A" });
    expect(b).toEqual({ id: "b", locked: true });
  });

  it("answers everyone who asked about the same page, with one id in the request", async () => {
    post.mockResolvedValue({ pages: [{ id: "a", locked: false, title: "A" }] });
    const [one, two] = await Promise.all([peekPage("a"), peekPage("a")]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toEqual({ ids: ["a"] });
    expect(one).toBe(two);
  });

  it("starts a new request for links asked about later", async () => {
    post.mockResolvedValue({ pages: [{ id: "a", locked: true }] });
    await peekPage("a");
    post.mockResolvedValue({ pages: [{ id: "c", locked: true }] });
    await peekPage("c");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("fails every link in the batch when the request fails, and recovers afterwards", async () => {
    post.mockRejectedValueOnce(new Error("offline"));
    const results = await Promise.allSettled([peekPage("a"), peekPage("b")]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
    post.mockResolvedValue({ pages: [{ id: "a", locked: true }] });
    await expect(peekPage("a")).resolves.toEqual({ id: "a", locked: true });
  });
});

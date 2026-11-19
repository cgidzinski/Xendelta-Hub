import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicDownloadError, startPublicDownload } from "./publicDownload";

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("startPublicDownload", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the password in the body and downloads from an address with only the ticket", async () => {
    const fetchMock = vi.fn(async () => respond(200, { status: true, data: { ticket: "abc.def" } }));
    const assign = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { assign } });

    await startPublicDownload("/api/t/ticket", "/api/t", "hunter2");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/t/ticket");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ password: "hunter2" });
    expect(assign).toHaveBeenCalledWith("/api/t?ticket=abc.def");
    expect(assign.mock.calls[0][0]).not.toContain("hunter2");
  });

  it("sends no password when there isn't one", async () => {
    const fetchMock = vi.fn(async () => respond(200, { status: true, data: { ticket: "t" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { assign: vi.fn() } });
    await startPublicDownload("/x/ticket", "/x");
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({});
  });

  it("explains why it can't, with the status, and doesn't navigate", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(401, { status: false, message: "Incorrect password" })),
    );
    const failure = await startPublicDownload("/x/ticket", "/x", "nope").catch((e) => e);
    expect(failure).toBeInstanceOf(PublicDownloadError);
    expect(failure).toMatchObject({ message: "Incorrect password", status: 401 });
    expect(assign).not.toHaveBeenCalled();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    await expect(startPublicDownload("/x/ticket", "/x")).rejects.toMatchObject({ status: 0 });
  });
});

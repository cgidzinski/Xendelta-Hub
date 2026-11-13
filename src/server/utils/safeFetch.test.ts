import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import zlib from "zlib";
import type { AddressInfo } from "net";
import { checkUrl, fetchPublic, isPublicAddress } from "./safeFetch";

describe("isPublicAddress", () => {
  it("accepts addresses on the public internet", () => {
    for (const ip of [
      "8.8.8.8",
      "93.184.216.34",
      "1.1.1.1",
      "172.15.0.1",
      "172.32.0.1",
      "11.0.0.1",
      "2606:4700:4700::1111",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("refuses loopback, private, link-local, metadata and other reserved IPv4 ranges", () => {
    const blocked = [
      "127.0.0.1",
      "127.255.255.254",
      "0.0.0.0",
      "0.1.2.3",
      "10.0.0.1",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "192.168.255.255",
      "169.254.169.254",
      "169.254.0.1",
      "100.64.0.1",
      "100.127.255.255",
      "192.0.0.1",
      "192.0.2.1",
      "198.18.0.1",
      "198.19.255.255",
      "198.51.100.5",
      "203.0.113.9",
      "224.0.0.1",
      "239.255.255.255",
      "240.0.0.1",
      "255.255.255.255",
    ];
    for (const ip of blocked) expect(isPublicAddress(ip), ip).toBe(false);
  });

  it("refuses loopback, private, link-local and reserved IPv6, and IPv6 wrapping a private IPv4", () => {
    const blocked = [
      "::",
      "::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "fe80::abcd%eth0",
      "febf::1",
      "fec0::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
      "64:ff9b::7f00:1",
      "64:ff9b::10.0.0.1",
      "2002:7f00:1::1",
      "2002:a9fe:a9fe::1",
      "::127.0.0.1",
      "100::1",
    ];
    for (const ip of blocked) expect(isPublicAddress(ip), ip).toBe(false);
    // ...but wrapping a public one is fine
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicAddress("64:ff9b::808:808")).toBe(true);
  });

  it("treats anything that isn't an address as not public", () => {
    for (const ip of [
      "",
      "localhost",
      "example.com",
      "256.1.1.1",
      "1.2.3",
      "1.2.3.4.5",
      "::g",
      "1::2::3",
      "12345::1",
    ]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
  });
});

describe("checkUrl", () => {
  const refused = (url: string, opts = {}) => {
    try {
      checkUrl(url, opts);
    } catch (e: any) {
      expect(e.status, url).toBe(400);
      return e.message as string;
    }
    throw new Error(`${url} was allowed`);
  };

  it("allows ordinary web addresses", () => {
    expect(checkUrl("https://www.example.com/recipes/pancakes?x=1#top").hostname).toBe("www.example.com");
    expect(checkUrl("  http://example.com  ").hostname).toBe("example.com");
    expect(checkUrl("https://example.com:443/x").port).toBe("");
  });

  it("refuses anything that isn't http(s) or isn't an address", () => {
    for (const url of [
      "ftp://example.com/x",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,hi",
      "gopher://example.com",
      "not a url",
      "",
      "//example.com",
    ]) {
      refused(url);
    }
  });

  it("refuses ports other than 80 and 443, and credentials in the address", () => {
    for (const url of [
      "http://example.com:22/",
      "https://example.com:6379/",
      "http://example.com:3000/",
      "http://example.com:8080/",
      "https://user:pw@example.com/",
      "https://user@example.com/",
    ]) {
      refused(url);
    }
  });

  it("refuses private and loopback addresses written as IPs, including the odd spellings", () => {
    const hostile = [
      "http://127.0.0.1/",
      "http://127.1/",
      "http://0.0.0.0/",
      "http://10.0.0.5/admin",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[fe80::1]/",
      "http://[fd00::1]/",
      "http://2130706433/" /* 127.0.0.1 as one number */,
      "http://0x7f.0.0.1/",
      "http://0177.0.0.1/",
      "http://017700000001/",
      "https://[::ffff:a9fe:a9fe]/",
      "http://100.64.0.1/",
    ];
    for (const url of hostile) refused(url);
  });

  it("still allows a public IP written as numbers", () => {
    expect(checkUrl("http://93.184.216.34/recipe").hostname).toBe("93.184.216.34");
    expect(checkUrl("https://[2606:4700:4700::1111]/").hostname).toBe("[2606:4700:4700::1111]");
  });

  it("names are checked later, at connection time", () => {
    // localhost is a name: it passes here and is stopped when it resolves to 127.0.0.1 (tested below)
    expect(checkUrl("http://localhost/").hostname).toBe("localhost");
  });
});

// ---- against a real server on this machine ----

let server: http.Server;
let base: string;
let port: number;
const sockets = new Set<import("net").Socket>();

const html = "<html><body><h1>Pancakes</h1></body></html>";
const routes: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void> = {
  "/ok": (_req, res) => res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html),
  "/gzip": (_req, res) =>
    res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" }).end(zlib.gzipSync(html)),
  "/br": (_req, res) =>
    res.writeHead(200, { "content-type": "text/html", "content-encoding": "br" }).end(zlib.brotliCompressSync(html)),
  "/redirect": (_req, res) => res.writeHead(302, { location: "/ok" }).end(),
  "/loop": (_req, res) => res.writeHead(302, { location: "/loop" }).end(),
  "/to-metadata": (_req, res) => res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end(),
  "/to-localhost-other-port": (_req, res) => res.writeHead(302, { location: "http://127.0.0.1:6379/" }).end(),
  "/to-file": (_req, res) => res.writeHead(302, { location: "file:///etc/passwd" }).end(),
  "/missing": (_req, res) => res.writeHead(404, { "content-type": "text/html" }).end("no"),
  "/json": (_req, res) => res.writeHead(200, { "content-type": "application/json" }).end("{}"),
  "/big-declared": (_req, res) =>
    res.writeHead(200, { "content-type": "text/html", "content-length": String(50 * 1024 * 1024) }).end("x"),
  "/big-streamed": (_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    const send = () => {
      if (res.destroyed) return;
      res.write("x".repeat(64 * 1024), send);
    };
    send();
  },
  "/bomb": (_req, res) =>
    res
      .writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" })
      .end(zlib.gzipSync(Buffer.alloc(20 * 1024 * 1024, "a"))),
  "/slow": () => undefined, // never answers
  "/svg": (_req, res) => res.writeHead(200, { "content-type": "image/svg+xml" }).end("<svg/>"),
  "/png": (_req, res) => res.writeHead(200, { "content-type": "image/png" }).end(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
};

beforeAll(async () => {
  server = http.createServer((req, res) => (routes[req.url ?? ""] ?? routes["/missing"])(req, res));
  server.on("connection", (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.destroy());
  await new Promise((resolve) => server.close(resolve));
});

const local = {
  allowHosts: ["127.0.0.1"],
  get allowPorts() {
    return [port];
  },
};
const html_ = (path: string, extra = {}) =>
  fetchPublic(base + path, { kind: "html", maxBytes: 1024 * 1024, ...local, ...extra });
const failure = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    expect(e.status).toBe(400);
    return e.message as string;
  }
  throw new Error("it was allowed");
};

describe("fetchPublic", () => {
  it("fetches a page, and reports where it ended up", async () => {
    const page = await html_("/ok");
    expect(page.body.toString()).toBe(html);
    expect(page.url).toBe(`${base}/ok`);
    expect(page.contentType).toContain("text/html");
  });

  it("decodes gzip and brotli", async () => {
    expect((await html_("/gzip")).body.toString()).toBe(html);
    expect((await html_("/br")).body.toString()).toBe(html);
  });

  it("follows a redirect, using the final address", async () => {
    const page = await html_("/redirect");
    expect(page.body.toString()).toBe(html);
    expect(page.url).toBe(`${base}/ok`);
  });

  it("stops a redirect loop", async () => {
    expect(await failure(html_("/loop"))).toMatch(/redirects too many times/);
  });

  it("checks every redirect: to the metadata address, another port, or a file: all refused", async () => {
    expect(await failure(html_("/to-metadata"))).toBe("That address isn't allowed");
    expect(await failure(html_("/to-localhost-other-port"))).toBe("That address isn't allowed");
    expect(await failure(html_("/to-file"))).toMatch(/Only web addresses/);
  });

  it("refuses this machine itself unless a test allows it, whether written as an IP or a name", async () => {
    // 127.0.0.1 as an IP: refused before connecting
    expect(await failure(fetchPublic(base + "/ok", { kind: "html", maxBytes: 1000, allowPorts: [port] }))).toBe(
      "That address isn't allowed",
    );
    // 'localhost' as a name: it resolves to a loopback address and the connection-time check refuses it
    expect(
      await failure(fetchPublic(`http://localhost:${port}/ok`, { kind: "html", maxBytes: 1000, allowPorts: [port] })),
    ).toBe("That address isn't allowed");
  });

  it("refuses an error status and a page that isn't HTML", async () => {
    expect(await failure(html_("/missing"))).toMatch(/error \(404\)/);
    expect(await failure(html_("/json"))).toBe("That address isn't a web page");
  });

  it("refuses a page that is too large, declared or not", async () => {
    expect(await failure(html_("/big-declared"))).toBe("That page is too large");
    expect(await failure(html_("/big-streamed", { maxBytes: 200 * 1024 }))).toBe("That page is too large");
  });

  it("refuses a small download that expands to something huge (a compression bomb)", async () => {
    expect(await failure(html_("/bomb", { maxBytes: 1024 * 1024 }))).toBe("That page is too large");
  });

  it("gives up on a server that never answers", async () => {
    expect(await failure(html_("/slow", { timeoutMs: 300 }))).toBe("That page took too long to answer");
  });

  it("for images: accepts a picture, refuses SVG and HTML", async () => {
    const image = (path: string) => fetchPublic(base + path, { kind: "image", maxBytes: 1024, ...local });
    expect((await image("/png")).body).toHaveLength(4);
    expect(await failure(image("/svg"))).toBe("That address isn't a picture");
    expect(await failure(image("/ok"))).toBe("That address isn't a picture");
  });

  it("says only that something couldn't be reached, not why", async () => {
    // Nothing is listening on this port.
    expect(
      await failure(
        fetchPublic(`${base.replace(String(port), String(port + 1))}/x`, {
          kind: "html",
          maxBytes: 1000,
          allowHosts: ["127.0.0.1"],
          allowPorts: [port + 1],
        }),
      ),
    ).toBe("Couldn't reach that address");
  });
});

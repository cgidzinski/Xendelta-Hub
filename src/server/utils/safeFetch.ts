import dns from "dns";
import http from "http";
import https from "https";
import net from "net";
import zlib from "zlib";
import { Readable } from "stream";
import { AppError } from "./http";

// Fetching a web address a person typed in (a recipe page, its photo), safely. The server is the one making the request, so
// a hostile address must never be able to reach the server's own network: localhost, the database, a cloud metadata
// service, a router. Everything below exists to close that door:
//   * only http(s), and only the standard ports;
//   * the address a name resolves to is checked when the connection is made (not before it, so a name that answers with
//     a public address once and a private one the next time, "DNS rebinding", gets nothing);
//   * an address written as an IP is checked too, since a name lookup never happens for one;
//   * every redirect is checked again, and there are only a few;
//   * a time limit, a size limit (counted after decompression, so a "zip bomb" can't fill memory) and a content type.

export type FetchKind = "html" | "image";

export interface FetchOptions {
  kind: FetchKind;
  /** Most bytes accepted (after decompression). */
  maxBytes: number;
  /** Time allowed for the whole fetch, redirects included. */
  timeoutMs?: number;
  maxRedirects?: number;
  /**
   * Tests only: hosts (as written in the address) that may be private, and the ports allowed besides 80 and 443, so a
   * test can fetch from a server on this machine. The routes never set these; anything else stays blocked.
   */
  allowHosts?: string[];
  allowPorts?: number[];
}

export interface FetchedPage {
  /** Where it ended up, after redirects. */
  url: string;
  body: Buffer;
  contentType: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_REDIRECTS = 4;
const USER_AGENT = "Mozilla/5.0 (compatible; XendeltaHub-RecipeImport/1.0)";

// ---------- which addresses are public ----------

const v4 = (ip: string): number[] | null => {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const n = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return n.some((x) => Number.isNaN(x) || x > 255) ? null : n;
};

/** [network, prefix length] for IPv4 ranges that are not the public internet. */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, including the cloud metadata address 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, and the broadcast address
];

const inV4Range = (n: number[], [net, bits]: [string, number]) => {
  const base = v4(net)!;
  const toInt = (a: number[]) => ((a[0] << 24) | (a[1] << 16) | (a[2] << 8) | a[3]) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(n) & mask) === (toInt(base) & mask);
};

/** Expand an IPv6 address to its eight 16-bit groups, or null if it isn't one. Handles "::" and a dotted IPv4 tail. */
function expandV6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  let tail: number[] = [];
  const dotted = text.lastIndexOf(":");
  if (text.includes(".") && dotted !== -1) {
    const four = v4(text.slice(dotted + 1));
    if (!four) return null;
    tail = [(four[0] << 8) | four[1], (four[2] << 8) | four[3]];
    text = text.slice(0, dotted + 1) + "0:0";
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (s: string) =>
    s === "" ? [] : s.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - rest.length).fill(0), ...rest] : head;
  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g))) return null;
  if (tail.length) {
    groups[6] = tail[0];
    groups[7] = tail[1];
  }
  return groups;
}

/** True only for an address on the public internet. Anything that can't be read as an address is not public. */
export function isPublicAddress(ip: string): boolean {
  const four = net.isIPv4(ip) ? v4(ip) : null;
  if (four) return !BLOCKED_V4.some((range) => inV4Range(four, range));

  const g = net.isIPv6(ip) ? expandV6(ip) : null;
  if (!g) return false;
  const embedded = (hi: number, lo: number) => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  if (g.every((x) => x === 0)) return false; // ::  (unspecified)
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false; // ::1  (loopback)
  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible): judged by the IPv4 address inside
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0))
    return isPublicAddress(embedded(g[6], g[7]).join("."));
  if (g[0] === 0x64 && g[1] === 0xff9b) return isPublicAddress(embedded(g[6], g[7]).join(".")); // 64:ff9b::/96 (NAT64)
  if (g[0] === 0x2002) return isPublicAddress(embedded(g[1], g[2]).join(".")); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false; // documentation
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return false; // 100::/64 discard
  return true;
}

class BlockedAddressError extends Error {
  constructor() {
    super("That address isn't allowed");
    this.name = "BlockedAddressError";
  }
}

/** A `lookup` for http.request that refuses any name resolving to a non-public address, at connection time. */
export function guardedLookup(allowHosts: string[] = []): net.LookupFunction {
  return (hostname, options, callback) => {
    const wantAll = !!(options as dns.LookupAllOptions).all;
    dns.lookup(hostname, { ...(options as dns.LookupOptions), all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses as dns.LookupAddress[];
      const allowed = allowHosts.includes(hostname);
      if (list.length === 0 || (!allowed && list.some((a) => !isPublicAddress(a.address)))) {
        return callback(new BlockedAddressError(), "", 0);
      }
      if (wantAll) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
      callback(null, list[0].address, list[0].family);
    });
  };
}

// ---------- the address itself ----------

/** Parse and check an address before connecting. Throws AppError(400) with something a person can act on. */
export function checkUrl(raw: string, opts: Pick<FetchOptions, "allowHosts" | "allowPorts"> = {}): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError(400, "That doesn't look like a web address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new AppError(400, "Only web addresses (http or https) work");
  if (url.username || url.password) throw new AppError(400, "That address isn't allowed");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443 && !(opts.allowPorts ?? []).includes(port))
    throw new AppError(400, "That address isn't allowed");
  // An address written as numbers never goes through a name lookup, so it is checked here. new URL has already turned
  // the odd spellings (a single decimal number, hex, octal) into dotted form.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const allowed = (opts.allowHosts ?? []).includes(host);
  if (net.isIP(host) && !allowed && !isPublicAddress(host)) throw new AppError(400, "That address isn't allowed");
  return url;
}

// ---------- fetching ----------

const ACCEPT: Record<FetchKind, string> = {
  html: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
  image: "image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1",
};

const typeOk = (kind: FetchKind, contentType: string) => {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (kind === "html") return type === "text/html" || type === "application/xhtml+xml";
  return type.startsWith("image/") && type !== "image/svg+xml";
};

function decoderFor(encoding: string): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  switch (encoding.trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return zlib.createGunzip();
    case "deflate":
      return zlib.createInflate();
    case "br":
      return zlib.createBrotliDecompress();
    default:
      return null;
  }
}

/** One request, no redirects followed. Resolves with the response (not yet read) or the Location to go to next. */
function request(url: URL, opts: FetchOptions, signal: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: ACCEPT[opts.kind], "Accept-Encoding": "gzip, deflate, br" },
        lookup: guardedLookup(opts.allowHosts),
        signal,
        // A fresh connection each time: nothing is shared with other requests, and nothing outlives this one.
        agent: false,
      },
      resolve,
    );
    req.on("error", reject);
    req.end();
  });
}

/** Read a response body up to `maxBytes` (after decompression). */
async function readBody(res: http.IncomingMessage, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const decoder = decoderFor(String(res.headers["content-encoding"] ?? ""));
  const stream: Readable = decoder ? res.pipe(decoder) : res;
  if (decoder) res.on("error", (e) => decoder.destroy(e));
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      total += (chunk as Buffer).length;
      if (total > maxBytes) throw new AppError(400, "That page is too large");
      chunks.push(chunk as Buffer);
      if (signal.aborted) throw new AppError(400, "That page took too long to answer");
    }
  } finally {
    res.destroy();
    decoder?.destroy();
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch a public web page (or image) by address. Every failure is an AppError(400) whose message is safe to show the
 * person: it says what was wrong without saying anything about this server's network.
 */
export async function fetchPublic(rawUrl: string, opts: FetchOptions): Promise<FetchedPage> {
  const maxRedirects = opts.maxRedirects ?? DEFAULT_REDIRECTS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let url = checkUrl(rawUrl, opts);
    for (let hop = 0; ; hop++) {
      const res = await request(url, opts, controller.signal);
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (hop >= maxRedirects) throw new AppError(400, "That address redirects too many times");
        url = checkUrl(new URL(res.headers.location, url).toString(), opts);
        continue;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        throw new AppError(400, `That page answered with an error (${status})`);
      }
      const contentType = String(res.headers["content-type"] ?? "");
      if (!typeOk(opts.kind, contentType)) {
        res.resume();
        throw new AppError(
          400,
          opts.kind === "html" ? "That address isn't a web page" : "That address isn't a picture",
        );
      }
      const declared = Number(res.headers["content-length"]);
      if (!res.headers["content-encoding"] && Number.isFinite(declared) && declared > opts.maxBytes) {
        res.resume();
        throw new AppError(400, "That page is too large");
      }
      return { url: url.toString(), body: await readBody(res, opts.maxBytes, controller.signal), contentType };
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (controller.signal.aborted) throw new AppError(400, "That page took too long to answer");
    if (err instanceof BlockedAddressError || (err as Error)?.name === "BlockedAddressError") {
      throw new AppError(400, "That address isn't allowed");
    }
    // Resolution, connection or TLS failures: say it couldn't be reached, nothing more.
    throw new AppError(400, "Couldn't reach that address");
  } finally {
    clearTimeout(timer);
  }
}

const HTML_MAX = 2 * 1024 * 1024;
const IMAGE_MAX = 10 * 1024 * 1024;

export const fetchPublicPage = (url: string) => fetchPublic(url, { kind: "html", maxBytes: HTML_MAX });
export const fetchPublicImage = (url: string) => fetchPublic(url, { kind: "image", maxBytes: IMAGE_MAX });

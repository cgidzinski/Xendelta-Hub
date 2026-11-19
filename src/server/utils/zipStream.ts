import type { Readable, Writable } from "stream";
import { once } from "events";

// A small streaming ZIP writer: files are stored (not compressed: photos, PDFs and video barely shrink anyway), written
// one after another straight to the response, so nothing is held in memory however big the folder is. The format uses
// "data descriptors" (sizes and checksum come after each file's bytes), which every unzip tool reads. Plain ZIP has
// 32-bit sizes and 16-bit counts, so a caller keeps a download under MAX_ZIP_BYTES and MAX_ZIP_ENTRIES.

export const MAX_ZIP_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 2000;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of `chunk`, continuing from `crc` (0 to start). */
export function crc32(chunk: Uint8Array, crc = 0): number {
  let c = ~crc >>> 0;
  for (let i = 0; i < chunk.length; i++) c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

/** MS-DOS date and time, as ZIP stores them (two-second resolution, local time is fine for a download). */
function dosDateTime(d: Date) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

interface Finished {
  name: Buffer;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const FLAGS = 0x0808; // bit 3: sizes follow the data; bit 11: the name is UTF-8

export class ZipWriter {
  private offset = 0;
  private readonly entries: Finished[] = [];
  constructor(private readonly out: Writable) {}

  private async write(buf: Buffer): Promise<void> {
    this.offset += buf.length;
    if (!this.out.write(buf)) await once(this.out, "drain");
  }

  /** Add one file: its path inside the zip (with / between folders) and its bytes. */
  async addFile(path: string, data: Readable, modified = new Date()): Promise<void> {
    const name = Buffer.from(path, "utf8");
    const { time, date } = dosDateTime(modified);
    const offset = this.offset;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(FLAGS, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    // crc and both sizes are zero here; the data descriptor carries them
    local.writeUInt16LE(name.length, 26);
    await this.write(Buffer.concat([local, name]));

    let crc = 0;
    let size = 0;
    for await (const chunk of data) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      crc = crc32(buf, crc);
      size += buf.length;
      await this.write(buf);
    }

    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(size, 8); // compressed size = size, since it is stored
    descriptor.writeUInt32LE(size, 12);
    await this.write(descriptor);
    this.entries.push({ name, crc, size, offset, time, date });
  }

  /** Write the index at the end and finish the response. */
  async finish(): Promise<void> {
    const start = this.offset;
    for (const e of this.entries) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      header.writeUInt16LE(20, 4); // made by
      header.writeUInt16LE(20, 6); // version needed
      header.writeUInt16LE(FLAGS, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(e.time, 12);
      header.writeUInt16LE(e.date, 14);
      header.writeUInt32LE(e.crc, 16);
      header.writeUInt32LE(e.size, 20);
      header.writeUInt32LE(e.size, 24);
      header.writeUInt16LE(e.name.length, 28);
      header.writeUInt32LE(e.offset, 42);
      await this.write(Buffer.concat([header, e.name]));
    }
    const size = this.offset - start;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(start, 16);
    await this.write(end);
    this.out.end();
  }
}

/**
 * A safe path for a zip entry: no leading slashes or "..", no backslashes or control characters, and a name that is
 * unique among `taken` (a second "a.txt" in the same folder becomes "a (2).txt").
 */
export function zipPath(parts: string[], taken: Set<string>): string {
  // Backslashes, slashes and control characters (below the space) can't be in an entry name; ".." and "." are only dots.
  const safe = (p: string) =>
    Array.from(p)
      .map((ch) => (ch === "\\" || ch === "/" || ch.charCodeAt(0) < 32 ? "_" : ch))
      .join("");
  const clean = parts.map((p) => {
    const name = safe(p);
    return /^\.+$/.test(name) || name === "" ? "_" : name;
  });
  let path = clean.join("/");
  for (let n = 2; taken.has(path.toLowerCase()); n++) {
    const last = clean[clean.length - 1];
    const dot = last.lastIndexOf(".");
    const renamed = dot > 0 ? `${last.slice(0, dot)} (${n})${last.slice(dot)}` : `${last} (${n})`;
    path = [...clean.slice(0, -1), renamed].join("/");
  }
  taken.add(path.toLowerCase());
  return path;
}

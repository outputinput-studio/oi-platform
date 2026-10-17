import { crc32, deflateRawSync } from "node:zlib";

/**
 * A .zip, written as it goes (Export everything). Node has the pieces —
 * CRC-32 and deflate — so no library: local header, the bytes, and a
 * central directory at the end, as in the PKWARE spec. Text is deflated;
 * photos are stored as they are (they're compressed already). One file is
 * held in memory at a time, so a site with gigabytes of photos streams out
 * without the server holding them all.
 *
 * No Zip64: a single zip stops at 4 GB, which `addFile` refuses past.
 */

const LIMIT = 0xffffffff;

type Entry = { name: Buffer; crc: number; size: number; packed: number; method: number; offset: number; time: number; date: number };

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export class ZipWriter {
  private entries: Entry[] = [];
  private offset = 0;
  private names = new Set<string>();

  constructor(private readonly write: (chunk: Uint8Array) => void | Promise<void>) {}

  /** A unique path inside the zip: "photos/a.jpg", then "photos/a (2).jpg". */
  uniqueName(wanted: string): string {
    // Characters Windows won't have in a name become _, and "", "." and ".." folders go, so nothing unzips outside its folder.
    const clean =
      wanted
        .replace(/[\\:*?"<>|\u0000-\u001f]/g, "_")
        .split("/")
        .filter((part) => part && part !== "." && part !== "..")
        .join("/") || "file";
    let name = clean;
    for (let n = 2; this.names.has(name.toLowerCase()); n++) {
      const dot = clean.lastIndexOf(".");
      name = dot > clean.lastIndexOf("/") ? `${clean.slice(0, dot)} (${n})${clean.slice(dot)}` : `${clean} (${n})`;
    }
    this.names.add(name.toLowerCase());
    return name;
  }

  /** Add one file. `compress`: deflate it (text), or store it as is (photos). Returns the name it went in under. */
  async addFile(wanted: string, data: Uint8Array | string, opts: { compress?: boolean; modified?: Date } = {}): Promise<string> {
    const name = this.uniqueName(wanted);
    const raw = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const deflated = opts.compress ? deflateRawSync(raw) : null;
    const body = deflated && deflated.length < raw.length ? deflated : raw;
    const method = body === raw ? 0 : 8;
    if (this.offset + body.length + 200 > LIMIT) throw new Error("This export is over 4 GB, too big for one file. Ask us and we'll send it in parts.");
    const nameBuf = Buffer.from(name, "utf8");
    const { time, date } = dosTime(opts.modified ?? new Date());
    const entry: Entry = { name: nameBuf, crc: crc32(raw) >>> 0, size: raw.length, packed: body.length, method, offset: this.offset, time, date };

    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); // local file header
    h.writeUInt16LE(20, 4); // version needed
    h.writeUInt16LE(0x0800, 6); // UTF-8 names
    h.writeUInt16LE(method, 8);
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    h.writeUInt32LE(entry.crc, 14);
    h.writeUInt32LE(entry.packed, 18);
    h.writeUInt32LE(entry.size, 22);
    h.writeUInt16LE(nameBuf.length, 26);
    h.writeUInt16LE(0, 28);
    await this.write(h);
    await this.write(nameBuf);
    await this.write(body);
    this.offset += h.length + nameBuf.length + body.length;
    this.entries.push(entry);
    return name;
  }

  /** The central directory: what makes it a zip. Call once, last. */
  async finish(): Promise<void> {
    const start = this.offset;
    for (const e of this.entries) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4); // made by
      c.writeUInt16LE(20, 6); // needed
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(e.method, 10);
      c.writeUInt16LE(e.time, 12);
      c.writeUInt16LE(e.date, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.packed, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.name.length, 28);
      c.writeUInt32LE(e.offset, 42);
      await this.write(c);
      await this.write(e.name);
      this.offset += c.length + e.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(this.offset - start, 12);
    end.writeUInt32LE(start, 16);
    await this.write(end);
  }
}

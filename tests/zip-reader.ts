import { crc32, inflateRawSync } from "node:zlib";

/** Read a zip back from its central directory, checking every CRC — what any unzip tool does. Tests only. */
export function readZip(buf: Buffer): Map<string, Buffer> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("no end of central directory");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central header");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const packed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + packed);
    const data = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    if (data.length !== size) throw new Error(`size mismatch for ${name}`);
    if ((crc32(data) >>> 0) !== crc) throw new Error(`CRC mismatch for ${name}`);
    out.set(name, data);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

/** Collect a ZipWriter's output into one Buffer. */
export function collector(): { write: (c: Uint8Array) => void; bytes: () => Buffer } {
  const parts: Buffer[] = [];
  return { write: (c) => void parts.push(Buffer.from(c)), bytes: () => Buffer.concat(parts) };
}
